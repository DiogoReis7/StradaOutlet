import { createFileRoute } from "@tanstack/react-router";
import { RouteError, RouteNotFound, pageHead } from "@/components/RouteBoundary";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { Confetti } from "@/components/Confetti";
import { haptic } from "@/lib/haptics";
import { Volume2, VolumeX, Play, Pause, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { withoutManagers } from "@/lib/manager";
import { ymd, fmtNum, MONTHS_PT, classNames, initials } from "@/lib/domain";
import { NeonIcon } from "@/lib/product-icons";
import { MARCACOES_CODES, EXCLUDED } from "@/lib/challenges";

export const Route = createFileRoute("/_authenticated/tv")({
  head: pageHead("Modo TV · PDS Strada Outlet", "Ranking de vendas em tempo real para o ecrã da loja."),
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
  notFoundComponent: () => <RouteNotFound />,
  component: TvPage,
});

type Employee = { id: string; nome: string; ativo: boolean; ordem: number; categoria: string | null };
type Product = { id: string; codigo: string; peso: number };
type Sale = { employee_id: string; product_id: string; quantidade: number };



function TvPage() {
  const today = new Date();
  const dayIso = ymd(today);
  const qc = useQueryClient();

  const [sound, setSound] = useState(false);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(new Date());
  const [panelIdx, setPanelIdx] = useState(0);
  const [rotateS, setRotateS] = useState(20);
  const [celebrate, setCelebrate] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const prevTotalRef = useRef<number>(-1);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // auto-refresh 15s
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["tv-sales", dayIso] });
    }, 15_000);
    return () => clearInterval(t);
  }, [paused, qc, dayIso]);


  // fullscreen on mount
  useEffect(() => {
    const el = rootRef.current;
    if (el && !document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
    return () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  const empQ = useQuery({
    queryKey: ["tv-emp"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id,nome,username_sgf,ativo,ordem,categoria").eq("ativo", true).order("ordem");
      return withoutManagers((data ?? []) as any) as Employee[];
    },
  });
  const prodQ = useQuery({
    queryKey: ["tv-prod"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id,codigo,peso").eq("ativo", true);
      return (data ?? []) as Product[];
    },
  });
  const salesQ = useQuery({
    queryKey: ["tv-sales", dayIso],
    queryFn: async () => {
      const { data } = await supabase.from("sales_entries").select("employee_id,product_id,quantidade").eq("data", dayIso);
      return (data ?? []) as Sale[];
    },
    refetchInterval: paused ? false : 15_000,
  });

  const products = prodQ.data ?? [];
  const employees = empQ.data ?? [];
  const sales = salesQ.data ?? [];
  const prodMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const { rows, totals, totalPts } = useMemo(() => {
    const byEmp = new Map<string, { pts: number; qty: number }>();
    const ind = { movel: 0, marcacoes: 0, energia: 0, alarme: 0, nc: 0 };
    let totalPts = 0;
    for (const s of sales) {
      const p = prodMap.get(s.product_id);
      if (!p) continue;
      const code = (p.codigo ?? "").toLowerCase();
      const q = Number(s.quantidade);
      const w = q * Number(p.peso ?? 0);
      if (!EXCLUDED.has(code)) {
        totalPts += w;
        const cur = byEmp.get(s.employee_id) ?? { pts: 0, qty: 0 };
        cur.pts += w; cur.qty += q;
        byEmp.set(s.employee_id, cur);
      }
      if (code === "cv" || code === "cv-por-retencao" || code === "pp" || code === "pre-pagos") ind.movel += q;
      else if (MARCACOES_CODES.has(code)) ind.marcacoes += w;
      else if (code === "energia" || code === "energia-sa") ind.energia += q;
      else if (code === "alarme" || code === "alarmes") ind.alarme += q;
      else if (code === "nc") ind.nc += q;
    }
    const rows = employees
      .map((e) => ({ e, ...(byEmp.get(e.id) ?? { pts: 0, qty: 0 }) }))
      .sort((a, b) => b.pts - a.pts || b.qty - a.qty);
    return { rows, totals: ind, totalPts };
  }, [sales, employees, prodMap]);

  // sound on new sale (pts increase)
  useEffect(() => {
    const prev = prevTotalRef.current;
    prevTotalRef.current = totalPts;
    if (prev < 0 || totalPts <= prev) return;
    haptic("success");
    if (Math.floor(totalPts / 10) > Math.floor(prev / 10)) {
      setCelebrate(true);
      const timer = window.setTimeout(() => setCelebrate(false), 120);
      if (sound) chime(audioCtxRef);
      return () => window.clearTimeout(timer);
    }
    if (sound) chime(audioCtxRef);
  }, [totalPts, sound]);

  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  const panels = useMemo(() => {
    const list: { key: string; label: string }[] = [
      { key: "rank", label: "Ranking" },
      { key: "ind", label: "Indicadores" },
    ];
    return list;
  }, []);

  const panel = panels[panelIdx % panels.length]?.key ?? "rank";

  // rotação automática (quiosque)
  useEffect(() => {
    if (paused || panels.length < 2) return;
    const t = setInterval(() => setPanelIdx((i) => (i + 1) % panels.length), rotateS * 1000);
    return () => clearInterval(t);
  }, [paused, panels.length, rotateS]);


  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden text-foreground"
      style={{
        background: "var(--background)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <Confetti active={celebrate} />
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.3em] text-white/50">PDS · Strada Outlet</div>
          <div className="text-2xl font-black leading-none">
            {today.getDate()} {MONTHS_PT[today.getMonth()]} {today.getFullYear()}
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[var(--neon-orange,var(--neon-pink))]/60 bg-black/40 px-6 py-2 animate-pulse"
          style={{ boxShadow: "none" }}>
          <span className="text-3xl">🔥</span>
          <span className="tabular-nums text-4xl font-black" style={{ color: "var(--neon-yellow)", textShadow: "0 0 18px var(--neon-yellow)" }}>
            <AnimatedNumber value={totalPts} formatter={(value) => fmtNum(value, 2)} />
          </span>
          <span className="text-sm font-bold uppercase tracking-widest text-white/70">pts</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="tabular-nums text-3xl font-black">
            {now.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
          </div>
          <button onClick={() => { haptic("tap"); setSound((v) => !v); }} className="rounded-full border border-white/20 bg-white/5 p-2 hover:bg-white/10" title="Som">
            {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
          <button
            onClick={() => { haptic("tap"); setRotateS((s) => (s === 15 ? 20 : s === 20 ? 30 : s === 30 ? 60 : 15)); }}
            className="rounded-full border border-white/20 bg-white/5 px-3 py-2 text-xs font-bold tabular-nums hover:bg-white/10"
            title="Tempo de rotação"
          >
            {rotateS}s
          </button>
          <button onClick={() => { haptic("tap"); setPaused((v) => !v); }} className="rounded-full border border-white/20 bg-white/5 p-2 hover:bg-white/10" title="Pausar rotação">
            {paused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </button>
          <button onClick={() => { haptic("tap"); window.close(); history.back(); }} className="rounded-full border border-white/20 bg-white/5 p-2 hover:bg-white/10" title="Sair">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {panel === "rank" ? (
          <div className="grid h-full grid-rows-[auto_1fr] gap-4 p-6">
            <Podium top3={top3} />
            <RestList rest={rest} />
          </div>
        ) : (
          <IndicatorsPanel totals={totals} totalPts={totalPts} />
        )}
      </div>

      {/* PANEL DOTS */}
      <div className="flex items-center justify-center gap-2 border-t border-white/10 py-2">
        {panels.map((p, i) => (
          <button key={p.key} onClick={() => { haptic("tap"); setPanelIdx(i); }} aria-label={`Mostrar ${p.label}`}>
            <Dot active={panel === p.key} label={p.label} />
          </button>
        ))}
        <span className="ml-4 text-[10px] uppercase tracking-widest text-white/40">
          {paused ? "· pausado ·" : `· auto-refresh 15s · rotação ${rotateS}s ·`}
        </span>
      </div>

    </div>
  );
}

function Dot({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={classNames(
      "flex items-center gap-1.5 text-[10px] uppercase tracking-widest",
      active ? "text-white" : "text-white/30",
    )}>
      <span className={classNames("h-2 w-2 rounded-full", active ? "bg-[var(--neon-yellow)]" : "bg-white/30")} />
      {label}
    </span>
  );
}

function Podium({ top3 }: { top3: { e: Employee; pts: number; qty: number }[] }) {
  const [second, first, third] = [top3[1], top3[0], top3[2]];
  const positions = [
    { r: second, place: 2, medal: "🥈", color: "#c0c9d6", h: 62 },
    { r: first, place: 1, medal: "🥇", color: "var(--neon-yellow)", h: 100 },
    { r: third, place: 3, medal: "🥉", color: "#cd7f32", h: 40 },
  ];
  return (
    <div className="grid grid-cols-3 items-end gap-4">
      {positions.map(({ r, place, medal, color, h }) => (
        <div key={place} className={classNames("flex flex-col items-center", place === 1 ? "champion-glow" : "")}>
          <div className="mb-2 flex flex-col items-center">
            <div className="text-6xl leading-none drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">{medal}</div>
            <div className="mt-2 truncate text-2xl font-black" style={{ maxWidth: "24ch" }}>
              {r?.e.nome ?? "—"}
            </div>
            <div className="tabular-nums text-4xl font-black" style={{ color, textShadow: `0 0 20px ${color}` }}>
              {r ? <AnimatedNumber value={r.pts} formatter={(value) => fmtNum(value, 2)} /> : "0"} <span className="text-sm text-white/60">pts</span>
            </div>
          </div>
          <div
            className="w-full rounded-t-lg border border-white/10"
            style={{
              height: `${h}%`,
              minHeight: 60,
              background: `linear-gradient(180deg, color-mix(in oklab, ${color} 40%, transparent), color-mix(in oklab, ${color} 8%, transparent))`,
              boxShadow: "none",
            }}
          >
            <div className="grid h-full place-items-center">
              <span className="text-7xl font-black" style={{ color, opacity: 0.35 }}>{place}º</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RestList({ rest }: { rest: { e: Employee; pts: number; qty: number }[] }) {
  if (rest.length === 0) return null;
  return (
    <div className="grid min-h-0 grid-cols-2 gap-2 overflow-hidden">
      {rest.slice(0, 12).map((r, i) => (
        <div key={r.e.id} className="lb-row flex items-center justify-between px-4 py-2" style={{ color: "var(--neon-blue)" }}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="tabular-nums text-lg font-bold text-white/40 w-8">{i + 4}º</span>
            <span className="lb-avatar h-10 w-10 shrink-0 text-sm">{initials(r.e.nome)}</span>
            <span className="truncate text-xl font-semibold">{r.e.nome}</span>
          </div>
          <span className="tabular-nums text-2xl font-black" style={{ color: "var(--neon-blue)", textShadow: "0 0 12px var(--neon-blue)" }}>
            {fmtNum(r.pts, 2)}
          </span>
        </div>
      ))}
    </div>
  );
}

function IndicatorsPanel({ totals, totalPts }: { totals: { movel: number; marcacoes: number; energia: number; alarme: number; nc: number }; totalPts: number }) {

  const items = [
    { label: "GLOBAL", value: fmtNum(totalPts, 2), icon: null, color: "var(--neon-yellow)" },
    { label: "Móvel", value: fmtNum(totals.movel, 0), icon: "Móvel", color: "var(--neon-green)" },
    { label: "Marcações", value: fmtNum(totals.marcacoes, 2), icon: "Marcações", color: "var(--neon-pink)" },
    { label: "Energia", value: fmtNum(totals.energia, 0), icon: "Energia", color: "var(--neon-orange, var(--neon-yellow))" },
    { label: "Alarme", value: fmtNum(totals.alarme, 0), icon: "Alarme", color: "var(--neon-blue)" },
    { label: "NC's", value: fmtNum(totals.nc, 0), icon: "NC", color: "var(--neon-purple, var(--neon-pink))" },
  ];
  return (
    <div className="grid h-full grid-cols-3 grid-rows-2 gap-4 p-6">
      {items.map((it) => (
        <div key={it.label} className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.3em] text-white/60">
            {it.icon && <NeonIcon label={it.icon} size={20} />}
            {it.label}
          </div>
          <div className="tabular-nums text-8xl font-black leading-none mt-2" style={{ color: it.color }}>
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function chime(ref: React.MutableRefObject<AudioContext | null>) {
  try {
    if (!ref.current) ref.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    const ctx = ref.current!;
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.08);
      gain.gain.linearRampToValueAtTime(0.25, now + i * 0.08 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.4);
    });
  } catch {}
}
