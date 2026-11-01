import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RouteError, RouteNotFound, pageHead } from "@/components/RouteBoundary";
import { Suspense, lazy, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  BarChart3, UserCircle, Calculator, Ticket, CalendarClock, ClipboardList,
  Search, ChevronRight, Sparkles, Trophy, HeartHandshake, Users, Package, TrendingUp,
  Monitor, Pin, PinOff, LayoutDashboard, ShieldCheck, RefreshCw, Coffee,
  Megaphone, CalendarOff, Award, MessagesSquare, MonitorSmartphone,
} from "lucide-react";

import { NeonIcon, NeonBadge, pickIcon } from "@/lib/product-icons";
import { TodayDashboard } from "@/components/TodayDashboard";
import { HomeHighlights } from "@/components/HomeHighlights";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { Skeleton } from "@/components/ui/skeleton";
import { haptic } from "@/lib/haptics";

import { useAuth } from "@/hooks/use-auth";
import { useUserPrefs } from "@/hooks/use-user-prefs";

export const Route = createFileRoute("/_authenticated/")({
  head: pageHead("PDS Strada Outlet", "Painel central da loja: vendas, senhas, NPS e desafios."),
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
  notFoundComponent: () => <RouteNotFound />,
  component: HomeHub,
});

const ALL_ITEMS: { to: string; label: string; desc: string; icon: typeof BarChart3; color: string; group: string; adminOnly?: boolean }[] = [
  { to: "/pds", label: "PDS", desc: "Ponto de situação", icon: BarChart3, color: "var(--neon-blue)", group: "Vendas" },
  { to: "/individual", label: "Individuais", desc: "Vendas por vendedor", icon: UserCircle, color: "var(--neon-blue)", group: "Vendas" },
  { to: "/contador", label: "Contador", desc: "Senhas e tráfego", icon: Calculator, color: "var(--neon-green)", group: "Atendimento" },
  { to: "/sgf", label: "SGF", desc: "Tickets do dia", icon: Ticket, color: "var(--neon-violet)", group: "Atendimento" },
  { to: "/horarios", label: "Horários", desc: "Sisqual mensal", icon: CalendarClock, color: "var(--neon-orange)", group: "Atendimento" },
  { to: "/quadro-ios", label: "Quadro IOS", desc: "Pontuação loja", icon: ClipboardList, color: "var(--neon-violet)", group: "Atendimento" },
  { to: "/nps", label: "NPS", desc: "Detratores e alertas", icon: HeartHandshake, color: "var(--neon-pink)", group: "Qualidade & Gestão" },
  { to: "/pesquisa", label: "Pesquisa", desc: "Procurar vendas", icon: Search, color: "var(--neon-pink)", group: "Qualidade & Gestão" },
  { to: "/colaboradores", label: "Vendedores", desc: "Gestão de equipa", icon: Users, color: "var(--neon-yellow)", group: "Qualidade & Gestão" },
  { to: "/produtos", label: "Produtos", desc: "Catálogo e pesos", icon: Package, color: "var(--neon-orange)", group: "Qualidade & Gestão" },
  { to: "/tv", label: "Modo TV", desc: "Ranking em ecrã inteiro", icon: Monitor, color: "var(--neon-violet)", group: "Qualidade & Gestão" },
  { to: "/admin", label: "Contas", desc: "Acessos da equipa", icon: ShieldCheck, color: "var(--neon-blue)", group: "Qualidade & Gestão", adminOnly: true },
];

const GROUPS = ["Vendas", "Atendimento", "Qualidade & Gestão", "Loja & Equipa"];

