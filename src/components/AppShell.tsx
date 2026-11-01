import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  ClipboardList, Users, Package,
  Calculator, Ticket, UserCircle, Menu, BarChart3, CalendarClock,
  Lock, LogOut, Home, Search, Plus, WifiOff, HeartHandshake, Activity, ShieldCheck, Coffee,
  CalendarOff, Megaphone, Settings, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { classNames } from "@/lib/domain";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import { useAuth } from "@/hooks/use-auth";
import { useSessionExpiry } from "@/hooks/use-session-expiry";
import { supabase } from "@/integrations/supabase/client";
import { ThemeSwitcher, useThemeBoot } from "@/components/ThemeSwitcher";
import { useAppearanceBoot } from "@/hooks/use-appearance";
import { useSettingsSync } from "@/hooks/use-settings-sync";
import { CommandPalette, useCommandPalette } from "@/components/CommandPalette";
import { useNpsAlert } from "@/hooks/use-nps-alert";
import { pedirPermissaoNotificacoes } from "@/hooks/use-daily-reminders";
import nosLogo from "@/assets/nos-logo.png.asset.json";

type NavItem = { to: string; label: string; icon: typeof BarChart3 };

/** Atalhos sempre visíveis no topo do menu. */
const PRIMARY: NavItem[] = [
  { to: "/", label: "Início", icon: Home },
  { to: "/pds", label: "PDS", icon: BarChart3 },
  { to: "/individual", label: "Individuais", icon: UserCircle },
];

/** Tudo o resto, numa única lista simples (sem grupos a abrir/fechar). */
const MAIS: NavItem[] = [
  { to: "/contador", label: "Contador", icon: Calculator },
  { to: "/sgf", label: "SGF", icon: Ticket },
  { to: "/quadro-ios", label: "Quadro IOS", icon: ClipboardList },
  { to: "/colaboradores", label: "Vendedores", icon: Users },
  { to: "/horarios", label: "Horários", icon: CalendarClock },
  { to: "/nps", label: "NPS", icon: HeartHandshake },
  { to: "/produtos", label: "Produtos", icon: Package },
  { to: "/pesquisa", label: "Pesquisa", icon: Search },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Contas", icon: ShieldCheck },
];

const MOBILE_BAR: NavItem[] = [
  { to: "/", label: "Início", icon: Home },
  { to: "/pds", label: "PDS", icon: BarChart3 },
  { to: "/individual", label: "Indiv.", icon: UserCircle },
  { to: "/colaboradores", label: "Equipa", icon: Users },
  { to: "/sgf", label: "SGF", icon: Ticket },
];

function Brand() {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary" aria-label="NOS">
        <img src={nosLogo.url} alt="NOS" className="h-4 w-auto invert" />
      </div>
      <div className="min-w-0 leading-tight">
        <div className="text-sm font-semibold truncate">NOS</div>
        <div className="text-[10px] text-muted-foreground truncate">Strada Outlet</div>
      </div>
    </div>
  );
}

function LiveDot({ status, label = true }: { status: "connecting" | "live" | "offline"; label?: boolean }) {
  const cfg = {
    live: { color: "#22c55e", text: "Ao vivo", title: "Atualizações em tempo real ativas" },
    connecting: { color: "#f59e0b", text: "A ligar…", title: "A restabelecer ligação em tempo real" },
    offline: { color: "#ef4444", text: "Sem sinc.", title: "Sem ligação em tempo real — a tentar reconectar" },
  }[status];
  return (
    <span
      title={cfg.title}
      aria-label={cfg.title}
      className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground"
    >
      <span
        className={classNames("h-2 w-2 rounded-full", status !== "live" && "animate-pulse")}
        style={{ background: cfg.color }}
      />
      {label && <span>{cfg.text}</span>}
    </span>
  );
}

