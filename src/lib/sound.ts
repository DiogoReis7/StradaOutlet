// Web Audio helpers (browser only). Safe to import anywhere: nothing runs at module scope.
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tones(freqs: number[], opts?: { gain?: number; dur?: number; step?: number; type?: OscillatorType }) {
  const c = getCtx();
  if (!c) return;
  const gainV = opts?.gain ?? 0.25;
  const dur = opts?.dur ?? 0.35;
  const step = opts?.step ?? 0.08;
  const now = c.currentTime;
  freqs.forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = opts?.type ?? "sine";
    osc.frequency.value = freq;
    const t = now + i * step;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(gainV, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  });
}

/** Nova venda. */
export function chime() {
  tones([880, 1320]);
}

/** Grande venda / marco atingido. */
export function fanfare() {
  tones([660, 880, 1320, 1760], { step: 0.12, dur: 0.45, gain: 0.22 });
}

/** Aviso (ex.: ociosidade). */
export function alertBeep() {
  tones([520, 380], { step: 0.18, dur: 0.3, gain: 0.18, type: "triangle" });
}

/** Desbloqueia o áudio num gesto do utilizador (necessário em iOS/Chrome). */
export function unlockAudio() {
  const c = getCtx();
  if (!c) return;
  void c.resume();
}
