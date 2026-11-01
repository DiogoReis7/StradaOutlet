import { applyTheme, getTheme, setThemeForUser, THEMES, type ThemeId } from "@/lib/theme";

export type ColorMode = "light" | "dark" | "system";
export type TextScale = 100 | 110 | 120 | 130;

export type Appearance = {
  mode: ColorMode;
  /** Tema escuro preferido (usado quando o modo é escuro/sistema). */
  darkTheme: ThemeId;
  textScale: TextScale;
  highContrast: boolean;
  reduceMotion: boolean;
};

const KEY = "ls-appearance";

export const DEFAULT_APPEARANCE: Appearance = {
  mode: "dark",
  darkTheme: "neon",
  textScale: 100,
  highContrast: false,
  reduceMotion: false,
};

export function readAppearance(): Appearance {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = localStorage.getItem(KEY);
    const stored = getTheme(null);
    const base: Appearance = {
      ...DEFAULT_APPEARANCE,
      mode: stored === "light" ? "light" : "dark",
      darkTheme: stored === "light" ? "neon" : stored,
    };
    if (!raw) return base;
    const p = JSON.parse(raw) as Partial<Appearance>;
    return {
      mode: p.mode ?? base.mode,
      darkTheme: p.darkTheme ?? base.darkTheme,
      textScale: (p.textScale as TextScale) ?? DEFAULT_APPEARANCE.textScale,
      highContrast: p.highContrast ?? false,
      reduceMotion: p.reduceMotion ?? false,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function writeAppearance(a: Appearance, sync = true) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {}
  if (sync) void import("@/lib/settings-sync").then((m) => m.pushAppearance(a));
}

export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function isLightCompatible(id: ThemeId): boolean {
  return THEMES.find((t) => t.id === id)?.lightCompatible === true;
}

/** Se o pedido for modo claro e o tema escolhido for compatível com
 *  modo claro (ex.: Esmeralda), mantém-se esse tema — só os temas
 *  "normais" revertem para o Claro genérico em modo claro. */
export function resolvedThemeId(a: Appearance): ThemeId {
  const wantsLight = a.mode === "light" || (a.mode === "system" && !systemPrefersDark());
  if (wantsLight) {
    return isLightCompatible(a.darkTheme) ? a.darkTheme : "light";
  }
  return a.darkTheme === "light" ? "neon" : a.darkTheme;
}

export function applyAppearance(a: Appearance, userId?: string | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const theme = resolvedThemeId(a);
  const wantsLight = a.mode === "light" || (a.mode === "system" && !systemPrefersDark());
  applyTheme(theme);
  // Corrige a classe "dark": applyTheme só sabe escurecer com base no id do
  // tema, mas um tema compatível com modo claro (ex.: Esmeralda) pode
  // precisar de ficar claro mesmo com um id que não é "light".
  root.classList.toggle("dark", !wantsLight);
  if (userId !== undefined) setThemeForUser(userId ?? null, theme);
  root.style.setProperty("--app-text-scale", `${a.textScale}%`);
  root.setAttribute("data-contrast", a.highContrast ? "alto" : "normal");
  root.setAttribute("data-motion", a.reduceMotion ? "reduzido" : "normal");
}