function HomeHub() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { prefs, togglePin } = useUserPrefs(user?.id ?? null);
  const [q, setQ] = useState("");
  const qc = useQueryClient();
  const [tab, setTab] = useState<"resumo" | "atalhos">("resumo");
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const refreshAll = async () => {
    haptic("tap");
    setRefreshing(true);
    try {
      await qc.invalidateQueries();
      await qc.refetchQueries({ type: "active" });
      setLastSync(new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }));
    } finally {
      setRefreshing(false);
    }
  };



  const empsQ = useQuery({
    queryKey: ["employees"],
    queryFn: async () =>
      (await supabase.from("employees").select("id,nome,slug,username_sgf,categoria,ativo,ordem").eq("ativo", true).order("ordem")).data ?? [],
  });

  const isAdmin = useIsAdmin();

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return (empsQ.data ?? []).filter((e: any) =>
      e.nome?.toLowerCase().includes(term) ||
      e.username_sgf?.toLowerCase().includes(term) ||
      e.categoria?.toLowerCase().includes(term)
    ).slice(0, 8);
  }, [q, empsQ.data]);

  const grouped = useMemo(() => {
    const pinnedSet = new Set(prefs.pinnedShortcuts);
    const visible = ALL_ITEMS.filter((i) => !i.adminOnly || isAdmin);
    const pinned = visible.filter((s) => pinnedSet.has(s.to));
    const groups = GROUPS.map((g) => ({
      title: g,
      items: visible.filter((s) => s.group === g && !pinnedSet.has(s.to)),
    })).filter((g) => g.items.length > 0);
    return { pinned, groups };
  }, [prefs.pinnedShortcuts, isAdmin]);

  return (
    <div>
      <PageHeader title="Início" subtitle="Atalhos rápidos da loja" />

      <div className="p-3 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {lastSync ? `Atualizado às ${lastSync}` : "Dados em direto"}
          </p>
          <div className="flex items-center gap-2">
            <ConnectionStatus />
            <button
              onClick={refreshAll}
              disabled={refreshing}
              className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[11px] font-semibold transition hover:bg-muted disabled:opacity-60 focus-neon"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Recarregar dados
            </button>
          </div>
        </div>
        <div className="flex gap-1 rounded-xl border bg-muted/40 p-1">
          {([
            ["resumo", "Resumo"],
            ["atalhos", "Atalhos"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => { haptic("tap"); setTab(id); }}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${tab === id ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "resumo" && (
          <div className="space-y-4">
            {prefs.homeCards.includes("hoje") && <TodayDashboard />}
            <div className="space-y-4">
              {prefs.homeCards.includes("destaques") && <HomeHighlights />}
            </div>
            {prefs.homeCards.length === 0 && (
              <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground">
                Não tens cartões escolhidos.{" "}
                <Link to="/configuracoes" className="font-semibold text-primary underline">
                  Escolher em Configurações
                </Link>
              </div>
            )}
          </div>
        )}

        {tab === "atalhos" && (
          <div className="space-y-4">
            {/* Pesquisa */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Pesquisar vendedor, categoria, @utilizador…"
                className="w-full rounded-xl border bg-card pl-9 pr-16 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && results[0]) {
                    navigate({ to: "/individual/$slug", params: { slug: (results[0] as any).slug } });
                  }
                }}
              />
              <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground md:block">
                ⌘K
              </kbd>
              {results.length > 0 && (
                <div className="absolute z-30 mt-1 w-full rounded-xl border bg-popover p-1 shadow-xl">
                  {results.map((e: any) => {
                    const ic = pickIcon(e.categoria ?? e.nome);
                    return (
                      <Link
                        key={e.id}
                        to="/individual/$slug"
                        params={{ slug: e.slug }}
                        preload="intent"
                        onClick={() => setQ("")}
                        className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-[color-mix(in_oklab,var(--neon-blue)_10%,transparent)] focus-neon transition-colors"
                      >
                        <span
                          className="grid h-7 w-7 place-items-center rounded-md"
                          style={{ background: `color-mix(in oklab, ${ic.color} 18%, transparent)`, color: ic.color }}
                        >
                          <NeonIcon label={e.categoria ?? e.nome} size={14} />
                        </span>
                        <span className="flex-1 truncate font-medium">{e.nome}</span>
                        {e.categoria && <NeonBadge label={e.categoria} />}
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>

            {grouped.pinned.length > 0 && (
              <section className="space-y-2">
                <div className="flex items-center gap-2">
                  <Pin className="h-3.5 w-3.5 text-[var(--neon-yellow)]" />
                  <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Fixados</h2>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-3 stagger">
                  {grouped.pinned.map((s) => (
                    <ShortcutCard key={s.to} item={s} pinned onTogglePin={() => togglePin(s.to)} />
                  ))}
                </div>
              </section>
            )}

            {grouped.groups.map((g) => (
              <section key={g.title} className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{g.title}</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-2 md:gap-3 stagger">
                  {g.items.map((s) => (
                    <ShortcutCard key={s.to} item={s} pinned={false} onTogglePin={() => togglePin(s.to)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {/* Vendedores rápidos */}
        {tab === "atalhos" && (
        <div className="rounded-2xl border bg-card p-3 md:p-4">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--neon-pink)]" />
            <h2 className="text-sm font-bold">Acesso rápido — Vendedores</h2>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(empsQ.data ?? []).slice(0, 20).map((e: any) => {
              const color = "var(--neon-pink)";
              return (
                <Link
                  key={e.id}
                  to="/individual/$slug"
                  params={{ slug: e.slug }}
                  preload="intent"
                  className="inline-flex items-center gap-1.5 rounded-full border bg-card/60 px-2.5 py-1 text-xs font-medium transition focus-neon hover:bg-[color-mix(in_oklab,var(--neon-pink)_10%,transparent)]"
                  style={{ borderColor: `color-mix(in oklab, ${color} 50%, transparent)` }}
                >
                  <UserCircle className="h-3 w-3" style={{ color }} />
                  <span className="truncate max-w-[140px]">{e.nome}</span>
                </Link>
              );
            })}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}

function ShortcutCard({
  item: s, pinned, onTogglePin,
}: {
  item: typeof ALL_ITEMS[number];
  pinned: boolean;
  onTogglePin: () => void;
}) {
  const Icon = s.icon;
  return (
    <div className="group relative">
      <Link
        to={s.to}
        preload="intent"
        onClick={() => haptic("tap")}
        className="relative flex h-full flex-col overflow-hidden rounded-2xl glass-card lift press p-3 md:p-4 focus-neon hover:border-transparent"
        style={{ boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${s.color} 28%, transparent)` }}
        onMouseEnter={(ev) => { ev.currentTarget.style.boxShadow = `inset 0 0 0 1px ${s.color}`; }}
        onMouseLeave={(ev) => { ev.currentTarget.style.boxShadow = `inset 0 0 0 1px color-mix(in oklab, ${s.color} 28%, transparent)`; }}
      >
        <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-50" style={{ background: s.color }} />
        <div className="relative flex items-start gap-3">
          <div
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-transform group-hover:scale-110"
            style={{
              background: `color-mix(in oklab, ${s.color} 18%, transparent)`,
              color: s.color,
              boxShadow: "none",
            }}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm md:text-base font-bold truncate" style={{ color: s.color }}>
              {s.label}
            </div>
            <div className="text-[11px] md:text-xs text-foreground/70 truncate">{s.desc}</div>
          </div>
        </div>
      </Link>
      <button
        onClick={(e) => { e.stopPropagation(); haptic("tap"); onTogglePin(); }}
        className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover:opacity-100 focus:opacity-100"
        title={pinned ? "Desafixar" : "Fixar"}
      >
        {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
