import { useMemo } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { MONTHS_PT, ymd } from "@/lib/domain";

/** Compact date picker — three selects (dia / mês / ano) + setas mês */
export function MonthDayPicker({
  year,
  month,
  day,
  onChange,
}: {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
  onChange: (next: { year: number; month: number; day: number }) => void;
}) {
  const daysInMonth = useMemo(() => new Date(year, month, 0).getDate(), [year, month]);
  const safeDay = Math.min(day, daysInMonth);

  function shiftMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    onChange({ year: d.getFullYear(), month: d.getMonth() + 1, day: 1 });
  }

  return (
    <div className="inline-flex max-w-full items-center gap-0.5 rounded-xl border bg-card px-1 py-1 shadow-sm">
      <button
        onClick={() => shiftMonth(-1)}
        className="hidden sm:grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-accent"
        aria-label="Mês anterior"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
      <select
        value={safeDay}
        onChange={(e) => onChange({ year, month, day: Number(e.target.value) })}
        className="min-w-0 rounded-md border bg-background px-1 py-1 text-xs sm:text-sm font-semibold tabular-nums"
        aria-label="Dia"
      >
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{String(d).padStart(2, "0")}</option>
        ))}
      </select>
      <select
        value={month}
        onChange={(e) => onChange({ year, month: Number(e.target.value), day: 1 })}
        className="min-w-0 rounded-md border bg-background px-1 py-1 text-xs sm:text-sm font-medium"
        aria-label="Mês"
      >
        {MONTHS_PT.map((m, i) => (
          <option key={i} value={i + 1}>{m}</option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => onChange({ year: Number(e.target.value), month, day: 1 })}
        className="min-w-0 rounded-md border bg-background px-1 py-1 text-xs sm:text-sm font-medium"
        aria-label="Ano"
      >
        {[2024, 2025, 2026, 2027, 2028].map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <button
        onClick={() => shiftMonth(1)}
        className="hidden sm:grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-accent"
        aria-label="Próximo mês"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function todayParts() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), iso: ymd(d) };
}
