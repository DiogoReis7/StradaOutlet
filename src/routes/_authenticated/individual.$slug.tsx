import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { RouteError, RouteNotFound, pageHead } from "@/components/RouteBoundary";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { MonthDayPicker } from "@/components/MonthDayPicker";
import { useSharedDate } from "@/hooks/useSharedDate";
import { MONTHS_PT, fmtNum, fmtSecsAsTime, ymd, classNames } from "@/lib/domain";
import {
  ArrowLeft, Minus, Plus, TrendingUp, Package, Ticket, Timer, Clock, Trophy, Lock, Search,
} from "lucide-react";
import { toast } from "sonner";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { NeonIcon, pickIcon, pickIconByCode } from "@/lib/product-icons";
import { useNpsAlert, NPS_DET_THRESHOLD } from "@/hooks/use-nps-alert";
import { AlertTriangle } from "lucide-react";
import { IndividualNpsPanel } from "@/components/IndividualNpsPanel";
import { isMedicalLeave, isMeeting, isSalesBlockedShift } from "@/lib/shift-state";



export const Route = createFileRoute("/_authenticated/individual/$slug")({
  head: pageHead("Desempenho individual · PDS Strada Outlet", "Vendas, pontos, senhas e NPS de cada colaborador."),
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
  notFoundComponent: () => <RouteNotFound />,
  component: IndividualPage,
});

type Product = {
  id: string; codigo: string; nome: string;
  categoria: string | null; peso: number; ativo: boolean; ordem: number;
};
type Sale = { employee_id: string; product_id: string; data: string; quantidade: number };

