import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar, Legend, ReferenceLine,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { ymd, fmtNum, MONTHS_PT } from "@/lib/domain";
import { EXCLUDED, INDICATOR_ONLY_CODES } from "@/lib/challenges";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, CalendarDays, CalendarRange, Inbox } from "lucide-react";

type Tab = "week" | "month";

function lastNDays(n: number): Date[] {
  const arr: Date[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    arr.push(d);
  }
  return arr;
}

function lastNMonths(n: number): { label: string; year: number; month: number }[] {
  const arr: { label: string; year: number; month: number }[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    arr.push({ label: `${MONTHS_PT[d.getMonth()]} ${d.getFullYear()}`, year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return arr;
}

function buildWeekData(sales: any[], days: Date[]) {
  const dayMap = new Map(days.map((d) => [ymd(d), { dia: d.getDate(), label: d.toLocaleDateString("pt-PT", { weekday: "short" }), pts: 0, qty: 0 }]));
  for (const s of sales) {
    const entry = dayMap.get(s.data);
    if (!entry) continue;
    const w = Number(s.quantidade) * (Number(s.peso) || 0);
    if (!EXCLUDED.has(s.codigo) && !INDICATOR_ONLY_CODES.has(s.codigo)) entry.pts += w;
    entry.qty += Number(s.quantidade) || 0;
  }
  return Array.from(dayMap.values());
}

function buildMonthData(sales: any[], months: { label: string; year: number; month: number }[]) {
  const monMap = new Map(months.map((m) => [`${m.year}-${String(m.month).padStart(2, "0")}`, { label: m.label, pts: 0, qty: 0 }]));
  for (const s of sales) {
    const key = s.data.slice(0, 7);
    const entry = monMap.get(key);
    if (!entry) continue;
    const w = Number(s.quantidade) * (Number(s.peso) || 0);
    if (!EXCLUDED.has(s.codigo) && !INDICATOR_ONLY_CODES.has(s.codigo)) entry.pts += w;
    entry.qty += Number(s.quantidade) || 0;
  }
  return Array.from(monMap.values());
}

/** Lê todas as linhas em páginas de 1000 (limite do Data API). */
async function fetchAllRows<T = any>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) break;
    const chunk = (data ?? []) as T[];
    out.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return out;
}

export function HomeDashboardCharts() {
  const [tab, setTab] = useState<Tab>("week");

  const days = useMemo(() => lastNDays(7), []);
  const months = useMemo(() => lastNMonths(6), []);
  const startMonth = `${months[0].year}-${String(months[0].month).padStart(2, "0")}-01`;
  const lastM = months[months.length - 1];
  // Último dia real do mês: "-31" rebentava a query em meses de 30 dias (Postgres recusa 2026-09-31).
  const endMonth = `${lastM.year}-${String(lastM.month).padStart(2, "0")}-${String(new Date(lastM.year, lastM.month, 0).getDate()).padStart(2, "0")}`;

  const salesQ = useQuery({
    queryKey: ["home-chart-sales", startMonth, endMonth],
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from("sales_entries")
          .select("data,quantidade,products(codigo,peso)")
          .gte("data", startMonth)
          .lte("data", endMonth)
          .order("data", { ascending: true })
          .range(from, to),
      );
      return rows.map((s: any) => ({
        data: s.data,
        quantidade: Number(s.quantidade) || 0,
        codigo: String(s.products?.codigo ?? "").toLowerCase(),
        peso: Number(s.products?.peso) || 0,
      }));
    },
    staleTime: 60_000,
  });

  const ticketsQ = useQuery({
    queryKey: ["home-chart-tickets", startMonth, endMonth],
    queryFn: async () => {
      const rows = await fetchAllRows((from, to) =>
        supabase
          .from("sgf_tickets")
          .select("emitida_em,estado")
          .gte("emitida_em", startMonth + "T00:00:00")
          .lte("emitida_em", endMonth + "T23:59:59")
          .order("emitida_em", { ascending: true })
          .range(from, to),
      );
      return rows.map((t: any) => ({
        dia: t.emitida_em.slice(0, 10),
        mes: t.emitida_em.slice(0, 7),
        estado: t.estado,
      }));
    },
    staleTime: 60_000,
  });

  const npsQ = useQuery({
    queryKey: ["home-chart-nps"],
    queryFn: async () => {
      const { data: snaps } = await supabase
        .from("nps_snapshots")
        .select("id,label,created_at")
        .order("created_at", { ascending: true });
      const list = (snaps ?? []).slice(-12);
      if (list.length === 0) return [];
      const ids = list.map((s: any) => s.id);
      // pagina para não perder inquéritos (limite de 1000 por pedido)
      const surveys: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await supabase
          .from("nps_surveys")
          .select("snapshot_id,tipo,nota_global,nota_pessoa")
          .in("snapshot_id", ids)
          .order("id", { ascending: true })
          .range(from, from + 999);
        const chunk = data ?? [];
        surveys.push(...chunk);
        if (chunk.length < 1000) break;
      }
      const agg = new Map<string, { prom: number; det: number; tot: number }>();
      for (const s of surveys) {
        const tipo = String(s.tipo ?? "").toLowerCase();
        const nota = tipo === "venda" ? (s.nota_pessoa ?? s.nota_global) : (s.nota_global ?? s.nota_pessoa);
        if (nota == null) continue;
        const a = agg.get(s.snapshot_id) ?? { prom: 0, det: 0, tot: 0 };
        a.tot++;
        if (nota >= 9) a.prom++;
        else if (nota <= 6) a.det++;
        agg.set(s.snapshot_id, a);
      }
      return list
        .map((s: any) => {
          const a = agg.get(s.id);
          if (!a || a.tot === 0) return null;
          return {
            ts: new Date(s.created_at).getTime(),
            label: s.label || new Date(s.created_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" }),
            netscore: Math.round(((a.prom - a.det) / a.tot) * 100),
            det: Math.round((a.det / a.tot) * 1000) / 10,
          };
        })
        .filter(Boolean) as { ts: number; label: string; netscore: number; det: number }[];
    },
    staleTime: 60_000,
  });

  const weekSalesData = useMemo(() => buildWeekData(salesQ.data ?? [], days), [salesQ.data, days]);
  const monthSalesData = useMemo(() => buildMonthData(salesQ.data ?? [], months), [salesQ.data, months]);

  const weekTicketData = useMemo(() => {
    const dayMap = new Map(days.map((d) => [ymd(d), { label: d.toLocaleDateString("pt-PT", { weekday: "short" }), atendidos: 0, cancelados: 0, entradas: 0 }]));
    for (const t of ticketsQ.data ?? []) {
      const entry = dayMap.get(t.dia);
      if (!entry) continue;
      entry.entradas += 1;
      if (t.estado === "terminada") entry.atendidos += 1;
      else if (t.estado === "cancelado") entry.cancelados += 1;
    }
    return Array.from(dayMap.values());
  }, [ticketsQ.data, days]);

  const monthTicketData = useMemo(() => {
    const monMap = new Map(months.map((m) => [`${m.year}-${String(m.month).padStart(2, "0")}`, { label: m.label, atendidos: 0, cancelados: 0, entradas: 0 }]));
    for (const t of ticketsQ.data ?? []) {
      const entry = monMap.get(t.mes);
      if (!entry) continue;
      entry.entradas += 1;
      if (t.estado === "terminada") entry.atendidos += 1;
      else if (t.estado === "cancelado") entry.cancelados += 1;
    }
    return Array.from(monMap.values());
  }, [ticketsQ.data, months]);


  const loading = salesQ.isLoading || ticketsQ.isLoading || npsQ.isLoading;

  return (
    <section className="rounded-2xl border bg-card p-3 md:p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[var(--neon-blue)]" />
          <h2 className="text-sm font-bold">Tendências</h2>
        </div>
        <div className="flex gap-1 rounded-lg border bg-muted/50 p-0.5">
          <button
            onClick={() => setTab("week")}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition ${tab === "week" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <CalendarDays className="h-3 w-3" /> Últimos 7 dias
          </button>
          <button
            onClick={() => setTab("month")}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition ${tab === "month" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <CalendarRange className="h-3 w-3" /> Últimos 6 meses
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-3">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <ChartCard title="Pontos" color="var(--neon-blue)" empty={(tab === "week" ? weekSalesData : monthSalesData).every((d) => !d.pts)} emptyHint="Sem vendas registadas neste período.">
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={tab === "week" ? weekSalesData : monthSalesData}>
                <CartesianGrid stroke="color-mix(in oklab, var(--foreground) 10%, transparent)" vertical={false} />
                <XAxis dataKey={tab === "week" ? "label" : "label"} tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" width={40} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.5rem" }}
                  formatter={(v: number) => fmtNum(v, 2)}
                />
                <Line type="monotone" dataKey="pts" stroke="var(--neon-blue)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Senhas" color="var(--neon-violet)" empty={(tab === "week" ? weekTicketData : monthTicketData).every((d) => !d.entradas)} emptyHint="Sem senhas importadas neste período.">
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={tab === "week" ? weekTicketData : monthTicketData}>
                <CartesianGrid stroke="color-mix(in oklab, var(--foreground) 10%, transparent)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" width={30} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.5rem" }} />
                <Bar dataKey="atendidos" stackId="a" fill="var(--neon-green)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="cancelados" stackId="a" fill="var(--destructive)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="NPS" color="var(--neon-pink)" empty={(npsQ.data ?? []).length === 0} emptyHint="Importa um ficheiro de NPS para ver a evolução.">
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={npsQ.data ?? []}>
                <CartesianGrid stroke="color-mix(in oklab, var(--foreground) 10%, transparent)" vertical={false} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  ticks={(npsQ.data ?? []).map((d) => d.ts)}
                  tickFormatter={(t: number) => new Date(t).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })}
                  tick={{ fontSize: 10 }}
                  stroke="var(--muted-foreground)"
                />
                <YAxis yAxisId="left" domain={[-100, 100]} ticks={[-100, -50, 0, 50, 100]} tick={{ fontSize: 10 }} stroke="var(--neon-blue)" width={32} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 10 }} stroke="var(--neon-pink)" width={32} />
                <Tooltip
                  labelFormatter={(t: number) => new Date(t).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "0.5rem" }}
                />
                <ReferenceLine yAxisId="left" y={50} stroke="var(--neon-blue)" strokeDasharray="4 4" strokeOpacity={0.5} />
                <ReferenceLine yAxisId="right" y={12} stroke="var(--neon-pink)" strokeDasharray="4 4" strokeOpacity={0.5} />
                <Line yAxisId="left" type="monotone" dataKey="netscore" stroke="var(--neon-blue)" strokeWidth={2} dot={{ r: 3 }} />
                <Line yAxisId="right" type="monotone" dataKey="det" stroke="var(--neon-pink)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      )}
    </section>
  );
}

function ChartCard({ title, color, children, empty, emptyHint }: { title: string; color: string; children: React.ReactNode; empty?: boolean; emptyHint?: string }) {
  return (
    <div className="rounded-xl border bg-card/60 p-2" style={{ boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 22%, transparent)` }}>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{title}</div>
      {empty ? (
        <div className="flex h-[140px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-3 text-center">
          <Inbox className="h-5 w-5 opacity-50" style={{ color }} />
          <p className="text-[11px] font-semibold text-muted-foreground">Sem dados ainda</p>
          {emptyHint && <p className="text-[10px] text-muted-foreground/80">{emptyHint}</p>}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
