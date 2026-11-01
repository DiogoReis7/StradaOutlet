import { useCallback, useEffect, useState } from "react";
import {
  applyAppearance, readAppearance, writeAppearance,
  type Appearance, type ColorMode, type TextScale,
} from "@/lib/appearance";
import type { ThemeId } from "@/lib/theme";

const EVENT = "ls-appearance-change";

/** Aplica a aparência guardada (chamar uma vez na shell). */
export function useAppearanceBoot() {
  useEffect(() => {
    applyAppearance(readAppearance());
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onSystem = () => {
      const a = readAppearance();
      if (a.mode === "system") applyAppearance(a);
    };
    mq?.addEventListener?.("change", onSystem);
    return () => mq?.removeEventListener?.("change", onSystem);
  }, []);
}

export function useAppearance() {
  const [appearance, setAppearance] = useState<Appearance>(() => readAppearance());

  useEffect(() => {
    const sync = () => setAppearance(readAppearance());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const update = useCallback((patch: Partial<Appearance>) => {
    setAppearance((prev) => {
      const next = { ...prev, ...patch };
      writeAppearance(next);
      applyAppearance(next);
      window.dispatchEvent(new Event(EVENT));
      return next;
    });
  }, []);

  const setMode = useCallback((mode: ColorMode) => update({ mode }), [update]);
  const setDarkTheme = useCallback((darkTheme: ThemeId) => update({ darkTheme }), [update]);
  const setTextScale = useCallback((textScale: TextScale) => update({ textScale }), [update]);
  const setHighContrast = useCallback((highContrast: boolean) => update({ highContrast }), [update]);
  const setReduceMotion = useCallback((reduceMotion: boolean) => update({ reduceMotion }), [update]);

  const toggleMode = useCallback(() => {
    setAppearance((prev) => {
      const isDarkNow = prev.mode === "light" ? false : true;
      const next: Appearance = { ...prev, mode: isDarkNow ? "light" : "dark" };
      writeAppearance(next);
      applyAppearance(next);
      window.dispatchEvent(new Event(EVENT));
      return next;
    });
  }, []);

  return { appearance, setMode, setDarkTheme, setTextScale, setHighContrast, setReduceMotion, toggleMode };
}
