"use client";

import { useState, useEffect, useCallback } from "react";

export type ThemeMode = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(resolved: "light" | "dark") {
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolved);
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>("system");

  // Initialize from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("picasso-theme") as ThemeMode | null;
    if (stored && ["light", "dark", "system"].includes(stored)) {
      setModeState(stored);
      applyTheme(stored === "system" ? getSystemTheme() : stored);
    } else {
      applyTheme(getSystemTheme());
    }
  }, []);

  // Listen for system theme changes when in system mode
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? "dark" : "light");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mode]);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem("picasso-theme", newMode);
    applyTheme(newMode === "system" ? getSystemTheme() : newMode);
  }, []);

  const resolved = mode === "system" ? getSystemTheme() : mode;

  return { mode, resolved, setMode };
}