function normalize(s: string | null | undefined) {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Buckets iguais ao PDS / Quadro IOS
const FIXO_CODES = new Set(["tv", "net", "voz", "wifi-total", "migracoes", "migracoes-tv"]);
const MOVEL_CODES = new Set(["cv", "cv-por-retencao", "pp", "pre-pagos"]);
const MARCACOES_CODES = new Set(["sm-1a", "sm-2a", "sm-1a-estrela", "sm-2a-estrela", "sm-1a-movel", "sm-2a-movel", "xpert", "ecn", "premium", "segue-retencao"]);
const NEGOCIO_CODES = new Set(["alarmes", "alarme", "smp", "smp-retoma", "acess", "pelicula", "seguro", "seg-fat", "device", "hotspot", "energia", "energia-sa"]);

function bucketOf(codigo: string): { key: string; label: string; color: string; order: number } {
  const c = codigo.toLowerCase();
  if (c === "nc") return { key: "nc", label: "NC — Novos Contratos", color: "var(--neon-green)", order: 0 };
  if (FIXO_CODES.has(c)) return { key: "fixo", label: "FIXO", color: "var(--neon-yellow)", order: 1 };
  if (MOVEL_CODES.has(c)) return { key: "movel", label: "MÓVEL", color: "var(--neon-blue)", order: 2 };
  if (MARCACOES_CODES.has(c)) return { key: "marcacoes", label: "MARCAÇÕES", color: "var(--neon-violet)", order: 3 };
  if (NEGOCIO_CODES.has(c)) return { key: "negocio", label: "+NEGÓCIO", color: "var(--neon-orange)", order: 4 };
  if (c === "combina") return { key: "combina", label: "COMBINA · Continente", color: "var(--neon-pink)", order: 5 };
  return { key: "outros", label: "Outros", color: "var(--neon-blue)", order: 9 };
}



function IndividualPage() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  const [{ year, month, day }, setDate] = useSharedDate();
  const dayIso = ymd(new Date(year, month - 1, day));

  const empQ = useQuery({
    queryKey: ["employee", slug],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees")
        .select("id,nome,slug,username_sgf,nome_sgf,ativo,ordem,categoria")
        .eq("slug", slug).maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data;
    },
  });

  const prodsQ = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").eq("ativo", true).order("ordem");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const salesDayQ = useQuery({
    queryKey: ["sales-emp-day", empQ.data?.id, dayIso],
    enabled: !!empQ.data,
    queryFn: async () => {
      const { data, error } = await supabase.from("sales_entries").select("*")
        .eq("employee_id", empQ.data!.id).eq("data", dayIso);
      if (error) throw error;
      return (data ?? []) as Sale[];
    },
  });

  const sgfQ = useQuery({
    queryKey: ["sgf-emp-day", empQ.data?.id, dayIso],
    enabled: !!empQ.data,
    queryFn: async () => {
      const { data } = await supabase.from("sgf_tickets")
        .select("estado,espera_s,atendimento_s,emitida_em")
        .eq("employee_id", empQ.data!.id)
        .gte("emitida_em", dayIso + "T00:00:00")
        .lte("emitida_em", dayIso + "T23:59:59");
      return data ?? [];
    },
  });

  // Está escalado para trabalhar hoje?
  const shiftQ = useQuery({
    queryKey: ["shift-emp-day", empQ.data?.id, dayIso],
    enabled: !!empQ.data,
    queryFn: async () => {
      const { data } = await supabase.from("shift_days")
        .select("estado,horas,descricao")
        .eq("employee_id", empQ.data!.id).eq("data", dayIso).maybeSingle();
      return data;
    },
  });

  // Ranking do dia para posição
  const rankingQ = useQuery({
    queryKey: ["sales-all-day-ranking", dayIso],
    queryFn: async () => {
      const [salesR, prodsR] = await Promise.all([
        supabase.from("sales_entries").select("employee_id,product_id,quantidade").eq("data", dayIso),
        supabase.from("products").select("id,peso"),
      ]);
      const pw = new Map((prodsR.data ?? []).map((p) => [p.id, Number(p.peso)]));
      const m = new Map<string, number>();
      for (const s of salesR.data ?? []) {
        m.set(s.employee_id, (m.get(s.employee_id) ?? 0) + Number(s.quantidade) * (pw.get(s.product_id) ?? 0));
      }
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    },
  });

  const products = prodsQ.data ?? [];
  const salesData = salesDayQ.data;
  const sales = salesData ?? [];
  const sgf = sgfQ.data ?? [];
  const ranking = rankingQ.data ?? [];

  // Mapa local product_id -> quantidade (otimista)
  const initial = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of salesData ?? []) m[s.product_id] = Number(s.quantidade);
    return m;
  }, [salesData]);

  const [draft, setDraft] = useState<Record<string, number>>({});
  useEffect(() => { setDraft(initial); }, [initial]);

  const qty = (id: string) => draft[id] ?? 0;

  async function persist(prod_id: string, value: number) {
    if (!empQ.data) return;
    if (isSalesBlockedShift(shiftQ.data) && !isAdmin) {
      toast.error(
        isMeeting(shiftQ.data)
          ? "Colaborador em reunião. Apenas um administrador pode registar vendas neste dia."
          : "Colaborador em baixa médica. Apenas um administrador pode editar vendas neste dia.",
      );
      return;
    }
    if (value <= 0) {
      await supabase.from("sales_entries").delete().match({
        employee_id: empQ.data.id, product_id: prod_id, data: dayIso,
      });
    } else {
      const { error } = await supabase.from("sales_entries").upsert(
        { employee_id: empQ.data.id, product_id: prod_id, data: dayIso, quantidade: value },
        { onConflict: "employee_id,product_id,data" },
      );
      if (error) { toast.error(error.message); return; }
    }
    qc.invalidateQueries({ queryKey: ["sales-emp-day"] });
    qc.invalidateQueries({ queryKey: ["sales-day"] });
    qc.invalidateQueries({ queryKey: ["sales-all-day-ranking"] });
  }

  function bump(prod_id: string, delta: number) {
    const before = qty(prod_id);
    const next = Math.max(0, before + delta);
    if (next === before) return;
    setDraft((d) => ({ ...d, [prod_id]: next }));
    void persist(prod_id, next);
    const prod = products.find((p) => p.id === prod_id);
    const label = prod?.nome ?? "Produto";
    toast(`${label} ${delta > 0 ? "+" : ""}${delta} · agora ${next}`, { duration: 2000 });
  }




  // KPIs do dia
  const totalUnits = products.reduce((a, p) => a + qty(p.id), 0);
  // Ponderado exclui combina + nc (alinhado com /desempenho, /pds e /desafios).
  const totalPond = products.reduce((a, p) => {
    const code = (p.codigo ?? "").toLowerCase();
    if (code === "combina" || code === "nc") return a;
    return a + qty(p.id) * Number(p.peso);
  }, 0);

  const atendidos = sgf.filter((t) => t.estado === "terminada").length;
  const aRows = sgf.filter((t) => t.atendimento_s);
  const tma = aRows.reduce((a, t) => a + (t.atendimento_s ?? 0), 0) / (aRows.length || 1);
  const wRows = sgf.filter((t) => t.espera_s);
  const tme = wRows.reduce((a, t) => a + (t.espera_s ?? 0), 0) / (wRows.length || 1);
  const myRankIdx = ranking.findIndex(([id]) => id === empQ.data?.id);
  const myRank = myRankIdx >= 0 ? myRankIdx + 1 : null;

  // Agrupar produtos por bucket (FIXO, MÓVEL, MARCAÇÕES, +NEGÓCIO, COMBINA, NC)
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; color: string; order: number; items: Product[] }>();
    for (const p of products) {
      const b = bucketOf(p.codigo);
      if (!m.has(b.key)) m.set(b.key, { label: b.label, color: b.color, order: b.order, items: [] });
      m.get(b.key)!.items.push(p);
    }
    return [...m.values()].sort((a, b) => a.order - b.order);
  }, [products]);



  const initials = (empQ.data?.nome ?? "?").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  // Bloqueio: baixa médica e restantes ausências só são editáveis por administradores.
  const shiftLoaded = !shiftQ.isLoading && shiftQ.fetchStatus !== "fetching";
  const medicalLeave = isMedicalLeave(shiftQ.data);
  const isWorking = !shiftQ.data
    ? null
    : !isSalesBlockedShift(shiftQ.data) && (
      shiftQ.data.estado === "trabalha"
      || (shiftQ.data.estado == null && Number(shiftQ.data.horas ?? 0) > 0)
    );
  const locked = !isAdmin && empQ.data && shiftLoaded && shiftQ.data && isWorking === false;


  if (locked) {
    const desc = shiftQ.data?.descricao ?? shiftQ.data?.estado ?? "Não escalado";
    return (
      <div>
        <PageHeader
          title={empQ.data?.nome ?? "..."}
          subtitle={`${day} ${MONTHS_PT[month - 1]} ${year}`}
          actions={
            <div className="flex items-center gap-2">
              <Link to="/individual" className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1.5 text-sm hover:bg-accent">
                <ArrowLeft className="h-4 w-4" /> Todos
              </Link>
              <MonthDayPicker year={year} month={month} day={day} onChange={setDate} />
            </div>
          }
        />
        <div className="p-6 max-w-md mx-auto">
          <div className="rounded-2xl border-2 border-dashed bg-card p-8 text-center shadow-sm">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-muted">
              <Lock className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="mt-4 text-lg font-bold">{empQ.data?.nome}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
               {medicalLeave ? "Está em baixa médica neste dia." : "Não está escalado para trabalhar neste dia."}
            </p>
            <div className="mt-3 inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-800">
              {String(desc)}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
               {medicalLeave
                 ? "Não é possível registar vendas durante a baixa médica. Apenas um administrador pode editar."
                 : "Não é possível registar vendas em dias de folga, férias ou ausência."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={empQ.data?.nome ?? "..."}
        subtitle={`${day} ${MONTHS_PT[month - 1]} ${year}`}
        actions={
          <div className="flex items-center gap-2">
            <Link to="/individual" className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1.5 text-sm hover:bg-accent">
              <ArrowLeft className="h-4 w-4" /> Todos
            </Link>
            <MonthDayPicker year={year} month={month} day={day} onChange={setDate} />
          </div>
        }
      />

      <div className="p-1.5 md:p-3 max-w-[1400px] mx-auto">
        <NpsDetractorAlertForEmployee employeeId={empQ.data?.id} />
        <IndividualNpsPanel employeeId={empQ.data?.id} />
        <div className="grid gap-1.5 md:gap-2 lg:grid-cols-[300px_1fr]">
          {/* ===== Coluna 1: Colaborador + KPIs ===== */}
          <div className="space-y-1.5 md:space-y-2">
            <SectionCard title="Colaborador" color="var(--neon-blue)">
              <div className="p-2 md:p-3 flex items-center gap-2.5">
                <div className="relative shrink-0">
                  <div className="grid h-12 w-12 md:h-14 md:w-14 place-items-center rounded-xl bg-gradient-to-br from-[var(--brand-orange)] to-[var(--brand-blue)] text-white text-base md:text-lg font-bold shadow">
                    {initials}
                  </div>
                  {myRank && myRank <= 3 && (
                    <div className="absolute -bottom-1 -right-1 grid h-5 w-5 md:h-6 md:w-6 place-items-center rounded-full bg-card border-2 border-card shadow">
                      <Trophy className={classNames("h-3 w-3 md:h-3.5 md:w-3.5",
                        myRank === 1 ? "text-yellow-500" : myRank === 2 ? "text-zinc-400" : "text-amber-700")} />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="text-sm font-bold truncate">{empQ.data?.nome}</div>
                    {(empQ.data as any)?.categoria && (
                      <span className="shrink-0 rounded-full bg-[color:var(--brand-orange)]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[color:var(--brand-orange)]">
                        {(empQ.data as any).categoria}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">@{empQ.data?.username_sgf ?? "—"}</div>
                  {myRank && (
                    <div className="text-[10px] text-muted-foreground">
                      Posição <b className="text-foreground">{myRank}</b>/{ranking.length} no dia
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Resumo do dia" color="var(--neon-orange)">
              <div className="grid grid-cols-2 gap-px bg-border">
                <Kpi icon={TrendingUp} label="Ponderado" value={fmtNum(totalPond)} big />
                <Kpi icon={Package} label="Unidades" value={fmtNum(totalUnits, 0)} big />
                <Kpi icon={Ticket} label="Atendidos" value={fmtNum(atendidos, 0)} />
                <Kpi icon={Timer} label="TMA" value={fmtSecsAsTime(tma)} />
              </div>
              {tme > 0 && (
                <div className="grid grid-cols-1 gap-px bg-border border-t">
                  <Kpi icon={Clock} label="TME médio" value={fmtSecsAsTime(tme)} />
                </div>
              )}
            </SectionCard>
          </div>

          {/* ===== Coluna 2: Vendas — caixas de seleção por categoria ===== */}
          <div className="space-y-1.5 md:space-y-2">
            <QuickEntryBar products={products} onBump={bump} />
            {groups.length === 0 && (
              <p className="text-xs text-muted-foreground p-3">Sem produtos ativos.</p>
            )}
            {groups.map((g) => (
              <SectionCard
                key={g.label}
                title={g.label}
                color={g.color}
                right={`${g.items.reduce((a, p) => a + qty(p.id), 0)} un. · ${fmtNum(g.items.reduce((a, p) => a + qty(p.id) * Number(p.peso), 0), 2)} pts`}
              >
                <div className="grid grid-cols-2 gap-1 p-1 sm:gap-1.5 sm:p-1.5 lg:grid-cols-3 xl:grid-cols-4">
                  {g.items.map((p) => (
                    <ProductTile
                      key={p.id}
                      product={p}
                      value={qty(p.id)}
                      groupColor={g.color}
                      onMinus={() => bump(p.id, -1)}
                      onPlus={() => bump(p.id, +1)}
                    />
                  ))}
                </div>
              </SectionCard>
            ))}

          </div>

        </div>
      </div>
    </div>
  );
}

/* ============ Components (PDS visual language) ============ */

function brand(accent: "orange" | "blue" | "green") {
  if (accent === "orange") return "var(--brand-orange)";
  if (accent === "blue") return "var(--brand-blue)";
  return "color-mix(in oklab, var(--brand-blue) 30%, #16a34a)";
}

function SectionCard({
  title, color, right, children,
}: {
  title: string; color: string;
  right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-lg border bg-card shadow-sm"
      style={{
        borderColor: `color-mix(in oklab, ${color} 45%, transparent)`,
        boxShadow: `0 0 0 1px color-mix(in oklab, ${color} 20%, transparent), 0 4px 18px -8px color-mix(in oklab, ${color} 40%, transparent)`,
      }}
    >
      <header
        className="flex items-center justify-between gap-2 px-2.5 py-1 text-white"
        style={{ background: `linear-gradient(90deg, ${color}, color-mix(in oklab, ${color} 55%, black))` }}
      >
        <h2 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-black/85 [text-shadow:0_0_6px_rgba(255,255,255,0.4)]">
          {title}
        </h2>
        {right && <span className="text-[10px] text-black/80 tabular-nums font-semibold">{right}</span>}
      </header>
      {children}
    </section>
  );
}


function Kpi({
  icon: Icon, label, value, big,
}: { icon: typeof TrendingUp; label: string; value: string; big?: boolean }) {
  return (
    <div className="bg-card px-2 py-2 text-center">
      <div className="flex items-center justify-center gap-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground leading-tight">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={`mt-0.5 tabular-nums font-bold leading-tight ${big ? "text-lg" : "text-sm"}`}>{value}</div>
    </div>
  );
}

function ProductTile({
  product, value, groupColor, onMinus, onPlus,
}: {
  product: Product;
  value: number;
  groupColor: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const active = value > 0;
  const pond = value * Number(product.peso);
  const { Icon: ProdIcon, color: prodColor } = pickIconByCode(product.codigo);
  // Cor primária = ícone do produto; fallback à cor do grupo.
  const neon = prodColor;
  return (
    <div
      className={classNames(
        "rounded-md border p-1.5 transition-all select-none",
        active ? "shadow-[0_0_0_1px_currentColor_inset]" : "hover:brightness-110",
      )}
      style={{
        color: active ? neon : undefined,
        background: active
          ? `color-mix(in oklab, ${neon} 10%, transparent)`
          : `color-mix(in oklab, ${groupColor} 4%, var(--card))`,
        borderColor: active
          ? neon
          : `color-mix(in oklab, ${groupColor} 25%, transparent)`,
      }}
    >
      <div className="flex items-start justify-between gap-1 mb-1">
        <div className="min-w-0 flex items-start gap-1">
          <ProdIcon
            className="mt-0.5 shrink-0"
            style={{
              width: 14, height: 14, color: neon,
              filter: `drop-shadow(0 0 4px color-mix(in oklab, ${neon} 70%, transparent))`,
            }}
          />

          <div className="min-w-0">
            <div className="text-[11px] font-semibold leading-tight truncate text-foreground" title={product.nome}>
              {product.nome}
            </div>
            <div className="text-[9px] text-muted-foreground leading-tight">×{product.peso} pts</div>
          </div>
        </div>
        {active && (
          <span
            className="shrink-0 rounded px-1 py-0.5 text-[9px] font-bold text-black tabular-nums"
            style={{ background: neon, boxShadow: `0 0 8px color-mix(in oklab, ${neon} 60%, transparent)` }}
          >
            {fmtNum(pond, 1)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onMinus}
          disabled={value <= 0}
          className="grid h-8 w-8 place-items-center rounded-md border bg-background hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed shrink-0 text-foreground active:scale-95 transition-transform"
          aria-label="Diminuir"
        >
          <Minus className="h-4 w-4" />
        </button>
        {/* Display read-only — sem teclado nativo */}
        <div
          role="status"
          aria-live="polite"
          className="min-w-0 flex-1 h-8 grid place-items-center text-base font-bold tabular-nums rounded-md border bg-background"
          style={active ? { color: neon, borderColor: neon } : undefined}
        >
          {value}
        </div>
        <button
          onClick={onPlus}
          className="grid h-8 w-8 place-items-center rounded-md text-black shrink-0 font-bold active:scale-95 transition-transform"
          style={{ background: neon, boxShadow: `0 0 10px color-mix(in oklab, ${neon} 55%, transparent)` }}
          aria-label="Aumentar"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/* ============ Quick Entry Bar ============ */

function QuickEntryBar({
  products, onBump,
}: { products: Product[]; onBump: (id: string, delta: number) => void }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  const matches = useMemo(() => {
    const term = normalize(q.trim());
    if (!term) return [];
    return products
      .filter((p) =>
        normalize(p.nome).includes(term) ||
        normalize(p.codigo).includes(term) ||
        normalize(p.categoria).includes(term),
      )
      .slice(0, 6);
  }, [q, products]);

  useEffect(() => { setIdx(0); }, [q]);

  function commit(delta: number, prod?: Product) {
    const target = prod ?? matches[idx];
    if (!target) return;
    onBump(target.id, delta);
    setQ("");
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(matches.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); commit(e.shiftKey ? -1 : +1); }
    else if (e.key === "Escape") { setQ(""); }
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <header className="flex items-center gap-1.5 px-2.5 py-1 text-white"
        style={{ background: "linear-gradient(90deg, var(--brand-blue), color-mix(in oklab, var(--brand-blue) 70%, black))" }}>
        <Search className="h-3 w-3" />
        <h2 className="text-[10px] font-bold uppercase tracking-widest">Lançamento rápido</h2>
        <span className="ml-auto text-[9px] opacity-80 hidden sm:inline">Enter = +1 · Shift+Enter = -1</span>
      </header>
      <div className="p-1.5 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Procurar produto (ex.: CV, SM, NET, alarme)…"
            className="flex-1 h-9 px-2.5 rounded-md border bg-background text-sm outline-none focus:ring-2"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => commit(-1)}
            disabled={matches.length === 0}
            className="grid h-9 w-9 place-items-center rounded-md border bg-background hover:bg-accent disabled:opacity-30 active:scale-95 transition-transform"
            aria-label="Diminuir selecionado"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => commit(+1)}
            disabled={matches.length === 0}
            className="grid h-9 w-9 place-items-center rounded-md text-white font-bold disabled:opacity-30 active:scale-95 transition-transform"
            style={{ background: "var(--neon-green, #22c55e)" }}
            aria-label="Aumentar selecionado"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {matches.length > 0 && (
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-1">
            {matches.map((p, i) => {
              const { Icon: QIcon, color } = pickIconByCode(p.codigo);
              const selected = i === idx;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => commit(+1, p)}
                    onContextMenu={(e) => { e.preventDefault(); commit(-1, p); }}
                    className={classNames(
                      "w-full flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px] font-semibold transition-all",
                      selected ? "ring-2 ring-offset-1 ring-offset-card" : "hover:bg-accent",
                    )}
                    style={selected ? { borderColor: color, color, boxShadow: `0 0 8px color-mix(in oklab, ${color} 40%, transparent)` } : undefined}
                    title={`${p.nome} (clique direito = -1)`}
                  >
                    <QIcon style={{ width: 12, height: 12, color }} />
                    <span className="truncate">{p.nome}</span>
                    <span className="ml-auto text-[9px] opacity-70">×{p.peso}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {q && matches.length === 0 && (
          <p className="text-[11px] text-muted-foreground px-1">Sem resultados para "{q}".</p>
        )}
      </div>
    </section>
  );
}

function NpsDetractorAlertForEmployee({ employeeId }: { employeeId: string | undefined }) {
  const { data } = useNpsAlert();
  if (!employeeId || !data?.rows?.length) return null;
  const row = data.rows.find((r) => r.employee_id === employeeId);
  if (!row) return null;
  return (
    <Link
      to="/nps"
      className="mb-2 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs no-underline"
      style={{
        borderColor: "var(--destructive)",
        background: "color-mix(in oklab, var(--destructive) 12%, transparent)",
        color: "var(--destructive)",
        boxShadow: "0 0 18px color-mix(in oklab, var(--destructive) 30%, transparent)",
      }}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-bold uppercase tracking-wider">
          Baixar % de detratores — {(row.det_pct * 100).toFixed(1)}% (limiar {(NPS_DET_THRESHOLD * 100).toFixed(0)}%)
        </div>
        <div className="text-foreground/80 font-normal">
          {row.inqueritos} inquéritos · NetScore {row.netscore.toFixed(1)} — vê o detalhe no NPS
        </div>
      </div>
    </Link>
  );
}



