import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Wifi, WifiOff, RefreshCw, Database } from "lucide-react";
import { toast } from "sonner";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { offlineCacheTimestamp } from "@/lib/offline-cache";

function hhmm(ts: number) {
  return new Date(ts).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Mostra o estado de ligação e o uso da cache offline, e volta a
 * sincronizar automaticamente assim que a rede regressa.
 */
export function ConnectionStatus() {
  const online = useOnlineStatus();
  const qc = useQueryClient();
  const [cacheTs, setCacheTs] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const wasOffline = useRef(false);

  // Acompanha o carimbo da última cache guardada
  useEffect(() => {
    const read = () => setCacheTs(offlineCacheTimestamp());
    read();
    const t = setInterval(read, 15000);
    return () => clearInterval(t);
  }, []);

  // Sincronização automática ao voltar a rede
  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    let cancelled = false;
    (async () => {
      setSyncing(true);
      try {
        await qc.invalidateQueries();
        await qc.refetchQueries({ type: "active" });
        if (!cancelled) {
          setCacheTs(offlineCacheTimestamp());
          toast.success("Ligação reposta — dados atualizados");
        }
      } catch {
        if (!cancelled) toast.error("Não foi possível atualizar os dados");
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [online, qc]);

  if (!online) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
        <WifiOff className="h-3.5 w-3.5" />
        Sem rede
        <span className="hidden sm:inline font-normal opacity-80">
          · dados guardados{cacheTs ? ` às ${hhmm(cacheTs)}` : ""}
        </span>
      </span>
    );
  }

  if (syncing) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        A sincronizar…
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
      title={cacheTs ? `Cópia offline guardada às ${hhmm(cacheTs)}` : "Sem cópia offline guardada"}
    >
      <Wifi className="h-3.5 w-3.5" />
      Online
      {cacheTs && (
        <span className="hidden sm:inline-flex items-center gap-1 font-normal opacity-80">
          <Database className="h-3 w-3" />
          {hhmm(cacheTs)}
        </span>
      )}
    </span>
  );
}
