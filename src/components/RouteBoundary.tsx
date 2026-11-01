import { useRouter } from "@tanstack/react-router";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";

/** Componente de erro reutilizável por rota. */
export function RouteError({ error, reset }: { error: Error; reset?: () => void }) {
  const router = useRouter();
  return (
    <div className="grid min-h-[50vh] place-items-center p-6 text-center animate-fade-in">
      <div className="max-w-md">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
        <p className="mt-3 text-sm font-medium">Não foi possível carregar esta página.</p>
        <p className="mt-1 text-xs text-muted-foreground break-words">{error?.message || "Erro desconhecido"}</p>
        <button
          onClick={() => { router.invalidate(); reset?.(); }}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
        >
          <RefreshCw className="h-4 w-4" /> Tentar de novo
        </button>
      </div>
    </div>
  );
}

export function RouteNotFound() {
  return (
    <div className="grid min-h-[50vh] place-items-center p-6 text-center">
      <p className="text-sm text-muted-foreground">Página não encontrada.</p>
    </div>
  );
}

/** Estado vazio consistente em toda a app. */
export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center">
      <div className="text-muted-foreground">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** head() consistente por rota. */
export function pageHead(title: string, description: string) {
  return () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  });
}
