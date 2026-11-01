import { createFileRoute } from "@tanstack/react-router";
import { RouteError, RouteNotFound, pageHead } from "@/components/RouteBoundary";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withoutManagers } from "@/lib/manager";
import { PageHeader } from "@/components/AppShell";
import { MonthDayPicker, todayParts } from "@/components/MonthDayPicker";
import { EditNumber } from "./contador";
import { isMedicalLeave } from "@/lib/shift-state";
import { toast } from "sonner";
import { fmtNum, ymd, classNames } from "@/lib/domain";

export const Route = createFileRoute("/_authenticated/quadro-ios")({
  head: pageHead("Quadro · PDS Strada Outlet", "Quadro mensal de vendas por colaborador."),
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
  notFoundComponent: () => <RouteNotFound />,
  component: QuadroIOSPage,
});

type Employee = { id: string; nome: string; slug: string; ativo: boolean; ordem: number; categoria?: string | null };
type Product = { id: string; codigo: string; nome: string; categoria: string | null; peso: number; ativo: boolean; ordem: number };
type Sale = { employee_id: string; product_id: string; data: string; quantidade: number };

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Targets MÍNIMOS DIÁRIOS (do quadro físico)
// Loja:  FIXO 7 · MÓVEL 9 · MARCAÇÕES 11 · +NEGÓCIO 5 · TOTAL 33 · NC 2 · AL 1 · EN 2
// Vendedor: PONTOS 7 · NC 1 · AL 1 · ENERGIA 1
const MIN_LOJA = { fixo: 7, movel: 9, marcacoes: 11, maisNegocio: 5, total: 33, nc: 2, alarme: 1, energia: 2 };
const MIN_EMP = { pontos: 7, nc: 1, alarme: 1, energia: 1 };

// Mapeamento por código de produto (NC é indicador, não pondera)
const FIXO_CODES = new Set(["tv", "net", "voz", "wifi-total", "migracoes", "migracoes-tv"]);
const MOVEL_CODES = new Set(["cv", "cv-por-retencao", "pp", "pre-pagos"]);
const MARCACOES_CODES = new Set(["sm-1a", "sm-2a", "sm-1a-estrela", "sm-2a-estrela", "sm-1a-movel", "sm-2a-movel", "xpert", "ecn", "premium", "segue-retencao"]);
// Combina não entra em nenhum indicador — apenas contagem informativa
const EXCLUDED_FROM_BUCKETS = new Set(["combina", "nc"]);
const NEGOCIO_CODES_EXCLUDE = new Set([...FIXO_CODES, ...MOVEL_CODES, ...MARCACOES_CODES, ...EXCLUDED_FROM_BUCKETS]);

