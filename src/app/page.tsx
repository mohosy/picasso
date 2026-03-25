"use client";

import Image from "next/image";
import { useState, useCallback, useEffect, useMemo, useRef, Component, ReactNode } from "react";
import InputBar from "@/components/InputBar";
import AnswerCard from "@/components/SceneStage";
import SettingsModal from "@/components/SettingsModal";
import { useCanvasAnswers } from "@/hooks/useCanvasAnswers";
import { useInfiniteCanvas } from "@/hooks/useInfiniteCanvas";
import { useTheme } from "@/hooks/useTheme";
import { useSettings } from "@/hooks/useSettings";

class SceneErrorBoundary extends Component<
  { children: ReactNode; onReset: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; onReset: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-30 flex items-center justify-center">
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-500/20 bg-red-50 p-8">
            <p className="text-sm text-red-600">Something went wrong rendering the answer.</p>
            <button
              onClick={() => { this.setState({ hasError: false }); this.props.onReset(); }}
              className="rounded-lg bg-red-100 px-4 py-2 text-sm text-red-600 hover:bg-red-200"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const SUGGESTED_QUERIES = [
  "How does photosynthesis work?",
  "What's the weather in Tokyo?",
  "Explain the water cycle",
];

// Card spacing on the canvas
const CARD_WIDTH = 960;
const CARD_GAP = 60;
const FIRST_CARD_Y = 120;
const FIRST_PROMPT_COMMIT_MS = 280;
const CORNER_RABBIT_APPEAR_MS = 760;
const RABBIT_FLIGHT_MS = 760;

export default function Home() {
  const { answers, activeAnswerId, isLoading, isStreaming, status, error, generate, clearAll } =
    useCanvasAnswers();
  const { transform, containerRef, contentRef, panTo } = useInfiniteCanvas();
  const { mode: themeMode, resolved: resolvedTheme, setMode: setThemeMode } = useTheme();
  const { settings, updateSettings } = useSettings();
  const [hasQueried, setHasQueried] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isInitialTransitioning, setIsInitialTransitioning] = useState(false);
  const [showCornerRabbit, setShowCornerRabbit] = useState(false);
  const [landingInputHeight, setLandingInputHeight] = useState(64);
  const [showFlyingRabbit, setShowFlyingRabbit] = useState(false);
  const [isRabbitFlying, setIsRabbitFlying] = useState(false);
  const [rabbitFlight, setRabbitFlight] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    deltaX: number;
    deltaY: number;
    scale: number;
    midX: number;
    midY: number;
    midScale: number;
  } | null>(null);
  const transitionTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const landingInputRef = useRef<HTMLDivElement>(null);
  const landingRabbitRef = useRef<HTMLDivElement>(null);
  const cornerRabbitRef = useRef<HTMLDivElement>(null);

  const clearTransitionTimers = useCallback(() => {
    transitionTimersRef.current.forEach((timer) => clearTimeout(timer));
    transitionTimersRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      clearTransitionTimers();
    };
  }, [clearTransitionTimers]);

  useEffect(() => {
    const element = landingInputRef.current;
    if (!element) return;

    const updateHeight = () => {
      setLandingInputHeight(element.getBoundingClientRect().height);
    };

    updateHeight();

    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const startRabbitFlight = useCallback(() => {
    const start = landingRabbitRef.current?.getBoundingClientRect();
    const end = cornerRabbitRef.current?.getBoundingClientRect();
    if (!start || !end) return;

    setRabbitFlight({
      left: start.left,
      top: start.top,
      width: start.width,
      height: start.height,
      deltaX: end.left - start.left,
      deltaY: end.top - start.top,
      scale: end.width / start.width,
      midX: (end.left - start.left) * 0.42,
      midY: (end.top - start.top) * 0.42 - 34,
      midScale: 1 - (1 - end.width / start.width) * 0.38,
    });
    setShowFlyingRabbit(true);
    setIsRabbitFlying(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setIsRabbitFlying(true);
      });
    });
  }, []);

  // Compute canvas background based on settings
  const canvasStyle = useMemo(() => {
    const bg = settings.canvasColor;
    const isDark = resolvedTheme === "dark";
    const effectiveBg = isDark ? "#111117" : bg;

    // Determine dot/grid color based on canvas lightness
    const isCanvasDark = effectiveBg === "#111117";
    const dotColor = isCanvasDark ? "#2a2a35" : "#d0d5dd";

    let backgroundImage: string;
    switch (settings.canvasPattern) {
      case "dots":
        backgroundImage = `radial-gradient(circle, ${dotColor} 1px, transparent 1px)`;
        break;
      case "grid":
        backgroundImage = `linear-gradient(${dotColor} 1px, transparent 1px), linear-gradient(90deg, ${dotColor} 1px, transparent 1px)`;
        break;
      case "none":
      default:
        backgroundImage = "none";
    }

    return {
      backgroundColor: effectiveBg,
      backgroundImage,
      backgroundSize: settings.canvasPattern === "grid" ? "24px 24px" : "24px 24px",
    } as React.CSSProperties;
  }, [settings.canvasColor, settings.canvasPattern, resolvedTheme]);

  // Calculate card positions (stacked vertically, centered)
  const cardPositions = answers.map((_, i) => ({
    x: 0,
    y: FIRST_CARD_Y + i * (540 + 40 + CARD_GAP), // body + controls + gap
  }));

  // Auto-pan to the latest answer when it starts
  useEffect(() => {
    if (answers.length === 0) return;
    const lastIdx = answers.length - 1;
    const pos = cardPositions[lastIdx];
    if (!pos) return;

    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const cardCenterX = pos.x + CARD_WIDTH / 2;
    const cardCenterY = pos.y + 300;

    panTo(
      viewportW / 2 - cardCenterX * transform.zoom,
      viewportH / 2 - cardCenterY * transform.zoom,
      true
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers.length]);

  const handleSubmit = useCallback(
    (query: string, imageBase64?: string, thinking?: boolean) => {
      if (!hasQueried && !isInitialTransitioning) {
        clearTransitionTimers();
        setIsInitialTransitioning(true);
        setShowCornerRabbit(false);
        startRabbitFlight();

        transitionTimersRef.current.push(
          setTimeout(() => {
            setHasQueried(true);
          }, FIRST_PROMPT_COMMIT_MS)
        );

        transitionTimersRef.current.push(
          setTimeout(() => {
            setShowFlyingRabbit(false);
            setIsRabbitFlying(false);
            setShowCornerRabbit(true);
            setIsInitialTransitioning(false);
          }, CORNER_RABBIT_APPEAR_MS)
        );
      }

      generate(query, imageBase64, thinking);
    },
    [clearTransitionTimers, generate, hasQueried, isInitialTransitioning, startRabbitFlight]
  );

  const handleClearAll = useCallback(() => {
    clearTransitionTimers();
    clearAll();
    setHasQueried(false);
    setIsInitialTransitioning(false);
    setShowCornerRabbit(false);
    setShowFlyingRabbit(false);
    setIsRabbitFlying(false);
    setRabbitFlight(null);
    panTo(0, 0, true);
  }, [clearAll, clearTransitionTimers, panTo]);

  const isLandingSubmitAnimating = isInitialTransitioning && !hasQueried;

  return (
    <>
      {/* Infinite canvas viewport */}
      <div ref={containerRef} className="canvas-viewport" style={canvasStyle}>
        <div
          ref={contentRef}
          className="canvas-content"
          style={{
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.zoom})`,
          }}
        >
          {/* Answer cards on the canvas */}
          <SceneErrorBoundary onReset={handleClearAll}>
            {answers.map((answer, i) => (
              <AnswerCard
                key={answer.id}
                answer={answer}
                isStreaming={isStreaming && answer.id === activeAnswerId}
                status={answer.id === activeAnswerId ? status : null}
                style={{
                  left: cardPositions[i]?.x ?? 0,
                  top: cardPositions[i]?.y ?? 0,
                }}
              />
            ))}
          </SceneErrorBoundary>
        </div>
      </div>

      {/* Fixed UI layer — not affected by canvas transform */}

      {/* Landing title block — fades out */}
      <div
        className="fixed left-1/2 z-10 w-full max-w-xl px-6 pointer-events-none"
        style={{
          opacity: hasQueried ? 0 : 1,
          top: "calc(50% - 248px)",
          transform: "translateX(-50%)",
          transition: "opacity 0.5s ease-out",
        }}
      >
        <header className={`flex flex-col items-center gap-2 text-center ${isLandingSubmitAnimating ? "animate-landing-hero-exit" : ""}`}>
          <div
            className="relative flex items-center justify-center pt-8"
            aria-hidden="true"
            style={{
              opacity: hasQueried || isInitialTransitioning ? 0 : 1,
              transform: hasQueried || isInitialTransitioning
                ? "translateY(14px) scale(0.84) rotate(6deg)"
                : "translateY(0) scale(1) rotate(0deg)",
              transformOrigin: "center bottom",
              transition:
                "opacity 0.2s ease-out, transform 0.28s cubic-bezier(0.32, 1, 0.68, 1)",
            }}
          >
            <div className="pointer-events-none absolute left-[62%] top-0">
              <div className="relative w-[220px] border-[3px] border-black bg-white px-4 py-2.5 text-left shadow-[4px_4px_0_0_#111827]">
                <p className="text-[12px] font-semibold leading-4 tracking-[0.08em] text-black sm:text-[13px] sm:leading-5">
                  Ask anything, watch the answer.
                </p>
                <div
                  className="absolute -bottom-[12px] left-5 h-0 w-0"
                  style={{
                    borderLeft: "10px solid transparent",
                    borderRight: "10px solid transparent",
                    borderTop: "12px solid black",
                  }}
                />
                <div
                  className="absolute -bottom-[8px] left-[23px] h-0 w-0"
                  style={{
                    borderLeft: "7px solid transparent",
                    borderRight: "7px solid transparent",
                    borderTop: "9px solid white",
                  }}
                />
              </div>
            </div>
            <div ref={landingRabbitRef}>
              <Image
                src="/rabbit2.png"
                alt=""
                width={120}
                height={120}
                className="h-[104px] w-[104px] select-none object-contain sm:h-[120px] sm:w-[120px]"
                priority
              />
            </div>
          </div>
          <h1 className="text-3xl tracking-tight text-gray-900 dark:text-gray-100">
            Picasso
          </h1>
        </header>
      </div>

      {showFlyingRabbit && rabbitFlight && (
        <div
          className="fixed z-30 pointer-events-none"
          aria-hidden="true"
          style={{
            left: rabbitFlight.left,
            top: rabbitFlight.top,
            width: rabbitFlight.width,
            height: rabbitFlight.height,
            opacity: showCornerRabbit ? 0 : 1,
            transition: "opacity 180ms ease-out",
            willChange: "transform, opacity",
            ["--rabbit-flight-x" as string]: `${rabbitFlight.deltaX}px`,
            ["--rabbit-flight-y" as string]: `${rabbitFlight.deltaY}px`,
            ["--rabbit-flight-scale" as string]: `${rabbitFlight.scale}`,
            ["--rabbit-flight-mid-x" as string]: `${rabbitFlight.midX}px`,
            ["--rabbit-flight-mid-y" as string]: `${rabbitFlight.midY}px`,
            ["--rabbit-flight-mid-scale" as string]: `${rabbitFlight.midScale}`,
            animation: isRabbitFlying
              ? `rabbit-first-flight ${RABBIT_FLIGHT_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`
              : undefined,
          } as React.CSSProperties}
        >
          <Image
            src="/rabbit2.png"
            alt=""
            width={rabbitFlight.width}
            height={rabbitFlight.height}
            className="h-full w-full select-none object-contain"
            priority
          />
        </div>
      )}

      <div
        className="fixed top-4 left-4 z-20 pointer-events-none"
        aria-hidden="true"
        style={{
          opacity: showCornerRabbit ? 1 : 0,
          transform: showCornerRabbit
            ? "translateY(0) scale(1) rotate(0deg)"
            : "translateY(-12px) scale(0.86) rotate(-10deg)",
          transformOrigin: "top left",
          transition:
            "opacity 0.35s ease-out, transform 0.55s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <div className="flex items-center gap-3">
          <div ref={cornerRabbitRef}>
            <Image
              src="/rabbit2.png"
              alt=""
              width={38}
              height={38}
              className="h-[38px] w-[38px] select-none object-contain sm:h-[44px] sm:w-[44px]"
              priority
            />
          </div>
          <span className="text-xl font-medium tracking-tight text-gray-900 dark:text-gray-100 sm:text-2xl">
            Picasso
          </span>
        </div>
      </div>

      {/* Input bar — single instance, glides from center to top */}
      <div
        className={`fixed left-1/2 z-20 w-full max-w-xl px-4 ${!hasQueried ? "animate-landing-prompt-settle" : ""}`}
        style={{
          top: hasQueried ? 16 : "50%",
          transform: hasQueried
            ? "translateX(-50%)"
            : "translateX(-50%) translateY(-50%)",
          transition:
            "top 0.7s cubic-bezier(0.4, 0, 0.2, 1), transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
        data-no-pan
      >
        <div
          ref={landingInputRef}
          className={isLandingSubmitAnimating ? "animate-first-prompt-launch" : ""}
        >
          <InputBar onSubmit={handleSubmit} isLoading={isLoading || isStreaming} />
        </div>
      </div>

      {!error && !hasQueried && (
        <div
          className="fixed left-1/2 z-10 w-full max-w-4xl px-4 pointer-events-none"
          style={{
            opacity: hasQueried ? 0 : 1,
            top: `calc(50% + ${Math.round(landingInputHeight / 2) + 22}px)`,
            transform: "translateX(-50%)",
            transition: "opacity 0.5s ease-out",
          }}
        >
          <div className="flex items-center justify-center gap-2 overflow-x-auto whitespace-nowrap pointer-events-auto pb-2">
            {SUGGESTED_QUERIES.map((q, index) => (
              <button
                key={q}
                onClick={() => handleSubmit(q)}
                className={`inline-flex shrink-0 items-center rounded-full border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 shadow-sm transition-colors hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 ${isLandingSubmitAnimating ? "animate-landing-chip-exit" : ""}`}
                style={isLandingSubmitAnimating ? { animationDelay: `${index * 55}ms` } : undefined}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error toast */}
      {error && (
        <div
          className="fixed left-1/2 -translate-x-1/2 z-20 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-600 dark:text-red-400 shadow-lg"
          style={{ top: hasQueried ? 76 : "calc(50% + 50px)" }}
          data-no-pan
        >
          {error}
        </div>
      )}

      {/* Controls — top right */}
      <div className="fixed top-4 right-4 z-20 flex items-center gap-2" data-no-pan>
        {hasQueried && (
          <span className="text-xs text-gray-400">{Math.round(transform.zoom * 100)}%</span>
        )}
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-black dark:text-white shadow-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {hasQueried && answers.length > 0 && (
        <div className="fixed bottom-4 left-4 z-20" data-no-pan>
          <button
            onClick={handleClearAll}
            className="rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 shadow-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Settings modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={themeMode}
        onThemeChange={setThemeMode}
        settings={settings}
        onSettingsChange={updateSettings}
      />

    </>
  );
}
