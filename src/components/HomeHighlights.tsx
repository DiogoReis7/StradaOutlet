import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fmtNum, MONTHS_PT, ymd } from "@/lib/domain";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { Sparkline } from "@/components/Sparkline";
import { EXCLUDED, INDICATOR_ONLY_CODES } from "@/lib/challenges";
import { useNpsAlert, NPS_DET_THRESHOLD, NPS_NET_TARGET } from "@/hooks/use-nps-alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Trophy, Target, Flame, AlertTriangle, Crown, ChevronRight,
  ArrowUp, ArrowDown, Minus, Smile,
} from "lucide-react";

type Employee = { id: string; nome: string; slug: string; categoria: string | null; ativo: boolean; ordem: number };
type Challenge = { id: string; titulo: string; descricao: string | null; tipo: string; start_date: string; end_date: string; scope: string; metric: string; target: number; premio: string | null; ativo: boolean };
type SaleRow = { employee_id: string; quantidade: number; codigo: string; peso: number };

type Trend = { delta: number; good: boolean | null; label: string };

function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

async function fetchSales(start: string, end: string) {
  const { data } = await supabase
    .from("sales_entries")
    .select("employee_id,quantidade,products(codigo,peso)")
    .gte("data", start)
    .lte("data", end);
  return (data ?? []).map((s: any) => ({
    employee_id: s.employee_id,
    quantidade: Number(s.quantidade) || 0,
    codigo: String(s.products?.codigo ?? "").toLowerCase(),
    peso: Number(s.products?.peso) || 0,
  })) as SaleRow[];
}

function sumPts(rows: SaleRow[]) {
  return rows.reduce((acc, s) => {
    if (EXCLUDED.has(s.codigo) || INDICATOR_ONLY_CODES.has(s.codigo)) return acc;
    return acc + s.quantidade * s.peso;
  }, 0);
}

