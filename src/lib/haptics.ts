// Feedback tátil leve (só em dispositivos que suportam vibração).
type Pattern = "tap" | "success" | "warn";

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 10,
  success: [12, 40, 12],
  warn: [24, 60, 24],
};

export function haptic(kind: Pattern = "tap") {
  if (typeof navigator === "undefined") return;
  try {
    navigator.vibrate?.(PATTERNS[kind]);
  } catch {
    /* ignorado */
  }
}
