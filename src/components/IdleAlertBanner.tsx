import { useEffect, useMemo, useRef, useState } from "react";
import { Coffee, VolumeX, Volume2 } from "lucide-react";
import { computeIdle, minutesSinceLast, type IdleTicket } from "@/lib/idle";
import { useIdleConfig } from "@/hooks/use-idle-config";
import { alertBeep, unlockAudio } from "@/lib/sound";
import { classNames } from "@/lib/domain";

type Emp = { id: string; nome: string };

/**
 * Mostra quem está parado há mais de IDLE_ALERT_MIN minutos (só no dia de hoje).
 * Colaboradores em folga são ignorados.
 */
export function IdleAlertBanner({
  tickets, employees, folgaEmpIds, isToday,
}: {
  tickets: IdleTicket[];
  employees: Emp[];
  folgaEmpIds: Set<string>;
  isToday: boolean;
}) {
  const { config } = useIdleConfig();
  const alertMin = config.alertMin;
  const [now, setNow] = useState(() => Date.now());
  const [soundOn, setSoundOn] = useState(false);
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  const parados = useMemo(() => {
    if (!isToday) return [];
    const stats = computeIdle(tickets, config.maxGapMin);
    const out: { id: string; nome: string; min: number }[] = [];
    for (const e of employees) {
      if (folgaEmpIds.has(e.id)) continue;
      const m = minutesSinceLast(stats.get(e.id), now);
      if (m != null && m >= alertMin) out.push({ id: e.id, nome: e.nome, min: m });
    }
    return out.sort((a, b) => b.min - a.min);
  }, [tickets, employees, folgaEmpIds, isToday, now, alertMin, config.maxGapMin]);

  useEffect(() => {
    if (!soundOn) return;
    const novos = parados.filter((p) => !notifiedRef.current.has(p.id));
    if (novos.length > 0) alertBeep();
    notifiedRef.current = new Set(parados.map((p) => p.id));
  }, [parados, soundOn]);

  if (!isToday || parados.length === 0) return null;

  return (
    <div className="mx-3 mt-2 rounded-md border border-[color:var(--neon-yellow)]/50 bg-[color:color-mix(in_oklab,var(--neon-yellow)_10%,transparent)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <Coffee className="h-4 w-4 text-[color:var(--neon-yellow)]" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-[color:var(--neon-yellow)]">
          Ociosidade · sem atender há +{alertMin} min
        </span>
        <div className="flex flex-wrap gap-1.5">
          {parados.map((p) => (
            <span key={p.id}
              className={classNames(
                "rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                p.min >= alertMin * 3 ? "border-destructive/60 text-destructive" : "border-border",
              )}>
              {p.nome} · {p.min}m
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => { unlockAudio(); setSoundOn((v) => !v); }}
          className="ml-auto inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold hover:bg-accent"
          title={soundOn ? "Desligar aviso sonoro" : "Ligar aviso sonoro"}
        >
          {soundOn ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
          {soundOn ? "Aviso ligado" : "Aviso"}
        </button>
      </div>
    </div>
  );
}
