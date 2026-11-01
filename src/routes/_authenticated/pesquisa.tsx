import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteError, RouteNotFound, pageHead } from "@/components/RouteBoundary";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Search, UserCircle, Package, ChevronRight, Calendar } from "lucide-react";
import { NeonIcon, pickIcon } from "@/lib/product-icons";

export const Route = createFileRoute("/_authenticated/pesquisa")({
  head: pageHead("Pesquisa · PDS Strada Outlet", "Pesquisa rápida de colaboradores e produtos."),
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
  notFoundComponent: () => <RouteNotFound />,
  component: PesquisaPage,
});

function PesquisaPage() {
  const [q, setQ] = useState("");

  const empsQ = useQuery({
    queryKey: ["employees"],
    queryFn: async () =>
      (await supabase.from("employees").select("id,nome,slug,username_sgf,categoria,ativo,ordem").eq("ativo", true).order("ordem")).data ?? [],
  });

  const prodsQ = useQuery({
    queryKey: ["products"],
    queryFn: async () =>
      (await supabase.from("products").select("id,codigo,nome,categoria,peso,ativo,ordem").eq("ativo", true).order("ordem")).data ?? [],
  });

  const term = q.trim().toLowerCase();

  const vendedores = useMemo(() => {
    if (!term) return [];
    return (empsQ.data ?? []).filter((e: any) =>
      e.nome?.toLowerCase().includes(term) ||
      e.username_sgf?.toLowerCase().includes(term) ||
      e.categoria?.toLowerCase().includes(term)
    );
  }, [term, empsQ.data]);

  const produtos = useMemo(() => {
    if (!term) return [];
    return (prodsQ.data ?? []).filter((p: any) =>
      p.nome?.toLowerCase().includes(term) ||
      p.codigo?.toLowerCase().includes(term) ||
      p.categoria?.toLowerCase().includes(term)
    );
  }, [term, prodsQ.data]);

  const sugestoes = ["Móvel", "Alarme", "Energia", "Continente", "TV", "NC"];

  return (
    <div>
      <PageHeader title="Pesquisa" subtitle="Vendedores, produtos e categorias" />
      <div className="p-3 md:p-6 space-y-4 max-w-3xl mx-auto">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar nome, @user, produto, categoria…"
            className="w-full rounded-xl border bg-card pl-9 pr-3 py-3 text-base outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {!term && (
          <div className="flex flex-wrap gap-1.5">
            {sugestoes.map((s) => (
              <button
                key={s}
                onClick={() => setQ(s)}
                className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:border-primary hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {term && (
          <>
            <Section title="Vendedores" icon={<UserCircle className="h-4 w-4 text-[var(--neon-pink)]" />} count={vendedores.length}>
              {vendedores.map((e: any) => {
                const ic = pickIcon(e.categoria ?? e.nome);
                return (
                  <Link
                    key={e.id}
                    to="/individual/$slug"
                    params={{ slug: e.slug }}
                    className="group flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 transition focus-neon hover:border-[var(--neon-blue)]/70 hover:bg-[color-mix(in_oklab,var(--neon-blue)_8%,transparent)]"
                  >
                    <span
                      className="grid h-9 w-9 place-items-center rounded-md transition-transform group-hover:scale-105"
                      style={{ background: `color-mix(in oklab, ${ic.color} 18%, transparent)`, color: ic.color }}
                    >
                      <NeonIcon label={e.categoria ?? e.nome} size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{e.nome}</div>
                      <div className="truncate text-[11px] text-foreground/65">
                        {e.categoria ?? "—"} · @{e.username_sgf ?? "—"}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition group-hover:text-[var(--neon-blue)]" />
                  </Link>
                );
              })}
            </Section>

            <Section title="Produtos" icon={<Package className="h-4 w-4 text-[var(--neon-green)]" />} count={produtos.length}>
              {produtos.map((p: any) => {
                const ic = pickIcon(p.categoria ?? p.nome);
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
                  >
                    <span
                      className="grid h-9 w-9 place-items-center rounded-md"
                      style={{ background: `color-mix(in oklab, ${ic.color} 18%, transparent)`, color: ic.color }}
                    >
                      <NeonIcon label={p.categoria ?? p.nome} size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{p.nome}</div>
                      <div className="truncate text-[11px] text-foreground/65">
                        {p.categoria ?? "—"} · cod {p.codigo} · peso {p.peso}
                      </div>
                    </div>
                  </div>
                );
              })}
            </Section>

            <Section title="Atalhos do dia" icon={<Calendar className="h-4 w-4 text-[var(--neon-blue)]" />}>
              <Link to="/pds" className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 hover:border-primary">
                <span className="text-sm">Abrir PDS de hoje</span>
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
              </Link>
              <Link to="/sgf" className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 hover:border-primary">
                <span className="text-sm">Senhas SGF de hoje</span>
                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
              </Link>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, icon, count, children }: { title: string; icon: React.ReactNode; count?: number; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        {icon}
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {count !== undefined && <span className="text-[11px] text-muted-foreground">({count})</span>}
      </div>
      <div className="grid gap-1.5">{children}</div>
    </div>
  );
}
