"use client";

import { type ReactNode, useState, useRef, useEffect, useCallback } from "react";
import { ThemeMode } from "@/hooks/useTheme";
import { AppSettings, CanvasPattern } from "@/hooks/useSettings";

/* ═══════════════════════════════════════
   Props
   ═══════════════════════════════════════ */

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  settings: AppSettings;
  onSettingsChange: (patch: Partial<AppSettings>) => void;
}

/* ═══════════════════════════════════════
   Constants
   ═══════════════════════════════════════ */

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: ReactNode }[] = [
  {
    value: "light",
    label: "Light",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </svg>
    ),
  },
  {
    value: "dark",
    label: "Dark",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
  {
    value: "system",
    label: "System",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
];

const PATTERN_OPTIONS: { value: CanvasPattern; label: string }[] = [
  { value: "dots", label: "Dots" },
  { value: "grid", label: "Grid" },
  { value: "none", label: "None" },
];

const CANVAS_COLORS = [
  { value: "#f8f9fa", label: "White" },
  { value: "#f0f0f0", label: "Light gray" },
  { value: "#fef9ef", label: "Warm" },
  { value: "#f0f4f8", label: "Cool" },
  { value: "#f5f0eb", label: "Sand" },
  { value: "#111117", label: "Charcoal" },
];

const VOICE_OPTIONS = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", tag: "Calm" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella", tag: "Soft" },
  { id: "MF3mGyEYCl7XYWbV9V6O", name: "Elli", tag: "Friendly" },
  { id: "jsCqWAovK2LkecY7zXl4", name: "Freya", tag: "Expressive" },
  { id: "ErXwobaYiN019PkySvjV", name: "Antoni", tag: "Warm" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh", tag: "Deep" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam", tag: "Resonant" },
];

const PREVIEW_TEXT = "Hello! I'm your Picasso narrator. Here's how I sound.";

