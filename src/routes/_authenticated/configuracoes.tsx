import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bell, BellOff, Smartphone, Download, RefreshCw, Trash2, CheckCircle2, Info, Palette, LayoutDashboard,
} from "lucide-react";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { useUserPrefs, HOME_CARDS } from "@/hooks/use-user-prefs";

import { PageHeader } from "@/components/AppShell";
import { RouteError, RouteNotFound, pageHead } from "@/components/RouteBoundary";
import { useAuth } from "@/hooks/use-auth";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { pedirPermissaoNotificacoes } from "@/hooks/use-daily-reminders";
import { readNotifPrefs, writeNotifPrefs, type NotifPrefs } from "@/lib/notif-prefs";
import { clearOfflineCache, offlineCacheTimestamp } from "@/lib/offline-cache";
import { unregisterServiceWorker } from "@/lib/pwa";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: pageHead("Configurações · PDS Strada Outlet", "Lembretes, notificações, instalação da app e modo offline."),
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
  notFoundComponent: () => <RouteNotFound />,
  component: ConfiguracoesPage,
});

const TOGGLES: { id: keyof NotifPrefs; label: string; hint: string }[] = [
  { id: "detratores", label: "Alerta de detratores", hint: "Quando estás acima do limite de % de detratores." },
  { id: "sistema", label: "Notificações do dispositivo", hint: "Além dos avisos dentro da app, usa o sistema." },
];

function Row({
  checked, onChange, label, hint,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3">
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-[var(--neon-blue)]"
        aria-label={label}
      />
    </label>
  );
}

function ConfiguracoesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { canInstall, installed, install } = usePwaInstall();
  const { prefs: userPrefs, toggleHomeCard } = useUserPrefs(user?.id ?? null);
  const [prefs, setPrefs] = useState<NotifPrefs>(() => readNotifPrefs(null));
  const [perm, setPerm] = useState<string>("default");
  const [cacheTs, setCacheTs] = useState<number | null>(null);

  useEffect(() => {
    setPrefs(readNotifPrefs(user?.id ?? null));
    setCacheTs(offlineCacheTimestamp());
    if (typeof window !== "undefined" && "Notification" in window) setPerm(Notification.permission);
  }, [user?.id]);

  function update(id: keyof NotifPrefs, value: boolean) {
    setPrefs((prev) => {
      const next = { ...prev, [id]: value };
      writeNotifPrefs(user?.id ?? null, next);
      return next;
    });
  }

  async function pedirPermissao() {
    const r = await pedirPermissaoNotificacoes();
    setPerm(String(r));
    if (r === "granted") toast.success("Notificações ativadas neste dispositivo");
    else toast.error("Notificações bloqueadas — ativa nas definições do browser");
  }

  return (
    <>
      <PageHeader title="Configurações" subtitle="Lembretes, notificações e modo offline — por conta e dispositivo." />
      <div className="mx-auto w-full max-w-3xl space-y-6 p-3 sm:p-6">

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <Palette className="h-4 w-4" /> Aparência
          </h2>
          <AppearanceSettings />
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <LayoutDashboard className="h-4 w-4" /> Painel inicial
          </h2>
          <p className="text-xs text-muted-foreground">
            Escolhe o que aparece no separador &quot;Resumo&quot; do Início. Fica guardado neste dispositivo.
          </p>
          <div className="grid gap-2">
            {HOME_CARDS.map((c) => (
              <Row
                key={c.id}
                label={c.label}
                hint={c.hint}
                checked={userPrefs.homeCards.includes(c.id)}
                onChange={() => toggleHomeCard(c.id)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <Bell className="h-4 w-4" /> Lembretes e notificações
          </h2>
          <div className="grid gap-2">
            {TOGGLES.map((t) => (
              <Row
                key={t.id}
                label={t.label}
                hint={t.hint}
                checked={prefs[t.id]}
                onChange={(v) => update(t.id, v)}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-3">
            <span className="text-xs text-muted-foreground">
              Permissão do browser:{" "}
              <strong className="text-foreground">
                {perm === "granted" ? "concedida" : perm === "denied" ? "bloqueada" : "por pedir"}
              </strong>
            </span>
            {perm !== "granted" && (
              <button
                onClick={pedirPermissao}
                className="ml-auto inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                {perm === "denied" ? <BellOff className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                Pedir permissão
              </button>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <Smartphone className="h-4 w-4" /> Instalar a app
          </h2>
          <div className="rounded-lg border bg-card p-3 text-sm">
            {installed ? (
              <p className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> A app já está instalada neste dispositivo.
              </p>
            ) : canInstall ? (
              <button
                onClick={() => void install()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
              >
                <Download className="h-4 w-4" /> Instalar no dispositivo
              </button>
            ) : (
              <p className="flex items-start gap-2 text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                No iPhone: Partilhar → “Adicionar ao ecrã principal”. No Android/PC: menu do browser → “Instalar app”.
              </p>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <RefreshCw className="h-4 w-4" /> Modo offline
          </h2>
          <div className="space-y-3 rounded-lg border bg-card p-3 text-sm">
            <p className="text-muted-foreground">
              As últimas leituras ficam guardadas 24h para consulta sem rede.
              {cacheTs
                ? ` Última cópia: ${new Date(cacheTs).toLocaleString("pt-PT")}.`
                : " Ainda não existe cópia guardada."}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  await qc.invalidateQueries();
                  await qc.refetchQueries({ type: "active" });
                  setCacheTs(offlineCacheTimestamp());
                  toast.success("Dados atualizados");
                }}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Atualizar agora
              </button>
              <button
                onClick={() => {
                  clearOfflineCache();
                  setCacheTs(null);
                  toast.success("Cópia offline apagada");
                }}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold"
              >
                <Trash2 className="h-3.5 w-3.5" /> Apagar cópia offline
              </button>
              <button
                onClick={async () => {
                  await unregisterServiceWorker();
                  toast.success("App reposta — a recarregar…");
                  setTimeout(() => window.location.reload(), 600);
                }}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-semibold"
              >
                <Trash2 className="h-3.5 w-3.5" /> Repor app (limpar caches)
              </button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