function QuadroIOSPage() {
  const qc = useQueryClient();
  const t = todayParts();
  const [{ year, month, day }, setDate] = useState({ year: t.year, month: t.month, day: t.day });
  const dayIso = ymd(new Date(year, month - 1, day));
  const [editPesos, setEditPesos] = useState(false);

  const productsQ = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("ordem");
      if (error) throw error;
      return data as Product[];
    },
  });

  const empQ = useQuery({
    queryKey: ["employees", "ops"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id,nome,slug,username_sgf,nome_sgf,ativo,ordem,categoria").eq("ativo", true).order("ordem");
      return withoutManagers((data ?? []) as any) as Employee[];
    },
  });

  const salesQ = useQuery({
    queryKey: ["sales-day", dayIso],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_entries")
        .select("employee_id,product_id,data,quantidade")
        .eq("data", dayIso);
      return (data ?? []) as Sale[];
    },
  });

  const shiftQ = useQuery({
    queryKey: ["shifts-day", dayIso],
    queryFn: async () => {
      const { data } = await supabase
        .from("shift_days")
        .select("employee_id,estado,descricao")
        .eq("data", dayIso);
      return (data ?? []) as { employee_id: string; estado: string | null; descricao: string | null }[];
    },
  });


  async function savePeso(id: string, peso: number) {
    const { error } = await supabase.from("products").update({ peso }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Peso atualizado"); qc.invalidateQueries({ queryKey: ["products"] }); }
  }

  const products = productsQ.data ?? [];
  const employees = empQ.data ?? [];
  const sales = salesQ.data ?? [];
  const prodMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  function bucketsFor(rows: Sale[]) {
    const acc = { fixo: 0, movel: 0, marcacoes: 0, maisNegocio: 0, total: 0, pontos: 0, nc: 0, alarme: 0, energia: 0 };
    for (const s of rows) {
      const p = prodMap.get(s.product_id);
      if (!p) continue;
      const q = Number(s.quantidade);
      const w = q * Number(p.peso ?? 0);
      const code = p.codigo;
      // Pontos = Σ qty × peso. NC tem peso 0, logo não pondera.
      acc.pontos += w;
      // Buckets ponderados (qty × peso), excluindo combina/nc
      if (EXCLUDED_FROM_BUCKETS.has(code)) { /* combina/nc: não contam */ }
      else if (FIXO_CODES.has(code)) { acc.fixo += w; acc.total += w; }
      else if (MOVEL_CODES.has(code)) { acc.movel += w; acc.total += w; }
      else if (MARCACOES_CODES.has(code)) { acc.marcacoes += w; acc.total += w; }
      else if (!NEGOCIO_CODES_EXCLUDE.has(code)) { acc.maisNegocio += w; acc.total += w; }
      // Contadores em quantidade (mínimos NC/Alarme/Energia são por unidades)
      if (code === "nc") acc.nc += q;
      if (code === "alarmes" || code === "alarme") acc.alarme += q;
      if (code === "energia" || code === "energia-sa") acc.energia += q;
    }
    return acc;
  }

  const loja = bucketsFor(sales);
  const workingIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of shiftQ.data ?? []) {
      if (isMedicalLeave(r)) continue;
      if ((r.estado ?? "").toLowerCase() === "trabalha") s.add(r.employee_id);
    }
    return s;
  }, [shiftQ.data]);
  const perEmp = employees
    .filter((e) => workingIds.size === 0 || workingIds.has(e.id))
    .map((e) => ({
      e,
      b: bucketsFor(sales.filter((s) => s.employee_id === e.id)),
    }));


  return (
    <div>
      <PageHeader
        title="Quadro IOS"
        subtitle={`${day}/${String(month).padStart(2, "0")}/${year}`}
        actions={
          <div className="flex items-center gap-2">
            <MonthDayPicker year={year} month={month} day={day} onChange={setDate} />
            <button
              onClick={() => setEditPesos((v) => !v)}
              className="rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              {editPesos ? "Fechar pesos" : "Editar pesos"}
            </button>
          </div>
        }
      />

      <div className="p-2 md:p-3 max-w-[1500px] mx-auto space-y-2">
        <MetaAlert loja={loja} dayIso={dayIso} />

        {/* LOJA — global, tudo numa linha (8 indicadores) */}
        <SectionCard title="Loja · totais do dia" accent="orange" right={`${fmtNum(loja.pontos, 2)} pts`}>
          <div className="grid grid-cols-4 gap-px bg-border sm:grid-cols-8">
            <Metric label={`Fixo ≥${MIN_LOJA.fixo}`} value={fmtNum(loja.fixo, 2)} big tone={loja.fixo >= MIN_LOJA.fixo ? "ok" : "bad"} />
            <Metric label={`Móvel ≥${MIN_LOJA.movel}`} value={fmtNum(loja.movel, 2)} big tone={loja.movel >= MIN_LOJA.movel ? "ok" : "bad"} />
            <Metric label={`Marc. ≥${MIN_LOJA.marcacoes}`} value={fmtNum(loja.marcacoes, 2)} big tone={loja.marcacoes >= MIN_LOJA.marcacoes ? "ok" : "bad"} />
            <Metric label={`+Neg ≥${MIN_LOJA.maisNegocio}`} value={fmtNum(loja.maisNegocio, 2)} big tone={loja.maisNegocio >= MIN_LOJA.maisNegocio ? "ok" : "bad"} />
            <Metric label={`Total ≥${MIN_LOJA.total}`} value={fmtNum(loja.total, 2)} big tone={loja.total >= MIN_LOJA.total ? "ok" : "bad"} />
            <Metric label={`NC ≥${MIN_LOJA.nc}`} value={fmtNum(loja.nc, 2)} big tone={loja.nc >= MIN_LOJA.nc ? "ok" : "bad"} />
            <Metric label={`Al. ≥${MIN_LOJA.alarme}`} value={fmtNum(loja.alarme, 2)} big tone={loja.alarme >= MIN_LOJA.alarme ? "ok" : "bad"} />
            <Metric label={`En. ≥${MIN_LOJA.energia}`} value={fmtNum(loja.energia, 2)} big tone={loja.energia >= MIN_LOJA.energia ? "ok" : "bad"} />
          </div>
        </SectionCard>

        {/* Vendedores — auto-fit para não deixar espaço vazio */}
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {perEmp.map(({ e, b }) => (
            <EmpCard key={e.id} e={e} b={b} />
          ))}
          {perEmp.length === 0 && (
            <p className="text-xs text-muted-foreground">Sem vendedores ativos.</p>
          )}
        </div>


        {/* Editor de pesos */}
        {editPesos && (
          <SectionCard title="Editar pesos dos produtos" accent="blue">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs">
                    <th className="px-3 py-2 text-left">Produto</th>
                    <th className="px-3 py-2 text-left">Categoria</th>
                    <th className="px-3 py-2 text-left">Código</th>
                    <th className="px-3 py-2 text-right">Peso (fórmula)</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-accent/20">
                      <td className="px-3 py-2 font-medium">{p.nome}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{p.categoria ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground font-mono">{p.codigo}</td>
                      <td className="px-3 py-2 text-right">
                        <EditNumber value={Number(p.peso)} onSave={(v) => savePeso(p.id, v)} width="w-20" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                <b>Fórmula:</b> Pontos = Σ (quantidade × peso). Cada venda contribui com o seu peso para os pontos do vendedor e da loja.
              </p>
            </div>
          </SectionCard>
        )}
      </div>
    </div>
  );
}