function NavLink({ item, pathname, badge }: { item: NavItem; pathname: string; badge: number }) {
  const active = item.to === "/" ? pathname === "/" : (pathname === item.to || pathname.startsWith(item.to + "/"));
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={classNames(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground"
          : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
      {badge > 0 && (
        <span
          className="ml-auto grid min-w-[18px] place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
          aria-label={`${badge} por ver`}
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const qc = useQueryClient();

  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ls-sidebar-collapsed") === "1";
  });
  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem("ls-sidebar-collapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);
  const [signedIn, setSignedIn] = useState(false);
  const isAdmin = useIsAdmin();
  const online = useOnlineStatus();
  const { user } = useAuth();
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();
  const npsAlert = useNpsAlert();
  const npsCount = npsAlert.data?.rows?.length ?? 0;
  const rtStatus = useRealtimeSync();
  useSessionExpiry(useCallback(() => {
    navigate({ to: "/auth", replace: true });
  }, [navigate]));
  useThemeBoot(user?.id ?? null);
  useAppearanceBoot();
  useSettingsSync(user?.id ?? null);

  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  useEffect(() => {
    if (!user?.id) return;
    const t = setTimeout(() => { void pedirPermissaoNotificacoes(); }, 4000);
    return () => clearTimeout(t);
  }, [user?.id]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const sidebar = (
    <aside className="flex h-full w-60 flex-col bg-sidebar text-sidebar-foreground border-r">
      <div className="flex h-14 items-center gap-2 px-3 border-b">
        <Brand />
        <LiveDot status={rtStatus} />
        <button
          onClick={toggleSidebarCollapsed}
          aria-label="Ocultar menu"
          title="Ocultar menu"
          className="ml-auto hidden md:grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-sidebar-accent"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {PRIMARY.map((item) => (
          <NavLink key={item.to} item={item} pathname={pathname}
            badge={0} />
        ))}

        <div className="my-2 border-t" />

        {MAIS.map((item) => (
          <NavLink key={item.to} item={item} pathname={pathname}
            badge={item.to === "/nps" ? npsCount : 0} />
        ))}

        {isAdmin && (
          <>
            <div className="my-2 border-t" />
            {ADMIN_NAV.map((item) => (
              <NavLink key={item.to} item={item} pathname={pathname} badge={0} />
            ))}
          </>
        )}
      </nav>

      <div className="border-t p-2 space-y-1">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-muted-foreground">Aparência</span>
          <div className="flex items-center gap-1">
            <ThemeSwitcher compact={false} userId={user?.id ?? null} />
          </div>
        </div>
        {signedIn ? (
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="truncate">{isAdmin ? "Sair (Admin)" : "Sair"}</span>
          </button>
        ) : (
          <Link
            to="/auth"
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Lock className="h-4 w-4 shrink-0" />
            <span className="truncate">Entrar</span>
          </Link>
        )}
        <div className="px-3 pt-1 text-[11px] text-muted-foreground">
          {signedIn ? (isAdmin ? "Modo admin" : "Loja Strada Outlet") : "Sem sessão"}
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen text-foreground">
      {sidebarCollapsed ? (
        <div className="hidden md:flex sticky top-0 h-screen w-10 shrink-0 flex-col items-center border-r bg-sidebar pt-3">
          <button
            onClick={toggleSidebarCollapsed}
            aria-label="Mostrar menu"
            title="Mostrar menu"
            className="grid h-7 w-7 place-items-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="hidden md:block sticky top-0 h-screen shrink-0">{sidebar}</div>
      )}

      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10 h-full">{sidebar}</div>
        </div>
      )}

      <div className="flex flex-1 flex-col min-w-0">
        <header className="md:hidden sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur">
          <button
            onClick={() => setSidebarOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-md hover:bg-accent"
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Brand />
          <button
            onClick={() => setPaletteOpen(true)}
            className="ml-auto grid h-9 w-9 place-items-center rounded-md hover:bg-accent"
            aria-label="Pesquisa rápida"
          >
            <Search className="h-5 w-5" />
          </button>
          <LiveDot status={rtStatus} label={false} />
          <ThemeSwitcher compact userId={user?.id ?? null} />
        </header>

        {!online && (
          <div
            role="status"
            className="sticky top-14 md:top-0 z-20 flex items-center justify-center gap-2 border-b border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
          >
            <WifiOff className="h-3.5 w-3.5" />
            <span>Sem ligação — a mostrar os últimos dados guardados. As alterações sincronizam quando voltar a rede.</span>
          </div>
        )}

        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />

        <main className="flex-1 pb-24 md:pb-6">{children}</main>

        {/* FAB "+ Venda" mobile */}
        <Link
          to="/individual"
          aria-label="Nova venda"
          className="md:hidden fixed z-50 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-95 transition"
          style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)", right: "16px" }}
        >
          <Plus className="h-7 w-7" strokeWidth={3} />
        </Link>

        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <div className="grid grid-cols-5">
            {MOBILE_BAR.map((item, idx) => {
              const active = item.to === "/" ? pathname === "/" : (pathname === item.to || pathname.startsWith(item.to + "/"));
              const Icon = item.icon;
              return (
                <Link
                  key={`${item.to}-${idx}`}
                  to={item.to}
                  className={classNames(
                    "flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors active:scale-95",
                    active ? "text-primary" : "text-foreground/70 hover:text-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b bg-muted/30 px-3 py-3 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-3 md:px-6 md:py-4">
      <div className="min-w-0">
        <h1 className="truncate text-lg md:text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-xs md:text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-1.5 overflow-x-auto md:w-auto md:overflow-visible md:shrink-0 md:justify-end md:gap-2 [&>*]:shrink-0">{actions}</div>}
    </div>
  );
}
