"use client";

import { useEffect, useRef, useCallback } from "react";
import gsap from "gsap";
import { DrawingPhase } from "@/lib/schema";
import { preloadNarration, playNarration, stopSpeaking, pauseSpeaking, resumeSpeaking } from "@/lib/narration";

interface PhaseDrawingEngineProps {
  phases: DrawingPhase[];
  isPlaying: boolean;
  onPhaseChange?: (phaseIndex: number) => void;
  onComplete?: () => void;
  backgroundImageUrl?: string;
}

// Estimate narration duration from word count — fast pacing for snappy playback
function estimateDuration(narration: string): number {
  const words = narration.trim().split(/\s+/).length;
  return Math.max(1.6, words * 0.22);
}

// Compute camera transform from a focus region to fit in 800x400 viewport
function cameraTransform(region: { x: number; y: number; width: number; height: number }): { tx: number; ty: number; s: number } {
  const vw = 800, vh = 400;
  let s = Math.min(vw / region.width, vh / region.height);
  s = Math.min(s, 3.0);
  s = Math.max(s, 0.8);
  const cx = region.x + region.width / 2;
  const cy = region.y + region.height / 2;
  const tx = vw / 2 - cx * s;
  const ty = vh / 2 - cy * s;
  return { tx, ty, s };
}

