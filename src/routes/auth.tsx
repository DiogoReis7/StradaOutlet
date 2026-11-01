import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { setRememberMe } from "@/hooks/use-session-expiry";
import appIcon from "@/assets/app-icon.png";

function safePath(raw: unknown): string {
  const v = typeof raw === "string" ? raw : "";
  if (!v.startsWith("/") || v.startsWith("//")) return "/";
  return v;
}

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search["redirect"] === "string" ? { redirect: search["redirect"] as string } : {},
  beforeLoad: async ({ search }) => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: safePath(search.redirect) || "/" });
  },
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const dest = safePath(search.redirect);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) navigate({ to: dest, replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, dest]);

  // Allow logging in with a username (e.g. "cagil") instead of a full email.
  function resolveEmail(input: string): string {
    const v = input.trim().toLowerCase();
    if (!v) return v;
    if (v.includes("@")) return v;
    return `${v}@stradaoutlet.local`;
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const resolved = resolveEmail(email);
      const { error } = await supabase.auth.signInWithPassword({ email: resolved, password });
      if (error) throw error;
      setRememberMe(remember);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro a autenticar";
      toast.error(msg === "Invalid login credentials" ? "Utilizador ou password incorretos" : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-[#0b0f1c] p-4">
      {/* Radial gradient depth */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(0,194,255,0.14),transparent_50%),radial-gradient(circle_at_80%_90%,rgba(255,122,0,0.10),transparent_45%)]" />

      {/* Glow orbs */}
      <div className="pointer-events-none absolute -top-1/4 -left-1/4 h-[60vw] w-[60vw] rounded-full bg-[var(--neon-blue)]/18 blur-[100px] animate-pulse" />
      <div className="pointer-events-none absolute -bottom-1/3 -right-1/4 h-[55vw] w-[55vw] rounded-full bg-[var(--neon-orange)]/14 blur-[110px] animate-pulse" style={{ animationDelay: "1.5s" }} />

      {/* Neon rings */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[26rem] w-[26rem] rounded-full border border-[var(--neon-blue)]/20 shadow-[0_0_40px_-10px_var(--neon-blue)]/20" />
        <div className="absolute h-[34rem] w-[34rem] rounded-full border border-[var(--neon-orange)]/20 shadow-[0_0_40px_-10px_var(--neon-orange)]/20" />
      </div>

      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-white/15 bg-[#121829]/85 backdrop-blur-2xl p-6 shadow-[0_0_60px_-15px_rgba(0,194,255,0.25),0_0_40px_-20px_rgba(255,122,0,0.15)] animate-in fade-in zoom-in-95 duration-300">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#0b0f1c] ring-1 ring-[var(--neon-orange)]/60 shadow-[0_0_24px_-4px_var(--neon-orange)]/40">
            <img src={appIcon} alt="Strada Outlet" className="h-9 w-9 object-contain" />
          </div>
          <div>
            <div className="text-lg font-semibold leading-tight tracking-tight">Strada Outlet</div>
            <div className="text-xs text-muted-foreground">Painel de gestão de loja</div>
          </div>
        </div>

        <div className="mb-4 rounded-md border bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
          Acesso reservado à equipa. Entra com o teu utilizador.
        </div>

        <form onSubmit={handleEmail} className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Utilizador</label>
            <input type="text" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="ex: cagil"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Password</label>
            <input type="password" required minLength={6} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-[var(--neon-blue)]" />
            Manter-me conectado (30 dias)
          </label>
          <button disabled={busy} type="submit"
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50">
            {busy ? "..." : "Entrar"}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] text-muted-foreground">
          Sem "manter-me conectado" a sessão termina após 8h sem atividade.
        </p>
      </div>
    </div>
  );
}
