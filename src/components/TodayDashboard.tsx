import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ymd, fmtNum } from "@/lib/domain";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { EXCLUDED, INDICATOR_ONLY_CODES } from "@/lib/challenges";
import { useNpsAlert, NPS_DET_THRESHOLD } from "@/hooks/use-nps-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Zap, ShoppingBag, Ticket, AlertTriangle } from "lucide-react";

const FIXO_CODES = new Set(["tv", "net", "voz", "wifi-total", "migracoes", "migracoes-tv"]);
const MOVEL_CODES = new Set(["cv", "cv-por-retencao", "pp", "pre-pagos"]);
const MARCACOES_CODES = new Set(["sm-1a", "sm-2a", "sm-1a-estrela", "sm-2a-estrela", "sm-1a-movel", "sm-2a-movel", "xpert", "ecn", "premium", "segue-retencao"]);
const EXCLUDED_FROM_PTS = new Set(["combina", "nc"]);

type Tone = "blue" | "green" | "violet" | "pink";
const TONE: Record<Tone, string> = {
  blue: "var(--neon-blue)",
  green: "var(--neon-green)",
  violet: "var(--neon-violet)",
  pink: "var(--neon-pink)",
};

function KpiCard({
  label, value, formatter, hint, icon: Icon, tone, to, loading,
}: {
  label: string; value: number; formatter?: (value: number) => string; hint?: string;
  icon: typeof Zap; tone: Tone; to: string; loading?: boolean;
}) {
  const color = TONE[tone];
  return (
    <Link
      to={to}
      className="group relative overflow-hidden rounded-2xl glass-card lift press p-3 focus-neon"
      style={{ boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 26%, transparent)` }}
    >
      <div
        className="absolute -right-5 -top-5 h-16 w-16 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-50"
        style={{ background: color }}
      />
      <div className="relative flex items-center gap-2">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
          style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground/70">{label}</span>
      </div>
      <div className="relative mt-2">
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <div className="kpi-neon text-2xl" style={{ color }}>
            <AnimatedNumber value={value} formatter={formatter} />
          </div>
        )}
        <div className="mt-0.5 h-4 text-[11px] text-muted-foreground truncate">
          {loading ? <Skeleton className="h-3 w-24" /> : hint}
        </div>
      </div>
    </Link>
  );
}

export function TodayDashboard() {
  const today = ymd(new Date());

  const salesQ = useQuery({
    queryKey: ["home-today-sales", today],
    queryFn: async () => {
      const [{ data: sales }, { data: prods }] = await Promise.all([
        supabase.from("sales_entries").select("product_id,quantidade").eq("data", today),
        supabase.from("products").select("id,codigo,peso"),
      ]);
      const pmap = new Map((prods ?? []).map((p: any) => [p.id, p]));
      let pts = 0;
      let qty = 0;
      for (const s of sales ?? []) {
        const p: any = pmap.get((s as any).product_id);
        if (!p) continue;
        if (INDICATOR_ONLY_CODES.has(p.codigo)) continue;
        const q = Number((s as any).quantidade) || 0;
        qty += q;
        if (!EXCLUDED.has(p.codigo)) pts += q * (Number(p.peso) || 0);
      }
      return { pts, qty };
    },
    staleTime: 30_000,
  });

  const dayPaceQ = useQuery({
    queryKey: ["home-day-pace", today],
    queryFn: async () => {
      const d = new Date();
      const since = new Date(d);
      since.setDate(since.getDate() - 35);
      const [{ data: sales }, { data: prods }] = await Promise.all([
        supabase.from("sales_entries").select("data,product_id,quantidade").gte("data", ymd(since)).lt("data", today),
        supabase.from("products").select("id,codigo,peso"),
      ]);
      const pmap = new Map((prods ?? []).map((p: any) => [p.id, p]));
      const byDate = new Map<string, number>();
      for (const s of (sales ?? []) as any[]) {
        const p = pmap.get(s.product_id);
        if (!p || EXCLUDED.has(p.codigo)) continue;
        const w = (Number(s.quantidade) || 0) * (Number(p.peso) || 0);
        byDate.set(s.data, (byDate.get(s.data) ?? 0) + w);
      }
      const todayWeekday = d.getDay();
      const sameWeekday = [...byDate.entries()].filter(([date]) => new Date(date + "T12:00:00").getDay() === todayWeekday);
      const avg = sameWeekday.length > 0 ? sameWeekday.reduce((a, [, v]) => a + v, 0) / sameWeekday.length : null;
      return { avg, samples: sameWeekday.length };
    },
    staleTime: 60_000,
  });

  const teamQ = useQuery({
    queryKey: ["home-today-team", today],
    queryFn: async () => {
      const [{ data: sales }, { data: prods }, { data: emps }] = await Promise.all([
        supabase.from("sales_entries").select("employee_id,product_id,quantidade").eq("data", today),
        supabase.from("products").select("id,codigo,peso"),
        supabase.from("employees").select("id,nome,ativo").eq("ativo", true),
      ]);
      const pmap = new Map((prods ?? []).map((p: any) => [p.id, p]));
      const empName = new Map((emps ?? []).map((e: any) => [e.id, e.nome]));
      const cat = { fixo: 0, movel: 0, marcacoes: 0, maisNegocio: 0 };
      const byEmp = new Map<string, number>();
      for (const s of (sales ?? []) as any[]) {
        const p = pmap.get(s.product_id);
        if (!p) continue;
        const code = (p.codigo ?? "").toLowerCase();
        const q = Number(s.quantidade) || 0;
        const w = q * (Number(p.peso) || 0);
        if (FIXO_CODES.has(code)) cat.fixo += w;
        else if (MOVEL_CODES.has(code)) cat.movel += w;
        else if (MARCACOES_CODES.has(code)) cat.marcacoes += w;
        if (!EXCLUDED_FROM_PTS.has(code) && !FIXO_CODES.has(code) && !MOVEL_CODES.has(code) && !MARCACOES_CODES.has(code)) {
          cat.maisNegocio += w;
        }
        if (!EXCLUDED_FROM_PTS.has(code) && s.employee_id) {
          byEmp.set(s.employee_id, (byEmp.get(s.employee_id) ?? 0) + w);
        }
      }
      const top3 = [...byEmp.entries()]
        .map(([id, pts]) => ({ nome: empName.get(id) ?? "—", pts }))
        .sort((a, b) => b.pts - a.pts)
        .slice(0, 3);
      return { cat, top3 };
    },
    staleTime: 30_000,
  });

  const ticketsQ = useQuery({
    queryKey: ["home-today-tickets", today],
    queryFn: async () => {
      const { data } = await supabase
        .from("sgf_tickets")
        .select("estado")
        .gte("emitida_em", today + "T00:00:00")
        .lte("emitida_em", today + "T23:59:59");
      const rows = data ?? [];
      return {
        total: rows.length,
        atendidos: rows.filter((r: any) => r.estado === "terminada").length,
        cancelados: rows.filter((r: any) => r.estado === "cancelado").length,
      };
    },
    staleTime: 30_000,
  });

  const npsQ = useNpsAlert();
  const alertCount = npsQ.data?.rows?.length ?? 0;

  const dateLabel = useMemo(
    () => new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "long" }),
    [],
  );

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold">Hoje</h2>
          {(() => {
            const avg = dayPaceQ.data?.avg;
            const samples = dayPaceQ.data?.samples ?? 0;
            const pts = salesQ.data?.pts;
            if (dayPaceQ.isLoading || salesQ.isLoading || pts === undefined || avg == null || samples < 2) return null;
            const ratio = avg > 0 ? pts / avg : pts > 0 ? 2 : 1;
            const good = ratio >= 1.1, bad = ratio < 0.8;
            const color = good ? "var(--success)" : bad ? "var(--destructive)" : "var(--neon-yellow)";
            const label = good ? "Acima do costume" : bad ? "Abaixo do costume" : "Dia normal";
            const pct = avg > 0 ? Math.round((ratio - 1) * 100) : null;
            return (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}
                title={`Pontos de hoje vs. a média dos últimos ${samples} dias com o mesmo dia da semana`}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
                {label}{pct !== null && ` · ${pct > 0 ? "+" : ""}${pct}%`}
              </span>
            );
          })()}
        </div>
        <span className="text-[11px] capitalize text-muted-foreground">{dateLabel}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3 stagger">
        <KpiCard
          label="Pontos" tone="blue" icon={Zap} to="/pds" loading={salesQ.isLoading}
          value={salesQ.data?.pts ?? 0} formatter={(value) => fmtNum(value, 2)} hint="Total da loja hoje"
        />
        <KpiCard
          label="Vendas" tone="green" icon={ShoppingBag} to="/pds" loading={salesQ.isLoading}
          value={salesQ.data?.qty ?? 0} formatter={(value) => fmtNum(value, 0)} hint="Unidades registadas"
        />
        <KpiCard
          label="Senhas" tone="violet" icon={Ticket} to="/contador" loading={ticketsQ.isLoading}
          value={ticketsQ.data?.atendidos ?? 0} formatter={(value) => fmtNum(value, 0)}
          hint={`${ticketsQ.data?.total ?? 0} entradas · ${ticketsQ.data?.cancelados ?? 0} canc.`}
        />
        <KpiCard
          label="Alertas NPS" tone="pink" icon={AlertTriangle} to="/nps" loading={npsQ.isLoading}
          value={alertCount} formatter={(value) => fmtNum(value, 0)}
          hint={alertCount ? `Acima de ${Math.round(NPS_DET_THRESHOLD * 100)}% detratores` : "Sem alertas"}
        />
      </div>

      {/* Onde está a vir a venda hoje */}
      {(() => {
        const cat = teamQ.data?.cat;
        const segs = [
          { label: "Fixo", value: cat?.fixo ?? 0, color: "var(--neon-blue)" },
          { label: "Móvel", value: cat?.movel ?? 0, color: "var(--success)" },
          { label: "Marcações", value: cat?.marcacoes ?? 0, color: "var(--neon-violet)" },
          { label: "Mais Negócio", value: cat?.maisNegocio ?? 0, color: "var(--neon-yellow)" },
        ];
        const sum = segs.reduce((a, s) => a + s.value, 0);
        if (teamQ.isLoading) return <Skeleton className="h-16 rounded-xl" />;
        return (
          <div className="rounded-xl border bg-card p-3">
            <div className="flex h-2.5 w-full gap-1">
              {segs.map((s) => (
                <div
                  key={s.label}
                  className="h-full min-w-[6px] rounded-full"
                  style={{
                    flexGrow: sum > 0 ? Math.max(s.value, sum * 0.015) : 1,
                    flexBasis: 0,
                    background: s.value > 0 ? s.color : "var(--muted)",
                    opacity: s.value > 0 ? 1 : 0.4,
                  }}
                />
              ))}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
              {segs.map((s) => (
                <span key={s.label} className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                  {s.label} <b className="tabular-nums text-foreground">{fmtNum(s.value, 2)}</b>
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Top 3 + serviço, lado a lado */}
      <div className="grid gap-2 sm:grid-cols-2">
        <Link to="/pds" className="rounded-xl border bg-card p-3 hover:bg-accent/40">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Top 3 de hoje</div>
          {teamQ.isLoading ? (
            <Skeleton className="h-16 rounded-md" />
          ) : (teamQ.data?.top3.length ?? 0) === 0 ? (
            <div className="py-1 text-xs text-muted-foreground">Ainda sem vendas hoje</div>
          ) : (
            <div className="space-y-1">
              {teamQ.data!.top3.map((r, i) => (
                <div key={r.nome + i} className="flex items-center gap-2 text-xs">
                  <span className="w-5 shrink-0 text-center">{["🥇", "🥈", "🥉"][i]}</span>
                  <span className="flex-1 truncate font-semibold">{r.nome}</span>
                  <span className="shrink-0 font-bold tabular-nums text-[var(--neon-blue)]">{fmtNum(r.pts, 2)}</span>
                </div>
              ))}
            </div>
          )}
        </Link>

        <Link to="/contador" className="rounded-xl border bg-card p-3 hover:bg-accent/40">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Serviço</div>
          {ticketsQ.isLoading ? (
            <Skeleton className="h-16 rounded-md" />
          ) : (
            <div className="grid grid-cols-3 gap-y-1.5 text-[11px]">
              <div>Senhas <b className="tabular-nums text-foreground">{fmtNum(ticketsQ.data?.total ?? 0, 0)}</b></div>
              <div>Atend. <b className="tabular-nums" style={{ color: "var(--success)" }}>{fmtNum(ticketsQ.data?.atendidos ?? 0, 0)}</b></div>
              <div>%TD <b className="tabular-nums text-foreground">
                {ticketsQ.data && ticketsQ.data.total > 0 ? Math.round((ticketsQ.data.atendidos / ticketsQ.data.total) * 100) : 0}%
              </b></div>
            </div>
          )}
        </Link>
      </div>
    </section>
  );
}