/* ============ Components ============ */

function brand(accent: "orange" | "blue") {
  return accent === "orange" ? "var(--brand-orange)" : "var(--brand-blue)";
}

function SectionCard({
  title, accent, right, children,
}: { title: string; accent: "orange" | "blue"; right?: React.ReactNode; children: React.ReactNode }) {
  const c = brand(accent);
  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <header
        className="flex items-center justify-between gap-2 px-2.5 py-1 text-white"
        style={{ background: `linear-gradient(90deg, ${c}, color-mix(in oklab, ${c} 70%, black))` }}
      >
        <h2 className="text-[10px] font-bold uppercase tracking-widest">{title}</h2>
        {right && <span className="text-[10px] opacity-90 tabular-nums font-semibold">{right}</span>}
      </header>
      {children}
    </section>
  );
}

function Metric({
  label, value, big, tone,
}: { label: string; value: string; big?: boolean; tone?: "ok" | "bad" }) {
  const toneBg =
    tone === "ok" ? "bg-emerald-500/25 ring-1 ring-inset ring-emerald-400/40" :
    tone === "bad" ? "bg-rose-500/25 ring-1 ring-inset ring-rose-400/40" :
    "bg-card";
  const toneValue =
    tone === "ok" ? "text-emerald-200" :
    tone === "bad" ? "text-rose-100" :
    "text-foreground";
  const toneLabel = tone ? "text-foreground" : "text-muted-foreground";
  return (
    <div className={`${toneBg} px-2 py-1.5 text-center`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wider leading-tight ${toneLabel}`}>{label}</div>
      <div className={`tabular-nums font-extrabold leading-tight ${big ? "text-base" : "text-sm"} ${toneValue}`}>{value}</div>
    </div>
  );
}

function EmpCard({ e, b }: { e: Employee; b: ReturnType<typeof bucketsForFake> }) {
  const toneFor = (key: keyof typeof MIN_EMP, value: number): "ok" | "bad" | undefined => {
    const min = MIN_EMP[key];
    return min > 0 ? (value >= min ? "ok" : "bad") : undefined;
  };
  return (
    <SectionCard
      title={e.nome}
      accent="orange"
      right={e.categoria ? <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-bold uppercase">{e.categoria}</span> : null}
    >
      <div className="grid grid-cols-4 gap-px bg-border">
        <Metric label={`Pts ≥${MIN_EMP.pontos}`} value={fmtNum(b.pontos, 2)} tone={toneFor("pontos", b.pontos)} big />
        <Metric label={`NC ≥${MIN_EMP.nc}`} value={fmtNum(b.nc, 2)} tone={toneFor("nc", b.nc)} big />
        <Metric label={`Al ≥${MIN_EMP.alarme}`} value={fmtNum(b.alarme, 2)} tone={toneFor("alarme", b.alarme)} big />
        <Metric label={`En ≥${MIN_EMP.energia}`} value={fmtNum(b.energia, 2)} tone={toneFor("energia", b.energia)} big />
      </div>
    </SectionCard>
  );
}


// Helper used only for inferring the bucket type in EmpCard signature
function bucketsForFake() {
  return { fixo: 0, movel: 0, marcacoes: 0, maisNegocio: 0, total: 0, pontos: 0, nc: 0, alarme: 0, energia: 0 };
}

function MetaAlert({ loja, dayIso }: { loja: ReturnType<typeof bucketsForFake>; dayIso: string }) {
  const now = new Date();
  const isToday = ymd(now) === dayIso;
  if (!isToday) return null;
  const hour = now.getHours();
  const closeH = 23; // hora de fecho
  const hoursLeft = Math.max(0, closeH - hour);
  const failing: string[] = [];
  if (loja.total < MIN_LOJA.total) failing.push(`Total (${fmtNum(loja.total, 2)}/${MIN_LOJA.total})`);
  if (loja.fixo < MIN_LOJA.fixo) failing.push(`Fixo (${fmtNum(loja.fixo, 2)}/${MIN_LOJA.fixo})`);
  if (loja.movel < MIN_LOJA.movel) failing.push(`Móvel (${fmtNum(loja.movel, 2)}/${MIN_LOJA.movel})`);
  if (loja.marcacoes < MIN_LOJA.marcacoes) failing.push(`Marcações (${fmtNum(loja.marcacoes, 2)}/${MIN_LOJA.marcacoes})`);
  if (loja.nc < MIN_LOJA.nc) failing.push(`NC (${loja.nc}/${MIN_LOJA.nc})`);
  if (loja.alarme < MIN_LOJA.alarme) failing.push(`Alarme (${loja.alarme}/${MIN_LOJA.alarme})`);
  if (loja.energia < MIN_LOJA.energia) failing.push(`Energia (${loja.energia}/${MIN_LOJA.energia})`);

  if (failing.length === 0) {
    return (
      <div
        className="rounded-md border border-[color:var(--neon-green)]/60 bg-[color:color-mix(in_oklab,var(--neon-green)_12%,transparent)] px-3 py-2 text-xs font-semibold text-[var(--neon-green)]"
        style={{ boxShadow: "none" }}
      >
        ✅ Todas as metas mínimas atingidas — bom trabalho, equipa!
      </div>
    );
  }

  // Urgência: <=4h vermelho pulsante, <=8h laranja, resto amarelo
  const urgent = hoursLeft <= 4;
  const soon = hoursLeft > 4 && hoursLeft <= 8;
  const color = urgent ? "var(--destructive)" : soon ? "var(--neon-orange)" : "var(--neon-yellow)";
  return (
    <div
      className={classNames("rounded-md border px-3 py-2 text-xs", urgent && "animate-pulse")}
      style={{
        borderColor: color,
        background: `color-mix(in oklab, ${color} 14%, transparent)`,
        color,
        boxShadow: "none",
      }}
    >
      <div className="font-bold uppercase tracking-wider">
        ⚠️ Faltam {hoursLeft}h para fecho — {failing.length} meta{failing.length > 1 ? "s" : ""} por atingir
      </div>
      <div className="mt-0.5 text-foreground/80 font-normal">{failing.join(" · ")}</div>
    </div>
  );
}


