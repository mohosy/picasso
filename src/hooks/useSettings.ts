"use client";

import { useState, useEffect, useCallback } from "react";

export type CanvasPattern = "dots" | "grid" | "none";

export interface AppSettings {
  narrationEnabled: boolean;
  voiceId: string;
  subtitlesEnabled: boolean;
  canvasPattern: CanvasPattern;
  canvasColor: string; // hex color for canvas background
}

const DEFAULTS: AppSettings = {
  narrationEnabled: true,
  voiceId: "21m00Tcm4TlvDq8ikWAM",
  subtitlesEnabled: false,
  canvasPattern: "dots",
  canvasColor: "#f8f9fa",
};

const STORAGE_KEY = "picasso-settings";

function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(settings: AppSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  localStorage.setItem("picasso-voice", settings.voiceId);
}

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULTS);

  useEffect(() => {
    setSettingsState(loadSettings());
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  return { settings, updateSettings };
}

/** Standalone reader for non-React contexts (narration.ts) */
export function getSettings(): AppSettings {
  return loadSettings();
}
