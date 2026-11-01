// Ociosidade (idle time) helpers — calculados a partir das senhas do SGF.
import { isMedicalLeave } from "@/lib/shift-state";

export type IdleTicket = {
  employee_id: string | null;
  emitida_em: string;
  inicio_em: string | null;
  fim_em: string | null;
  estado: string | null;
  /** Fallback: segundos de espera desde a emissão (usado quando não há inicio_em). */
  espera_s?: number | null;
  /** Fallback: duração do atendimento em segundos (usado quando não há fim_em). */
  atendimento_s?: number | null;
};

/**
 * Início/fim do atendimento. Se o SGF não exportou inicio_em/fim_em,
 * derivamos: início = emitida_em + espera_s, fim = início + atendimento_s.
 */
export function ticketWindow(t: IdleTicket): { startMs: number; endMs: number } | null {
  let startMs = t.inicio_em ? new Date(t.inicio_em).getTime() : NaN;
  let endMs = t.fim_em ? new Date(t.fim_em).getTime() : NaN;

  if (isNaN(startMs)) {
    const emit = t.emitida_em ? new Date(t.emitida_em).getTime() : NaN;
    if (isNaN(emit)) return null;
    startMs = emit + Math.max(0, Number(t.espera_s) || 0) * 1000;
  }
  if (isNaN(endMs)) {
    const dur = Math.max(0, Number(t.atendimento_s) || 0) * 1000;
    endMs = startMs + dur;
  }
  if (isNaN(startMs) || isNaN(endMs) || endMs < startMs) return null;
  return { startMs, endMs };
}

/** Alerta quando um colaborador está há mais de X minutos sem atender. */
export const IDLE_ALERT_MIN = 10;
/** Intervalos maiores que isto são considerados pausa/almoço e ignorados na média. */
export const IDLE_MAX_GAP_MIN = 90;

export type IdleStats = {
  employeeId: string;
  atendimentos: number;
  /** Soma dos intervalos entre atendimentos (segundos), ignorando pausas longas. */
  idleTotalS: number;
  /** Média de tempo morto entre atendimentos (segundos). */
  idleAvgS: number;
  /** Maior intervalo considerado (segundos). */
  idleMaxS: number;
  /** Fim do último atendimento (ms epoch) ou null. */
  lastEndMs: number | null;
  /** Tempo morto na manhã / tarde (segundos). */
  manhaS: number;
  tardeS: number;
};

const ms = (s: string | null) => (s ? new Date(s).getTime() : NaN);

function isDone(t: IdleTicket) {
  return (t.estado ?? "").toLowerCase() === "terminada";
}

/**
 * Calcula ociosidade por colaborador a partir de senhas terminadas.
 * Intervalo = tempo entre o fim de um atendimento e o início do seguinte, no mesmo dia.
 */
export function computeIdle(tickets: IdleTicket[], maxGapMin = IDLE_MAX_GAP_MIN): Map<string, IdleStats> {
  const byEmp = new Map<string, IdleTicket[]>();
  for (const t of tickets) {
    if (!t.employee_id || !isDone(t)) continue;
    if (!ticketWindow(t)) continue;
    const arr = byEmp.get(t.employee_id) ?? [];
    arr.push(t);
    byEmp.set(t.employee_id, arr);
  }

  const out = new Map<string, IdleStats>();
  const cap = maxGapMin * 60;

  for (const [employeeId, arr] of byEmp) {
    arr.sort((a, b) => (ticketWindow(a)?.startMs ?? 0) - (ticketWindow(b)?.startMs ?? 0));
    let idleTotalS = 0;
    let idleMaxS = 0;
    let manhaS = 0;
    let tardeS = 0;
    let count = 0;
    let lastEndMs: number | null = null;

    for (let i = 0; i < arr.length; i++) {
      const w = ticketWindow(arr[i]);
      if (!w) continue;
      const start = w.startMs;
      const end = w.endMs;
      if (lastEndMs != null) {
        const prevDay = new Date(lastEndMs).toDateString();
        const curDay = new Date(start).toDateString();
        if (prevDay === curDay) {
          const gap = Math.max(0, Math.round((start - lastEndMs) / 1000));
          if (gap <= cap) {
            idleTotalS += gap;
            count++;
            if (gap > idleMaxS) idleMaxS = gap;
            const h = new Date(lastEndMs).getHours();
            if (h < 13) manhaS += gap;
            else tardeS += gap;
          }
        }
      }
      lastEndMs = Math.max(lastEndMs ?? 0, end);
    }

    out.set(employeeId, {
      employeeId,
      atendimentos: arr.length,
      idleTotalS,
      idleAvgS: count ? Math.round(idleTotalS / count) : 0,
      idleMaxS,
      lastEndMs,
      manhaS,
      tardeS,
    });
  }

  return out;
}

