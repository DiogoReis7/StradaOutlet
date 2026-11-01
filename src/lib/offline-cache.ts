import type { QueryClient } from "@tanstack/react-query";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const KEY = "ls-offline-cache";
const MAX_AGE = 1000 * 60 * 60 * 24; // 24 horas

/**
 * Guarda as últimas leituras (React Query) no armazenamento local do
 * dispositivo, para que a app abra com dados mesmo sem rede.
 * Só corre no browser — no servidor é ignorado.
 */
export function enableOfflineCache(queryClient: QueryClient) {
  if (typeof window === "undefined") return;
  try {
    const persister = createSyncStoragePersister({
      storage: window.localStorage,
      key: KEY,
      throttleTime: 2000,
    });
    persistQueryClient({
      queryClient,
      persister,
      maxAge: MAX_AGE,
      buster: "v1",
      dehydrateOptions: {
        // Não guardamos consultas em erro nem dados sensíveis de sessão
        shouldDehydrateQuery: (q) =>
          q.state.status === "success" && !String(q.queryHash).includes("auth"),
      },
    });
  } catch {
    // localStorage indisponível (modo privado) — segue sem cache offline
  }
}

/** Limpa a cache offline guardada no dispositivo. */
export function clearOfflineCache() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

/** Timestamp da última sincronização guardada, se existir. */
export function offlineCacheTimestamp(): number | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { timestamp?: number };
    return typeof parsed.timestamp === "number" ? parsed.timestamp : null;
  } catch {
    return null;
  }
}