export function HomeHighlights() {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const cur = monthRange(year, month);
  const prevDate = new Date(year, month - 2, 1);
  const prev = monthRange(prevDate.getFullYear(), prevDate.getMonth() + 1);

  const empQ = useQuery({
    queryKey: ["home-highlights-employees"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id,nome,slug,categoria,ativo,ordem").eq("ativo", true).order("ordem");
      return (data ?? []) as Employee[];
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const salesQ = useQuery({
    queryKey: ["home-highlights-sales", cur.start, cur.end],
    queryFn: () => fetchSales(cur.start, cur.end),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const prevSalesQ = useQuery({
    queryKey: ["home-highlights-sales-prev", prev.start, prev.end],
    queryFn: () => fetchSales(prev.start, prev.end),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });

  const challengesQ = useQuery({
    queryKey: ["home-highlights-challenges"],
    queryFn: async () => {
      const todayStr = ymd(new Date());
      const { data } = await supabase
        .from("challenges")
        .select("id,titulo,descricao,tipo,start_date,end_date,scope,metric,target,premio,ativo")
        .eq("ativo", true)
        .lte("start_date", todayStr)
        .gte("end_date", todayStr)
        .order("end_date", { ascending: true })
        .limit(3);
      return (data ?? []) as Challenge[];
    },
  });

  const npsQ = useNpsAlert();
  const npsCount = npsQ.data?.rows?.length ?? 0;
  const npsSummary = npsQ.data?.summary ?? null;
  const npsPrev = npsQ.data?.prevSummary ?? null;

  const ranking = useMemo(() => {
    const empMap = new Map((empQ.data ?? []).map((e) => [e.id, e]));
    const byEmp = new Map<string, number>();
    for (const s of salesQ.data ?? []) {
      if (EXCLUDED.has(s.codigo) || INDICATOR_ONLY_CODES.has(s.codigo)) continue;
      byEmp.set(s.employee_id, (byEmp.get(s.employee_id) ?? 0) + s.quantidade * s.peso);
    }
    return [...byEmp.entries()]
      .map(([id, pts]) => ({ emp: empMap.get(id), pts }))
      .filter((r): r is { emp: Employee; pts: number } => Boolean(r.emp))
      .sort((a, b) => b.pts - a.pts);
  }, [salesQ.data, empQ.data]);

  const topSeller = ranking[0] ?? null;
  const gap = topSeller && ranking[1] ? topSeller.pts - ranking[1].pts : null;

  const totalPts = useMemo(() => sumPts(salesQ.data ?? []), [salesQ.data]);
  const prevTotalPts = useMemo(() => sumPts(prevSalesQ.data ?? []), [prevSalesQ.data]);

  // Comparação justa: mesmo nº de dias decorridos do mês anterior
  const monthTrend = useMemo<Trend | null>(() => {
    if (!prevSalesQ.data || prevTotalPts <= 0) return null;
    const pct = ((totalPts - prevTotalPts) / prevTotalPts) * 100;
    return {
      delta: pct,
      good: pct >= 0,
      label: `${pct >= 0 ? "+" : ""}${fmtNum(pct, 1)}% vs mês anterior`,
    };
  }, [totalPts, prevTotalPts, prevSalesQ.data]);

  const npsTrend = useMemo<Trend | null>(() => {
    if (!npsSummary || !npsPrev || npsPrev.inqueritos === 0) return null;
    const d = (npsSummary.detPct - npsPrev.detPct) * 100;
    return {
      delta: d,
      good: d <= 0, // descer detratores é bom
      label: `${d >= 0 ? "+" : ""}${fmtNum(d, 1)} p.p. detratores`,
    };
  }, [npsSummary, npsPrev]);

  const npsColor = !npsSummary
    ? "var(--neon-violet)"
    : npsSummary.detPct <= NPS_DET_THRESHOLD
      ? "var(--neon-green)"
      : npsSummary.detPct <= NPS_DET_THRESHOLD * 1.7
        ? "var(--neon-yellow)"
        : "var(--neon-pink)";

  const loading = empQ.isLoading || salesQ.isLoading;

  return (
    <section className="grid gap-3 md:grid-cols-3 stagger">
      <HighlightCard
        to={topSeller ? `/individual/$slug` : "/pds"}
        params={topSeller ? { slug: topSeller.emp.slug } : undefined}
        icon={Crown}
        color="var(--neon-yellow)"
        title="Vendedor do mês"
        subtitle={topSeller ? (gap !== null ? `${topSeller.emp.nome} · +${fmtNum(gap, 2)} pts sobre o 2º` : topSeller.emp.nome) : "—"}
        value={topSeller ? `${fmtNum(topSeller.pts, 2)} pts` : "Sem dados"}
        valueNumber={topSeller?.pts}
        valueFormatter={(value) => `${fmtNum(value, 2)} pts`}
        loading={loading}
      />

      <HighlightCard
        to="/pds"
        icon={Flame}
        color="var(--neon-orange)"
        title="Loja este mês"
        subtitle={`${MONTHS_PT[month - 1]} ${year}`}
        value={`${fmtNum(totalPts, 2)} pts`}
        valueNumber={totalPts}
        valueFormatter={(value) => `${fmtNum(value, 2)} pts`}
        sparkline={[prevTotalPts, totalPts]}
        loading={loading}
        trend={monthTrend}
      />

      <HighlightCard
        to="/nps"
        icon={npsSummary && npsSummary.detPct <= NPS_DET_THRESHOLD ? Smile : AlertTriangle}
        color={npsColor}
        title="NPS da loja"
        subtitle={
          npsSummary
            ? `${npsSummary.inqueritos} inq. · ${npsCount > 0 ? `${npsCount} em alerta` : "sem alertas"}`
            : "Sem dados importados"
        }
        value={
          npsSummary
            ? `${fmtNum(npsSummary.netscore, 0)} · ${fmtNum(npsSummary.detPct * 100, 1)}% det`
            : "—"
        }
        loading={npsQ.isLoading}
        compactValue
        trend={npsTrend}
        progress={
          npsSummary
            ? {
                pct: Math.max(0, Math.min(100, ((npsSummary.netscore + 100) / (NPS_NET_TARGET + 100)) * 100)),
                hint: `Alvo: ${NPS_NET_TARGET} net · ≤ ${Math.round(NPS_DET_THRESHOLD * 100)}% det`,
              }
            : null
        }
      />

    </section>
  );
}

function TrendPill({ trend, color }: { trend: Trend; color: string }) {
  const Icon = trend.delta === 0 ? Minus : trend.delta > 0 ? ArrowUp : ArrowDown;
  const tone = trend.good === null ? color : trend.good ? "var(--neon-green)" : "var(--neon-pink)";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: `color-mix(in oklab, ${tone} 16%, transparent)`, color: tone }}
      title={trend.label}
    >
      <Icon className="h-3 w-3" />
      {trend.label}
    </span>
  );
}

function HighlightCard({
  to, params, icon: Icon, color, title, subtitle, value, valueNumber, valueFormatter, loading, compactValue, trend, progress, sparkline,
}: {
  to: string;
  params?: Record<string, string>;
  icon: typeof Trophy;
  color: string;
  title: string;
  subtitle: string;
  value: string;
  valueNumber?: number;
  valueFormatter?: (value: number) => string;
  loading?: boolean;
  compactValue?: boolean;
  trend?: Trend | null;
  progress?: { pct: number; hint: string } | null;
  sparkline?: number[];
}) {
  const body = (
    <div className="group relative overflow-hidden rounded-2xl border bg-card p-3 transition focus-neon hover:-translate-y-0.5" style={{ boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 28%, transparent)` }}>
      <div className="absolute -right-5 -top-5 h-16 w-16 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-50" style={{ background: color }} />
      <div className="relative flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/85">{title}</span>
      </div>
      <div className="relative mt-2">
        {loading ? <Skeleton className="h-7 w-24" /> : (
          <div className={`font-extrabold tabular-nums ${compactValue ? "text-base" : "text-2xl"}`} style={{ color }}>
            {valueNumber !== undefined ? <AnimatedNumber value={valueNumber} formatter={valueFormatter} /> : value}
          </div>
        )}
        <div className="mt-0.5 h-4 text-[11px] text-muted-foreground truncate">
          {loading ? <Skeleton className="h-3 w-24" /> : subtitle}
        </div>
        {!loading && trend ? <div className="mt-1"><TrendPill trend={trend} color={color} /></div> : null}
        {!loading && progress ? (
          <div className="mt-1.5">
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full transition-all" style={{ width: `${progress.pct}%`, background: color }} />
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground truncate">{progress.hint}</div>
          </div>
        ) : null}
        {!loading && sparkline ? <div className="mt-1"><Sparkline values={sparkline} color={color} label={`Tendência de ${title}`} /></div> : null}
      </div>
      <ChevronRight className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
    </div>
  );

  if (params) {
    return (
      <Link to={to} params={params} className="block">
        {body}
      </Link>
    );
  }
  return <Link to={to} className="block">{body}</Link>;
}