/* ═══════════════════════════════════════
   Reusable sub-components
   ═══════════════════════════════════════ */

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
        enabled ? "bg-gray-900 dark:bg-white" : "bg-gray-200 dark:bg-gray-700"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white dark:bg-gray-900 transition-transform ${
          enabled ? "translate-x-[18px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-gray-800 dark:text-gray-200">{label}</div>
        {description && <div className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{description}</div>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 pt-1 pb-0.5">
      <span className="text-gray-400 dark:text-gray-500">{icon}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{title}</span>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-gray-100 dark:border-gray-800 my-2" />;
}

/* ═══════════════════════════════════════
   Segmented Control
   ═══════════════════════════════════════ */

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
            value === opt.value
              ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════
   Main Component
   ═══════════════════════════════════════ */

export default function SettingsModal({
  isOpen,
  onClose,
  theme,
  onThemeChange,
  settings,
  onSettingsChange,
}: SettingsModalProps) {
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    setPreviewingVoice(null);
    setLoadingVoice(null);
    onClose();
  }, [onClose]);

  const handlePreview = useCallback(async (voiceId: string) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }

    if (previewingVoice === voiceId) {
      setPreviewingVoice(null);
      setLoadingVoice(null);
      return;
    }

    setLoadingVoice(voiceId);

    try {
      const response = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: PREVIEW_TEXT, voiceId }),
      });

      if (!response.ok) {
        setLoadingVoice(null);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      previewAudioRef.current = audio;

      audio.onended = () => {
        setPreviewingVoice(null);
        setLoadingVoice(null);
        URL.revokeObjectURL(url);
        previewAudioRef.current = null;
      };

      setPreviewingVoice(voiceId);
      setLoadingVoice(null);
      await audio.play();
    } catch {
      setPreviewingVoice(null);
      setLoadingVoice(null);
    }
  }, [previewingVoice]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none" data-no-pan>
      <div
        className="absolute inset-0 pointer-events-auto animate-settings-overlay-in"
        onClick={handleClose}
      >
        <div className="absolute inset-0 bg-black/12 backdrop-blur-[1px]" />
      </div>

      <div
        className="pointer-events-auto absolute right-4 top-16 w-[min(24rem,calc(100vw-1.5rem))] origin-top-right overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl animate-settings-panel-in dark:border-gray-800 dark:bg-gray-900"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Settings</h2>
          <button
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-6 pb-6 max-h-[70vh] overflow-y-auto">

          {/* ── Appearance ── */}
          <SectionHeader
            title="Appearance"
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>}
          />

          {/* Theme */}
          <div className="py-3">
            <div className="text-[13px] font-medium text-gray-800 dark:text-gray-200 mb-2">Theme</div>
            <SegmentedControl options={THEME_OPTIONS} value={theme} onChange={onThemeChange} />
          </div>

          {/* Canvas pattern */}
          <div className="py-3">
            <div className="text-[13px] font-medium text-gray-800 dark:text-gray-200 mb-2">Canvas pattern</div>
            <SegmentedControl options={PATTERN_OPTIONS} value={settings.canvasPattern} onChange={(v) => onSettingsChange({ canvasPattern: v })} />
          </div>

          {/* Canvas color */}
          <div className="py-3">
            <div className="text-[13px] font-medium text-gray-800 dark:text-gray-200 mb-2">Canvas color</div>
            <div className="flex gap-2">
              {CANVAS_COLORS.map((c) => {
                const isSelected = settings.canvasColor === c.value;
                const isDark = c.value === "#111117";
                return (
                  <button
                    key={c.value}
                    onClick={() => onSettingsChange({ canvasColor: c.value })}
                    className={`group relative flex h-8 w-8 items-center justify-center rounded-full transition-all ${
                      isSelected ? "ring-2 ring-gray-900 dark:ring-white ring-offset-2 ring-offset-white dark:ring-offset-gray-900" : "hover:scale-110"
                    }`}
                    title={c.label}
                  >
                    <span
                      className={`h-full w-full rounded-full border ${isDark ? "border-gray-600" : "border-gray-200 dark:border-gray-600"}`}
                      style={{ backgroundColor: c.value }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <Divider />

          {/* ── Narration ── */}
          <SectionHeader
            title="Narration"
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>}
          />

          <SettingRow label="Voice narration" description="Read answers aloud using ElevenLabs">
            <Toggle enabled={settings.narrationEnabled} onChange={(v) => onSettingsChange({ narrationEnabled: v })} />
          </SettingRow>

          <SettingRow label="Subtitles (CC)" description="Show captions for narrated text">
            <Toggle enabled={settings.subtitlesEnabled} onChange={(v) => onSettingsChange({ subtitlesEnabled: v })} />
          </SettingRow>

          {/* Voice picker — only shown when narration is on */}
          {settings.narrationEnabled && (
            <div className="py-3">
              <div className="text-[13px] font-medium text-gray-800 dark:text-gray-200 mb-2">Voice</div>
              <div className="grid grid-cols-2 gap-1.5">
                {VOICE_OPTIONS.map((voice) => {
                  const isSelected = settings.voiceId === voice.id;
                  const isPreviewing = previewingVoice === voice.id;
                  const isLoading = loadingVoice === voice.id;

                  return (
                    <div
                      key={voice.id}
                      onClick={() => onSettingsChange({ voiceId: voice.id })}
                      className={`group flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer transition-all ${
                        isSelected
                          ? "bg-gray-900 dark:bg-white"
                          : "bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className={`text-[13px] font-medium leading-tight ${
                          isSelected ? "text-white dark:text-gray-900" : "text-gray-700 dark:text-gray-300"
                        }`}>
                          {voice.name}
                        </div>
                        <div className={`text-[11px] leading-tight mt-0.5 ${
                          isSelected ? "text-gray-400 dark:text-gray-500" : "text-gray-400 dark:text-gray-500"
                        }`}>
                          {voice.tag}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePreview(voice.id); }}
                        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full transition-all ${
                          isSelected
                            ? "text-white/70 hover:text-white dark:text-gray-900/70 dark:hover:text-gray-900 hover:bg-white/10 dark:hover:bg-gray-900/10"
                            : "text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 opacity-0 group-hover:opacity-100"
                        } ${isSelected ? "opacity-100" : ""}`}
                        title={`Preview ${voice.name}`}
                      >
                        {isLoading ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" className="animate-spin" fill="none" stroke="currentColor" strokeWidth="3">
                            <circle cx="12" cy="12" r="10" opacity="0.25" />
                            <path d="M4 12a8 8 0 018-8" opacity="0.75" />
                          </svg>
                        ) : isPreviewing ? (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                          </svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
