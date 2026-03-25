"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { PicassoAnswer } from "@/lib/schema";
import { stopSpeaking, isSpeaking } from "@/lib/narration";
import { getSettings } from "@/hooks/useSettings";
import PhaseDrawingEngine from "./DynamicSVGRenderer";

interface AnswerCardProps {
  answer: PicassoAnswer;
  isStreaming: boolean;
  status: string | null;
  style?: React.CSSProperties;
}

/* Maps status messages to icons and progress phases */
const STATUS_PHASES = [
  { key: "understanding", match: /understanding/i, label: "Understanding your question" },
  { key: "searching", match: /searching/i, label: "Searching the web" },
  { key: "found", match: /found real/i, label: "Found real-time info" },
  { key: "thinking", match: /thinking/i, label: "Thinking" },
  { key: "composing", match: /composing/i, label: "Composing visuals" },
  { key: "drawing", match: /drawing/i, label: "Drawing" },
] as const;

function getPhaseIndex(status: string | null): number {
  if (!status) return 0;
  const idx = STATUS_PHASES.findIndex((p) => p.match.test(status));
  return idx === -1 ? 0 : idx;
}

function LoadingSkeleton({ status, title }: { status: string | null; title: string }) {
  const phaseIdx = getPhaseIndex(status);

  return (
    <div className="answer-card-loading">
      {/* Title area */}
      <div className="answer-card-loading-title">
        {title || "Generating..."}
      </div>

      {/* Status indicator */}
      <div className="answer-card-loading-status">
        {/* Animated icon */}
        <div className="answer-card-loading-icon">
          {phaseIdx <= 1 ? (
            /* Magnifying glass / search */
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          ) : phaseIdx <= 3 ? (
            /* Brain / thinking */
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a4 4 0 0 1 4 4c0 1.1-.9 2-2 2h-4c-1.1 0-2-.9-2-2a4 4 0 0 1 4-4z" />
              <path d="M8 8v1a4 4 0 0 0 8 0V8" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="18" x2="9" y2="22" />
              <line x1="15" y1="18" x2="15" y2="22" />
            </svg>
          ) : (
            /* Pencil / drawing */
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
          )}
        </div>

        {/* Status text */}
        <span className="answer-card-loading-label">
          {status || "Starting up..."}
        </span>
      </div>

      {/* Visual skeleton — abstract shapes hinting at a drawing */}
      <svg className="answer-card-loading-canvas" viewBox="0 0 480 240" fill="none">
        {/* Large background circle */}
        <circle cx="160" cy="120" r="70" className="skeleton-shape" strokeDasharray="6 4" />
        {/* Overlapping rectangle */}
        <rect x="240" y="60" width="140" height="100" rx="8" className="skeleton-shape" strokeDasharray="6 4" style={{ animationDelay: "0.4s" }} />
        {/* Connecting curve */}
        <path d="M 230 120 Q 260 60 300 110" className="skeleton-shape" strokeDasharray="6 4" style={{ animationDelay: "0.8s" }} />
        {/* Small accent circle */}
        <circle cx="340" cy="180" r="24" className="skeleton-shape" strokeDasharray="6 4" style={{ animationDelay: "0.6s" }} />
        {/* Wavy line across */}
        <path d="M 80 200 Q 140 170 200 200 Q 260 230 320 200 Q 380 170 440 200" className="skeleton-shape" strokeDasharray="6 4" style={{ animationDelay: "1.0s" }} />
        {/* Small triangle */}
        <polygon points="100,60 130,20 160,60" className="skeleton-shape" strokeDasharray="6 4" style={{ animationDelay: "0.2s" }} />
      </svg>

    </div>
  );
}

