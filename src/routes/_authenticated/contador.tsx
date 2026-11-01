import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteError, RouteNotFound, pageHead } from "@/components/RouteBoundary";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isMedicalLeave } from "@/lib/shift-state";
import { supabase } from "@/integrations/supabase/client";
import { withoutManagers } from "@/lib/manager";
import { PageHeader } from "@/components/AppShell";
import { MonthDayPicker } from "@/components/MonthDayPicker";
import { useSharedDate } from "@/hooks/useSharedDate";
import { MONTHS_PT, ymd } from "@/lib/domain";
import { NeonIcon } from "@/lib/product-icons";

export const Route = createFileRoute("/_authenticated/contador")({
  head: pageHead("Contador · PDS Strada Outlet", "Registo rápido de vendas por colaborador e produto."),
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
  notFoundComponent: () => <RouteNotFound />,
  component: ContadorPage,
});

type Employee = { id: string; nome: string; slug: string; categoria?: string | null };
type Product = { id: string; codigo: string; nome: string; categoria: string | null; peso: number };
type Sale = { employee_id: string; product_id: string; quantidade: number };
type Shift = { employee_id: string; horas: number | null; estado: string | null; descricao: string | null };

// Indicadores essenciais (mesmos do PDS)
const INDICATORS = [
  { key: "NC", label: "NC's" },
  { key: "Alarme", label: "Alarme" },
  { key: "Móvel", label: "Móvel" },
  { key: "Marcações", label: "Marcações" },
  { key: "Energia", label: "Energia" },
] as const;

// Mapeamento por código de produto (igual ao PDS / Quadro IOS)
const MARCACOES_CODES = new Set(["sm-1a", "sm-2a", "sm-1a-estrela", "sm-2a-estrela", "sm-1a-movel", "sm-2a-movel", "xpert", "ecn", "premium", "segue-retencao"]);
const MOVEL_CODES = new Set(["cv", "cv-por-retencao", "pp", "pre-pagos"]);

function indicatorFor(code: string): typeof INDICATORS[number]["key"] | null {
  if (code === "nc") return "NC";
  if (code === "alarmes" || code === "alarme") return "Alarme";
  if (MOVEL_CODES.has(code)) return "Móvel";
  if (MARCACOES_CODES.has(code)) return "Marcações";
  if (code === "energia" || code === "energia-sa") return "Energia";
  return null;
}