/** Minutos desde o último atendimento (null se nunca atendeu). */
export function minutesSinceLast(stats: IdleStats | undefined, now = Date.now()): number | null {
  if (!stats?.lastEndMs) return null;
  return Math.max(0, Math.round((now - stats.lastEndMs) / 60000));
}

export function fmtDur(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`;
  if (m > 0) return `${m}m${String(sec).padStart(2, "0")}`;
  return `${sec}s`;
}

// ---------------------------------------------------------------------------
// Configuração ajustável + análise detalhada (por dia / período)
// ---------------------------------------------------------------------------

export type IdleConfig = {
  /** Intervalos acima disto são considerados pausa e ignorados. */
  maxGapMin: number;
  /** Minutos sem atender que disparam alerta. */
  alertMin: number;
  /** Hora de corte entre manhã e tarde (0-23). */
  splitHour: number;
  /** Hora de abertura da loja. */
  openHour: number;
  /** Hora de fecho da loja. */
  closeHour: number;
  /** Descontar automaticamente o almoço escalado no horário. */
  excluirAlmoco: boolean;
  /** Descontar os slots de telemarketing marcados como feitos. */
  excluirTele: boolean;
};

export const DEFAULT_IDLE_CONFIG: IdleConfig = {
  maxGapMin: IDLE_MAX_GAP_MIN,
  alertMin: IDLE_ALERT_MIN,
  splitHour: 13,
  openHour: 9,
  closeHour: 23,
  excluirAlmoco: true,
  excluirTele: true,
};

/** Janela de almoço (ms epoch) extraída do horário: "09:45-18:45 (14:00-15:00)". */
export type LunchWindow = { startMs: number; endMs: number };

export function parseLunch(descricao: string | null | undefined, isoDate: string): LunchWindow | null {
  if (!descricao) return null;
  const m = descricao.match(/\((\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\)/);
  if (!m) return null;
  const [y, mo, d] = isoDate.split("-").map(Number);
  if (!y || !mo || !d) return null;
  const start = new Date(y, mo - 1, d, Number(m[1]), Number(m[2]), 0, 0).getTime();
  let end = new Date(y, mo - 1, d, Number(m[3]), Number(m[4]), 0, 0).getTime();
  if (end <= start) end += 24 * 3600_000;
  return { startMs: start, endMs: end };
}

/** Sobreposição (segundos) entre [a1,a2] e [b1,b2]. */
function overlapS(a1: number, a2: number, b1: number, b2: number) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1)) / 1000;
}

type Interval = { startMs: number; endMs: number };

/** Interseção de [a1,a2] com uma lista de janelas. */
function intersectAll(a1: number, a2: number, wins: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const w of wins) {
    const s = Math.max(a1, w.startMs);
    const e = Math.min(a2, w.endMs);
    if (e > s) out.push({ startMs: s, endMs: e });
  }
  return out;
}

/** Remove uma janela de uma lista de intervalos. */
function subtractWindow(list: Interval[], w: Interval): Interval[] {
  const out: Interval[] = [];
  for (const iv of list) {
    if (w.endMs <= iv.startMs || w.startMs >= iv.endMs) { out.push(iv); continue; }
    if (w.startMs > iv.startMs) out.push({ startMs: iv.startMs, endMs: w.startMs });
    if (w.endMs < iv.endMs) out.push({ startMs: w.endMs, endMs: iv.endMs });
  }
  return out;
}

const sumS = (list: Interval[]) => list.reduce((acc, iv) => acc + (iv.endMs - iv.startMs) / 1000, 0);

/** Janelas de contabilização de ociosidade (12h-14h e 15h-19h) para um dia ISO. */
export function idleWindowsForDay(iso: string): Interval[] {
  const [y, mo, d] = iso.split("-").map(Number);
  if (!y || !mo || !d) return [];
  return TELE_WINDOWS.map(([a, b]) => ({
    startMs: new Date(y, mo - 1, d, a, 0, 0, 0).getTime(),
    endMs: new Date(y, mo - 1, d, b, 0, 0, 0).getTime(),
  }));
}


export type IdlePeriod = { idleS: number; count: number; maxS: number };
export type IdleDayRow = {
  employeeId: string;
  iso: string;
  atendimentos: number;
  manha: IdlePeriod;
  tarde: IdlePeriod;
  totalS: number;
  count: number;
  maxS: number;
  avgS: number;
  /** Segundos de almoço descontados dos intervalos. */
  almocoS: number;
  /** Segundos de telemarketing (slots feitos) descontados dos intervalos. */
  teleS: number;
  /** Segundos entre o 1.º início e o último fim (menos almoço). */
  janelaS: number;
  /** Segundos efetivamente em atendimento. */
  atendimentoS: number;
  firstStartMs: number | null;
  lastEndMs: number | null;
};

const isoOf = (msVal: number) => {
  const d = new Date(msVal);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Ociosidade detalhada por colaborador e por dia, com separação manhã/tarde,
 * corte de pausas configurável e desconto automático do almoço escalado.
 */
export function computeIdleDaily(
  tickets: IdleTicket[],
  config: IdleConfig,
  lunchByEmpDay?: Map<string, LunchWindow>,
  teleDoneByEmpDay?: Map<string, Set<number>>,
): IdleDayRow[] {
  const cap = config.maxGapMin * 60;
  const groups = new Map<string, IdleTicket[]>();

  for (const t of tickets) {
    if (!t.employee_id || (t.estado ?? "").toLowerCase() !== "terminada") continue;
    const w = ticketWindow(t);
    if (!w) continue;
    const startMs = w.startMs;
    const key = `${t.employee_id}|${isoOf(startMs)}`;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }

  const rows: IdleDayRow[] = [];
  for (const [key, arr] of groups) {
    const [employeeId, iso] = key.split("|");
    arr.sort((a, b) => (ticketWindow(a)?.startMs ?? 0) - (ticketWindow(b)?.startMs ?? 0));
    const countWins = idleWindowsForDay(iso);
    const lunch = config.excluirAlmoco ? lunchByEmpDay?.get(key) ?? null : null;
    const teleHours = config.excluirTele ? teleDoneByEmpDay?.get(key) ?? null : null;
    const teleWins: LunchWindow[] = [];
    if (teleHours) {
      const [y, mo, d] = iso.split("-").map(Number);
      for (const h of teleHours) {
        const sT = new Date(y, mo - 1, d, h, 0, 0, 0).getTime();
        teleWins.push({ startMs: sT, endMs: sT + 3600_000 });
      }
    }

    const manha: IdlePeriod = { idleS: 0, count: 0, maxS: 0 };
    const tarde: IdlePeriod = { idleS: 0, count: 0, maxS: 0 };
    let almocoS = 0;
    let teleS = 0;
    let atendimentoS = 0;
    let firstStartMs: number | null = null;
    let lastEndMs: number | null = null;

    for (const t of arr) {
      const w2 = ticketWindow(t);
      if (!w2) continue;
      const s = w2.startMs;
      const e = w2.endMs;
      if (firstStartMs == null) firstStartMs = s;
      atendimentoS += Math.max(0, (e - s) / 1000);

      if (lastEndMs != null && s > lastEndMs) {
        // Só conta ociosidade dentro das janelas 12h-14h e 15h-19h
        let segs = intersectAll(lastEndMs, s, countWins);
        const brutoS = sumS(segs);
        if (lunch) {
          const before = sumS(segs);
          segs = subtractWindow(segs, lunch);
          almocoS += before - sumS(segs);
        }
        for (const tw of teleWins) {
          const before = sumS(segs);
          segs = subtractWindow(segs, tw);
          teleS += before - sumS(segs);
        }
        const gap = Math.max(0, Math.round(sumS(segs)));
        if (gap > 0 && brutoS <= cap) {
          const h = new Date(segs[0]?.startMs ?? lastEndMs).getHours();
          const p = h < config.splitHour ? manha : tarde;
          p.idleS += gap;
          p.count += 1;
          if (gap > p.maxS) p.maxS = gap;
        }
      }
      lastEndMs = Math.max(lastEndMs ?? 0, e);
    }

    const totalS = manha.idleS + tarde.idleS;
    const count = manha.count + tarde.count;
    let janelaS = 0;
    if (firstStartMs != null && lastEndMs != null) {
      let segs = intersectAll(firstStartMs, lastEndMs, countWins);
      if (lunch) segs = subtractWindow(segs, lunch);
      for (const tw of teleWins) segs = subtractWindow(segs, tw);
      janelaS = Math.max(0, Math.round(sumS(segs)));
    }


    rows.push({
      employeeId, iso,
      atendimentos: arr.length,
      manha, tarde,
      totalS, count,
      maxS: Math.max(manha.maxS, tarde.maxS),
      avgS: count ? Math.round(totalS / count) : 0,
      almocoS: Math.round(almocoS),
      teleS: Math.round(teleS),
      janelaS,
      atendimentoS: Math.round(atendimentoS),
      firstStartMs, lastEndMs,
    });
  }

  return rows.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : b.totalS - a.totalS));
}

// ---------------------------------------------------------------------------
// Telemarketing — janelas fixas do dia (12h-14h e 15h-19h)
// ---------------------------------------------------------------------------

/** Janelas horárias em que se faz telemarketing. */
export const TELE_WINDOWS: Array<[number, number]> = [
  [12, 14],
  [15, 19],
];

/** Horas iniciais de cada slot de 1h dentro das janelas de telemarketing. */
export const TELE_HOURS: number[] = TELE_WINDOWS.flatMap(([a, b]) =>
  Array.from({ length: Math.max(0, b - a) }, (_, i) => a + i),
);

export type ShiftWindow = { startH: number; endH: number };

const toH = (h: string, m: string) => Number(h) + Number(m) / 60;

/** Turno "09:45-18:45 (14:00-15:00)" -> { startH: 9.75, endH: 18.75 }. */
export function parseShiftWindow(descricao: string | null | undefined): ShiftWindow | null {
  if (!descricao) return null;
  const m = descricao.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const startH = toH(m[1], m[2]);
  let endH = toH(m[3], m[4]);
  if (endH <= startH) endH += 24;
  return { startH, endH };
}

/** Almoço escalado "(14:00-15:00)" em horas decimais. */
export function parseLunchHours(descricao: string | null | undefined): ShiftWindow | null {
  if (!descricao) return null;
  const m = descricao.match(/\((\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\)/);
  if (!m) return null;
  const startH = toH(m[1], m[2]);
  let endH = toH(m[3], m[4]);
  if (endH <= startH) endH += 24;
  return { startH, endH };
}

const overlapH = (a1: number, a2: number, b1: number, b2: number) =>
  Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

/** Estados de horário que não são trabalho efetivo. */
export function isWorkingState(estado: string | null | undefined, descricao?: string | null) {
  // Baixa médica (em estado OU descrição) nunca conta como escalado.
  if (isMedicalLeave({ estado, descricao })) return false;
  const e = (estado ?? "").toLowerCase().trim();
  if (!e) return true;
  return !["folga", "férias", "ferias", "falta", "baixa", "feriado", "ausente"].some((k) => e.includes(k));
}

/**
 * Um slot de telemarketing só conta se o colaborador estiver escalado nessa hora
 * (pelo menos 30 min de turno) e não estiver ao almoço nesse período.
 */
export function slotIsAvailable(descricao: string | null | undefined, estado: string | null | undefined, hour: number) {
  if (!isWorkingState(estado, descricao)) return false;
  const shift = parseShiftWindow(descricao);
  if (!shift) return true;
  const inShift = overlapH(hour, hour + 1, shift.startH, shift.endH);
  if (inShift < 0.5) return false;
  const lunch = parseLunchHours(descricao);
  if (lunch && overlapH(hour, hour + 1, lunch.startH, lunch.endH) >= 0.5) return false;
  return true;
}