export default function AnswerCard({
  answer,
  isStreaming,
  status,
  style,
}: AnswerCardProps) {
  const [displayStepIndex, setDisplayStepIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isComplete, setIsComplete] = useState(false);
  const processedRef = useRef(-1);
  const readyToAdvanceRef = useRef(false);
  const [subtitleText, setSubtitleText] = useState<string | null>(null);
  const videoIframeRef = useRef<HTMLIFrameElement>(null);

  const steps = answer.answer.steps;
  const step = steps[displayStepIndex];

  // Reset when answer changes
  useEffect(() => {
    console.log(`[AnswerCard] New answer "${answer.id}", title="${answer.answer.title}", ${answer.answer.steps.length} steps`);
    setDisplayStepIndex(0);
    processedRef.current = -1;
    readyToAdvanceRef.current = false;
    setIsComplete(false);
    setIsPlaying(true);
    setSubtitleText(null);
  }, [answer.id, answer.answer.title, answer.answer.steps.length]);

  // Advance when new steps arrive
  useEffect(() => {
    if (readyToAdvanceRef.current && displayStepIndex < steps.length - 1) {
      console.log(`[AnswerCard] Advancing to step ${displayStepIndex + 1}/${steps.length}`);
      readyToAdvanceRef.current = false;
      processedRef.current = -1;
      setDisplayStepIndex((prev) => prev + 1);
    }
  }, [steps.length, displayStepIndex]);

  // Mark complete
  useEffect(() => {
    if (!isStreaming && readyToAdvanceRef.current && displayStepIndex >= steps.length - 1 && steps.length > 0) {
      setIsComplete(true);
      setIsPlaying(false);
    }
  }, [isStreaming, steps.length, displayStepIndex]);

  // Cleanup
  useEffect(() => {
    return () => { stopSpeaking(); };
  }, []);

  // Auto-unmute video when narration finishes, re-mute when it starts
  useEffect(() => {
    const iframe = videoIframeRef.current;
    if (!iframe) return;

    const sendMuteCmd = (mute: boolean) => {
      iframe.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: mute ? "mute" : "unMute", args: [] }),
        "*"
      );
    };

    // Poll until narration stops, then unmute
    const interval = setInterval(() => {
      if (!isSpeaking()) {
        sendMuteCmd(false);
        clearInterval(interval);
      }
    }, 300);

    // While narration is active, keep video muted
    sendMuteCmd(true);

    return () => clearInterval(interval);
  // Re-run whenever the displayed step changes (new narration starts)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayStepIndex, isPlaying]);

  // Subtitle: show narration text when phase changes
  const handlePhaseChange = useCallback((phaseIndex: number) => {
    if (!step) return;
    const phase = step.phases[phaseIndex];
    if (phase?.narration && getSettings().subtitlesEnabled) {
      setSubtitleText(phase.narration);
    }
  }, [step]);

  // Phase drawing complete callback
  const handleDrawingComplete = useCallback(() => {
    console.log(`[AnswerCard] Drawing complete for step ${displayStepIndex + 1}/${steps.length}, isStreaming=${isStreaming}`);
    setSubtitleText(null);
    readyToAdvanceRef.current = true;
    if (displayStepIndex < steps.length - 1) {
      console.log(`[AnswerCard] More steps available — advancing to step ${displayStepIndex + 2}`);
      readyToAdvanceRef.current = false;
      processedRef.current = -1;
      setDisplayStepIndex((prev) => prev + 1);
    } else if (!isStreaming) {
      console.log("[AnswerCard] All steps complete — marking as done");
      setIsComplete(true);
      setIsPlaying(false);
    } else {
      console.log("[AnswerCard] Waiting for more steps from stream...");
    }
  }, [displayStepIndex, steps.length, isStreaming]);

  const togglePlayPause = useCallback(() => {
    if (isComplete) {
      stopSpeaking();
      processedRef.current = -1;
      readyToAdvanceRef.current = false;
      setIsComplete(false);
      setIsPlaying(true);
      setDisplayStepIndex(0);
      return;
    }
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
    }
  }, [isComplete, isPlaying]);

  // Log when step changes
  useEffect(() => {
    if (step) {
      console.log(`[AnswerCard] Displaying step ${displayStepIndex + 1}: ${step.phases.length} phases`, step.phases.map(p => ({ id: p.id, narration: p.narration?.slice(0, 40), strokesLen: p.strokes?.length, camera: p.camera })));
    }
  }, [step, displayStepIndex]);

  if (steps.length === 0) {
    return (
      <div className="answer-card" style={style} data-no-pan>
        <div className="answer-card-body">
          <LoadingSkeleton status={status} title={answer.answer.title} />
        </div>
      </div>
    );
  }

  return (
    <div className="answer-card" style={style} data-no-pan>
      {/* Controls bar */}
      <div className="answer-card-controls">
        <div className="flex items-center gap-2 min-w-0">
          {answer.answer.title && (
            <span className="text-gray-500 text-sm font-medium truncate">{answer.answer.title}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {steps.length > 1 && (
            <div className="flex items-center gap-1.5">
              {steps.map((_, i) => (
                <button key={i}
                  onClick={() => {
                    processedRef.current = -1;
                    readyToAdvanceRef.current = false;
                    stopSpeaking();
                    setDisplayStepIndex(i);
                    setIsComplete(false);
                    setIsPlaying(true);
                  }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${i === displayStepIndex ? "w-6 bg-gray-800" : i < displayStepIndex ? "w-1.5 bg-gray-400" : "w-1.5 bg-gray-200"}`}
                />
              ))}
            </div>
          )}
          <button onClick={togglePlayPause}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 border border-gray-200 transition-all hover:bg-gray-200">
            {isComplete ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 1 9 9" /><polyline points="1 17 3 21 7 19" /></svg>
            ) : isPlaying ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#374151"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="#374151"><polygon points="5 3 19 12 5 21 5 3" /></svg>
            )}
          </button>
        </div>
      </div>

      {/* Drawing area — phase-based renderer fills the entire card */}
      <div className="answer-card-body">
        {/* Background annotation mode: show loading until image + annotations are ready */}
        {step && step.imageMode === "background" && !step.media?.imageUrls?.[0] && (
          <LoadingSkeleton status="Analyzing image..." title={answer.answer.title} />
        )}

        {/* Render drawing engine (skip if background mode still loading) */}
        {step && !(step.imageMode === "background" && !step.media?.imageUrls?.[0]) && (
          <PhaseDrawingEngine
            key={`drawing-${answer.id}-${displayStepIndex}`}
            phases={step.phases}
            isPlaying={isPlaying}
            onPhaseChange={handlePhaseChange}
            onComplete={handleDrawingComplete}
            backgroundImageUrl={step.imageMode === "background" ? step.media?.imageUrls?.[0] : undefined}
          />
        )}

        {/* Media overlay — only in "side" mode (not background annotation mode) */}
        {step?.imageMode !== "background" && step?.media && ((step.media.imageUrls?.length ?? 0) > 0 || step.media.videoId) && (
          <div
            className="absolute top-3 right-3 z-10 flex flex-col gap-2"
            style={{ width: 220, animation: "fade-in 0.5s ease-out" }}
          >
            {/* Up to 2 photos side by side */}
            {(step.media.imageUrls?.length ?? 0) > 0 && (
              <div className={`flex gap-1.5 ${(step.media.imageUrls?.length ?? 0) === 1 ? "" : ""}`}>
                {step.media.imageUrls!.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={url}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={(e) => { (e.currentTarget as HTMLElement).style.display = "none"; }}
                    className="flex-1 min-w-0 rounded-xl object-cover shadow-lg border border-white/20"
                    style={{ height: 120 }}
                  />
                ))}
              </div>
            )}
            {/* YouTube video embed */}
            {step.media.videoId && (
              <div className="rounded-xl overflow-hidden shadow-lg border border-white/20">
                <iframe
                  ref={videoIframeRef}
                  width="320"
                  height="180"
                  src={`https://www.youtube.com/embed/${step.media.videoId}?autoplay=1&mute=1&enablejsapi=1&cc_load_policy=1&rel=0&modestbranding=1`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="block"
                  title={step.media.videoTitle || "Related video"}
                />
              </div>
            )}
          </div>
        )}

        {/* Subtitles (CC) */}
        {subtitleText && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 max-w-[80%] pointer-events-none">
            <div className="rounded-lg bg-black/75 px-4 py-2 text-center text-sm text-white leading-relaxed backdrop-blur-sm">
              {subtitleText}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
