// Domain helpers used by the app
export const MONTHS_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function monthRange(year: number, month1to12: number): { start: string; end: string; days: number } {
  const start = new Date(year, month1to12 - 1, 1);
  const end = new Date(year, month1to12, 0);
  return { start: ymd(start), end: ymd(end), days: end.getDate() };
}

export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("pt-PT", { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

export function fmtSecsAsTime(s: number | null | undefined): string {
  if (s == null) return "—";
  const total = Math.round(s);
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function classNames(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(" ");
}

/** Cor estável (hue) gerada a partir do nome — avatares com cor própria. */
export function avatarHue(name: string | null | undefined): number {
  const s = (name ?? "").trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/** Gradiente de avatar por colaborador (cores automáticas e consistentes). */
export function avatarGradient(name: string | null | undefined): string {
  const h = avatarHue(name);
  return `linear-gradient(135deg, hsl(${h} 85% 58%), hsl(${(h + 48) % 360} 85% 48%))`;
}

/** Iniciais do primeiro e último nome (ex: "Ana Silva" → "AS"). */
export function initials(name: string | null | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