export default function PhaseDrawingEngine({
  phases,
  isPlaying,
  onPhaseChange,
  onComplete,
  backgroundImageUrl,
}: PhaseDrawingEngineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const contentGroupRef = useRef<SVGGElement>(null);
  const cameraGroupRef = useRef<SVGGElement>(null);
  const masterTlRef = useRef<gsap.core.Timeline | null>(null);
  // Camera state as a mutable object for GSAP to tween
  const camStateRef = useRef({ tx: 0, ty: 0, s: 1 });

  const phasesKey = phases.map(p => p.id).join("|");

  // Apply camera transform from camStateRef to the SVG <g> element
  const applyCameraTransform = useCallback(() => {
    const g = cameraGroupRef.current;
    if (!g) return;
    const { tx, ty, s } = camStateRef.current;
    g.setAttribute("transform", `translate(${tx}, ${ty}) scale(${s})`);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      masterTlRef.current?.kill();
      masterTlRef.current = null;
      stopSpeaking();
    };
  }, []);

  // Play/pause
  useEffect(() => {
    const tl = masterTlRef.current;
    if (!tl) return;
    if (isPlaying) {
      tl.resume();
      resumeSpeaking();
    } else {
      tl.pause();
      pauseSpeaking();
    }
  }, [isPlaying]);

  // Build the master timeline
  useEffect(() => {
    if (!svgRef.current || !contentGroupRef.current || !cameraGroupRef.current) {
      return;
    }
    if (phases.length === 0) {
      return;
    }

    // Kill previous timeline
    masterTlRef.current?.kill();
    masterTlRef.current = null;
    stopSpeaking();

    // Clear drawing
    contentGroupRef.current.innerHTML = "";

    // Reset camera
    camStateRef.current = { tx: 0, ty: 0, s: 1 };
    applyCameraTransform();

    // Preload all narration
    phases.forEach(phase => {
      if (phase.narration) {
        preloadNarration(phase.id, phase.narration);
      }
    });

    // Pre-create all SVG phase groups (hidden via strokeDashoffset)
    interface PhaseElements {
      group: SVGGElement;
      geoEls: { el: SVGGeometryElement; pathLength: number }[];
      textEls: SVGTextElement[];
    }

    const phaseData: PhaseElements[] = phases.map((phase) => {
      const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
      group.setAttribute("data-phase", phase.id);
      group.innerHTML = phase.strokes;
      contentGroupRef.current!.appendChild(group);

      const geoEls: PhaseElements["geoEls"] = [];
      const rawGeo = group.querySelectorAll("path, line, circle, rect, ellipse, polygon, polyline");
      rawGeo.forEach(el => {
        const elem = el as SVGElement & SVGGeometryElement;
        // Force round caps/joins
        elem.setAttribute("stroke-linecap", "round");
        elem.setAttribute("stroke-linejoin", "round");

        let pathLength = 0;
        try { pathLength = elem.getTotalLength(); } catch { /* skip */ }

        if (pathLength > 0) {
          // Hide stroke initially
          elem.style.strokeDasharray = `${pathLength}`;
          elem.style.strokeDashoffset = `${pathLength}`;
          geoEls.push({ el: elem, pathLength });
        }
      });

      const textEls: SVGTextElement[] = [];
      group.querySelectorAll("text").forEach(el => {
        const textEl = el as SVGTextElement;
        textEl.style.opacity = "0";
        textEl.style.fontFamily = "var(--font-sophiecomic), cursive";
        textEls.push(textEl);
      });

      return { group, geoEls, textEls };
    });

    // Build master timeline with ALL animations
    const master = gsap.timeline({
      paused: !isPlaying,
      onComplete: () => {
        onComplete?.();
      },
    });
    masterTlRef.current = master;

    phases.forEach((phase, phaseIndex) => {
      const phaseDuration = estimateDuration(phase.narration);
      const cam = phase.camera || { x: 0, y: 0, width: 800, height: 400 };
      const { tx, ty, s } = cameraTransform(cam);
      const pd = phaseData[phaseIndex];

      // --- Camera transition ---
      if (phaseIndex === 0) {
        master.call(() => {
          camStateRef.current.tx = tx;
          camStateRef.current.ty = ty;
          camStateRef.current.s = s;
          applyCameraTransform();
        });
      } else {
        master.to(camStateRef.current, {
          tx,
          ty,
          s,
          duration: 0.35,
          ease: "power2.inOut",
          onUpdate: applyCameraTransform,
        });
      }

      // Mark the position where stroke animations start
      const strokeAnimStart = master.duration();

      // --- Phase change callback + narration ---
      master.call(() => {
        onPhaseChange?.(phaseIndex);
        if (phase.narration) playNarration(phase.id);
      });

      // --- Stroke animations (parallel batches of ~3) ---
      const strokeCount = pd.geoEls.length;
      // Tight stagger so 3+ strokes draw simultaneously
      const staggerWindow = phaseDuration * 0.3;
      const perStrokeDraw = phaseDuration * 0.5;

      pd.geoEls.forEach(({ el, pathLength }, i) => {
        const staggerDelay = strokeCount > 1
          ? (i / (strokeCount - 1)) * staggerWindow
          : 0;

        const absStart = strokeAnimStart + staggerDelay;

        // Add stroke animation to master timeline
        master.to(el, {
          strokeDashoffset: 0,
          duration: perStrokeDraw,
          ease: "power1.inOut",
        }, absStart);

        // If element has fill and fill-opacity > 0, reveal it at 60% through stroke
        const fill = el.getAttribute("fill");
        const fillOpacity = parseFloat(el.getAttribute("fill-opacity") || "0");
        if (fill && fill !== "none" && fillOpacity > 0) {
          el.setAttribute("fill-opacity", "0");
          master.to(el, {
            attr: { "fill-opacity": fillOpacity },
            duration: perStrokeDraw * 0.4,
            ease: "power2.out",
          }, absStart + perStrokeDraw * 0.6);
        }
      });

      // --- Text labels fade in ---
      pd.textEls.forEach((el, i) => {
        const textDelay = strokeAnimStart + phaseDuration * 0.5 + i * 0.2;
        master.to(el, {
          opacity: 1,
          duration: 0.5,
          ease: "power2.out",
        }, textDelay);
      });

      // --- Advance timeline position to end of this phase ---
      const phaseEnd = strokeAnimStart + phaseDuration;
      if (master.duration() < phaseEnd) {
        master.to({}, { duration: 0 }, phaseEnd);
      }

      // --- Gap between phases ---
      if (phaseIndex < phases.length - 1) {
        master.to({}, { duration: 0.15 }, phaseEnd);
      }
    });

    // --- Final zoom out ---
    master.to(camStateRef.current, {
      tx: 0,
      ty: 0,
      s: 1,
      duration: 0.8,
      ease: "power3.out",
      onUpdate: applyCameraTransform,
    });

    // Cleanup: kill timeline so StrictMode remount rebuilds it
    return () => {
      master.kill();
      masterTlRef.current = null;
      stopSpeaking();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phasesKey, phases]);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 800 400"
      className="absolute inset-0 w-full h-full"
      preserveAspectRatio="xMidYMid meet"
      style={{ background: "transparent" }}
    >
      {/* Camera group — animated transform for zoom/pan */}
      <g ref={cameraGroupRef}>
        {/* Background image — when annotating a real photo */}
        {backgroundImageUrl && (
          <>
            <image
              href={backgroundImageUrl}
              x="0" y="0" width="800" height="400"
              preserveAspectRatio="xMidYMid slice"
            />
            {/* Slight overlay for annotation contrast */}
            <rect x="0" y="0" width="800" height="400" fill="black" opacity="0.06" />
          </>
        )}
        {/* Content group — all phase strokes accumulate here */}
        <g ref={contentGroupRef} />
      </g>
    </svg>
  );
}