function ContadorPage() {
  const [{ year, month, day }, setDP] = useSharedDate();
  const date = ymd(new Date(year, month - 1, day));

  const employeesQ = useQuery({
    queryKey: ["employees", "ops"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,nome,slug,username_sgf,ativo,ordem,categoria")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return withoutManagers((data ?? []) as any) as (Employee & { ativo: boolean; ordem: number })[];
    },
  });
  const productsQ = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,codigo,nome,categoria,peso,ativo,ordem")
        .eq("ativo", true)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as (Product & { ativo: boolean; ordem: number })[];
    },
  });
  const salesQ = useQuery({
    queryKey: ["sales-day", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_entries")
        .select("employee_id,product_id,quantidade")
        .eq("data", date);
      if (error) throw error;
      return (data ?? []) as Sale[];
    },
  });
  const shiftsQ = useQuery({
    queryKey: ["shift-day", date],
    queryFn: async () => {
      const { data } = await supabase
        .from("shift_days")
        .select("employee_id,horas,estado,descricao")
        .eq("data", date);
      return (data ?? []) as Shift[];
    },
  });

  const loading =
    employeesQ.isLoading || productsQ.isLoading || salesQ.isLoading || shiftsQ.isLoading;

  const allEmployees = employeesQ.data ?? [];
  const products = productsQ.data ?? [];
  const sales = salesQ.data ?? [];
  const shifts = shiftsQ.data ?? [];

  // Filtra apenas vendedores escalados (Sisqual). Sem Sisqual carregada → todos.
  const workingIds = new Set(
    shifts
      .filter((s) => !isMedicalLeave(s) && (s.estado === "trabalha" || (s.estado == null && Number(s.horas ?? 0) > 0)))
      .map((s) => s.employee_id),
  );
  const employees =
    shifts.length === 0 ? allEmployees : allEmployees.filter((e) => workingIds.has(e.id));

  const prodMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Totais por indicador (dia) — por código de produto
  const indicatorTotals = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of sales) {
      const p = prodMap.get(s.product_id);
      if (!p) continue;
      const code = (p.codigo ?? "").toLowerCase();
      const ind = indicatorFor(code);
      if (!ind) continue;
      const q = Number(s.quantidade);
      // Marcações é ponderado (peso × qty); restantes são unidades
      m[ind] = (m[ind] ?? 0) + (ind === "Marcações" ? q * Number(p.peso ?? 0) : q);
    }
    return m;
  }, [sales, prodMap]);

  // Por vendedor: indicadores + pontos
  const rows = useMemo(() => {
    const byEmp = new Map<string, Sale[]>();
    for (const s of sales) {
      if (!byEmp.has(s.employee_id)) byEmp.set(s.employee_id, []);
      byEmp.get(s.employee_id)!.push(s);
    }
    return employees.map((e) => {
      const ss = byEmp.get(e.id) ?? [];
      const inds: Record<string, number> = {};
      let qty = 0;
      let pts = 0;
      for (const s of ss) {
        const p = prodMap.get(s.product_id);
        if (!p) continue;
        const q = Number(s.quantidade);
        qty += q;
        pts += q * Number(p.peso ?? 0);
        const code = (p.codigo ?? "").toLowerCase();
        const ind = indicatorFor(code);
        if (ind) inds[ind] = (inds[ind] ?? 0) + (ind === "Marcações" ? q * Number(p.peso ?? 0) : q);
      }
      return { e, inds, qty, pts };
    });
  }, [employees, sales, prodMap]);

  const totalQty = rows.reduce((a, r) => a + r.qty, 0);
  const totalPts = rows.reduce((a, r) => a + r.pts, 0);

  const [mode, setMode] = useState<"compacta" | "detalhada">("compacta");

  return (
    <div>
      <PageHeader
        title="Contador"
        subtitle={`${mode === "compacta" ? "Vista compacta" : "Vista detalhada"} · ${day} ${MONTHS_PT[month - 1]} ${year}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div role="tablist" aria-label="Modo de vista" className="inline-flex rounded-md border bg-card p-0.5 text-[11px] font-semibold">
              {(["compacta", "detalhada"] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={`focus-neon rounded px-2.5 py-1 capitalize transition-colors ${
                    mode === m
                      ? "bg-[color:color-mix(in_oklab,var(--ring)_22%,transparent)] text-foreground neon-text"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <MonthDayPicker year={year} month={month} day={day} onChange={setDP} />
          </div>
        }
      />


      <div className="p-3 md:p-4 space-y-3 max-w-[1300px] mx-auto">
        {/* Indicadores do dia (essenciais) — visíveis em ambos os modos */}
        <section className="rounded-lg border bg-card overflow-hidden">
          <header className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white"
            style={{ background: "linear-gradient(90deg, var(--brand-orange), color-mix(in oklab, var(--brand-orange) 65%, black))" }}>
            Indicadores do dia
          </header>
          <div className="grid grid-cols-5 gap-px bg-border">
            {INDICATORS.map((ind) => (
              <IndicatorCell
                key={ind.key}
                label={ind.label}
                iconLabel={ind.key}
                value={indicatorTotals[ind.key] ?? 0}
              />
            ))}
          </div>
        </section>

        {mode === "compacta" ? (
          /* ---------- VISTA COMPACTA: só indicadores essenciais por vendedor ---------- */
          <section className="rounded-lg border bg-card overflow-hidden">
            <header className="flex items-center justify-between px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white"
              style={{ background: "linear-gradient(90deg, var(--brand-blue), color-mix(in oklab, var(--brand-blue) 65%, black))" }}>
              <span>Vendedores · {shifts.length === 0 ? "sem Sisqual" : "escalados hoje"}</span>
              <span className="opacity-80">{rows.length}</span>
            </header>

            {loading ? (
              <div className="p-3 text-xs text-muted-foreground">A carregar…</div>
            ) : rows.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">Ninguém escalado para hoje na Sisqual.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="sticky left-0 z-10 bg-muted/80 px-2 py-1.5 text-left font-medium">Vendedor</th>
                      {INDICATORS.map((ind) => (
                        <th key={ind.key} className="px-1 py-1.5 text-center font-medium">
                          <span className="inline-flex items-center justify-center gap-1">
                            <NeonIcon label={ind.key} size={11} />
                            <span className="hidden sm:inline">{ind.label}</span>
                          </span>
                        </th>
                      ))}
                      <th className="px-2 py-1.5 text-center font-semibold text-foreground">Qtd</th>
                      <th className="px-2 py-1.5 text-center font-semibold text-foreground">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.e.id} className="border-t border-border/60 hover-neon">
                        <td className="sticky left-0 z-10 bg-card px-2 py-1.5 font-medium">
                          <Link
                            to="/individual/$slug"
                            params={{ slug: r.e.slug }}
                            className="focus-neon rounded px-0.5 hover:text-[color:var(--ring)]"
                          >
                            {r.e.nome}
                          </Link>
                        </td>
                        {INDICATORS.map((ind) => {
                          const v = r.inds[ind.key] ?? 0;
                          return (
                            <td key={ind.key} className="px-1 py-1.5 text-center tabular-nums">
                              {v ? (
                                <span className="font-semibold neon-text" style={{ color: pickColor(ind.key) }}>
                                  {v}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40">·</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-2 py-1.5 text-center font-semibold tabular-nums">
                          {r.qty || <span className="text-muted-foreground/40">·</span>}
                        </td>
                        <td className="px-2 py-1.5 text-center font-bold tabular-nums neon-text"
                          style={{ color: r.pts > 0 ? "var(--neon-green)" : undefined }}>
                          {r.pts ? r.pts.toFixed(1) : <span className="text-muted-foreground/40">·</span>}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/40 font-bold">
                      <td className="sticky left-0 z-10 bg-muted/80 px-2 py-1.5 uppercase text-[10px] tracking-wider">Total</td>
                      {INDICATORS.map((ind) => (
                        <td key={ind.key} className="px-1 py-1.5 text-center tabular-nums">
                          {indicatorTotals[ind.key] || ""}
                        </td>
                      ))}
                      <td className="px-2 py-1.5 text-center tabular-nums">{totalQty || ""}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums" style={{ color: "var(--neon-green)" }}>
                        {totalPts ? totalPts.toFixed(1) : ""}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : (
          /* ---------- VISTA DETALHADA: matriz Vendedor × Produto (todos os indicadores) ---------- */
          <section className="rounded-lg border bg-card overflow-hidden">
            <header className="flex items-center justify-between px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white"
              style={{ background: "linear-gradient(90deg, var(--brand-blue), color-mix(in oklab, var(--brand-blue) 65%, black))" }}>
              <span>Matriz Vendedor × Produto</span>
              <span className="opacity-80">{rows.length} · {products.length} prod.</span>
            </header>
            {loading ? (
              <div className="p-3 text-xs text-muted-foreground">A carregar…</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-xs">
                  <thead>
                    <tr className="bg-muted/50 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="sticky left-0 z-10 bg-muted/80 px-2 py-1.5 text-left font-medium">Vendedor</th>
                      {products.map((p) => (
                        <th key={p.id} className="px-1.5 py-1.5 text-center font-medium" title={`Peso: ${p.peso}`}>
                          <span className="inline-flex items-center justify-center gap-1">
                            <NeonIcon label={p.categoria ?? p.nome} size={11} />
                            <span>{p.nome}</span>
                          </span>
                        </th>
                      ))}
                      <th className="px-2 py-1.5 text-center font-semibold text-foreground">Qtd</th>
                      <th className="px-2 py-1.5 text-center font-semibold text-foreground">Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((e) => {
                      const map = new Map<string, number>();
                      let qty = 0, pts = 0;
                      for (const s of sales) {
                        if (s.employee_id !== e.id) continue;
                        const p = prodMap.get(s.product_id);
                        if (!p) continue;
                        const q = Number(s.quantidade);
                        map.set(s.product_id, (map.get(s.product_id) ?? 0) + q);
                        qty += q;
                        pts += q * Number(p.peso ?? 0);
                      }
                      return (
                        <tr key={e.id} className="border-t border-border/60 hover-neon">
                          <td className="sticky left-0 z-10 bg-card px-2 py-1.5 font-medium">
                            <Link
                              to="/individual/$slug"
                              params={{ slug: e.slug }}
                              className="focus-neon rounded px-0.5 hover:text-[color:var(--ring)]"
                            >
                              {e.nome}
                            </Link>
                          </td>
                          {products.map((p) => {
                            const v = map.get(p.id) ?? 0;
                            const { color } = (v > 0)
                              ? { color: pickColor(p.categoria ?? p.nome) }
                              : { color: undefined as unknown as string | undefined };
                            return (
                              <td key={p.id} className="px-1 py-1.5 text-center tabular-nums">
                                {v ? (
                                  <span className="font-semibold neon-text" style={color ? { color } : undefined}>{v}</span>
                                ) : (
                                  <span className="text-muted-foreground/30">·</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-2 py-1.5 text-center font-semibold tabular-nums">{qty || <span className="text-muted-foreground/40">·</span>}</td>
                          <td className="px-2 py-1.5 text-center font-bold tabular-nums neon-text" style={{ color: pts > 0 ? "var(--neon-green)" : undefined }}>
                            {pts ? pts.toFixed(1) : <span className="text-muted-foreground/40">·</span>}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-border bg-muted/40 font-bold">
                      <td className="sticky left-0 z-10 bg-muted/80 px-2 py-1.5 uppercase text-[10px] tracking-wider">Total</td>
                      {products.map((p) => {
                        const sum = sales.filter((s) => s.product_id === p.id).reduce((a, s) => a + Number(s.quantidade), 0);
                        return <td key={p.id} className="px-1 py-1.5 text-center tabular-nums">{sum || ""}</td>;
                      })}
                      <td className="px-2 py-1.5 text-center tabular-nums">{totalQty || ""}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums" style={{ color: "var(--neon-green)" }}>
                        {totalPts ? totalPts.toFixed(1) : ""}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function pickColor(key: string | null | undefined): string {
  const n = (key ?? "").toLowerCase();
  if (n.includes("alarm")) return "var(--neon-red)";
  if (n.includes("móv") || n.includes("mov")) return "var(--neon-blue)";
  if (n.includes("marca")) return "var(--neon-violet)";
  if (n.includes("energia") || n.includes("galp")) return "var(--neon-orange)";
  if (n.includes("nc") || n.includes("novo")) return "var(--neon-green)";
  if (n.includes("tv")) return "var(--neon-yellow)";
  if (n.includes("continente")) return "var(--neon-pink)";
  return "var(--foreground)";
}

function IndicatorCell({ label, iconLabel, value }: { label: string; iconLabel: string; value: number }) {
  const color = pickColor(iconLabel);
  return (
    <div
      className="flex flex-col items-center justify-center gap-1 bg-card px-2 py-2.5 transition-colors hover:bg-[color:color-mix(in_oklab,var(--ring)_8%,transparent)]"
      style={value > 0 ? { boxShadow: `inset 0 -2px 0 0 ${color}` } : undefined}
    >
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <NeonIcon label={iconLabel} size={12} />
        <span>{label}</span>
      </div>

      <div
        className={value > 0 ? "neon-text text-xl font-extrabold tabular-nums" : "text-xl font-extrabold tabular-nums text-muted-foreground/50"}
        style={value > 0 ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

// Kept exported for other pages (e.g. Quadro IOS weight editor).
export function EditNumber({ value, onSave, width = "w-16" }: { value: number | null; onSave: (v: number) => void; width?: string }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value?.toString() ?? "");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setV(value?.toString() ?? ""); }, [value]);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);

  function commit() {
    setEditing(false);
    const n = v === "" ? 0 : Number(v.replace(",", "."));
    if (!isFinite(n)) { setV(value?.toString() ?? ""); return; }
    if (n !== (value ?? 0)) onSave(n);
  }

  if (editing) {
    return (
      <input
        ref={ref} value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setV(value?.toString() ?? ""); setEditing(false); } }}
        className="w-full rounded-md border bg-background px-1.5 py-1 text-center text-sm outline-none focus-neon"
        style={{ width: undefined }}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`${width} rounded-md px-1.5 py-1 text-center text-sm tabular-nums hover-neon focus-neon ${value == null || value === 0 ? "text-muted-foreground/50" : ""}`}
    >
      {value ?? "·"}
    </button>
  );
}
