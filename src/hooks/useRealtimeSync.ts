import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Map DB tables to the React Query key prefixes they affect.
const TABLE_KEYS: Record<string, string[]> = {
  sales_entries: [
    "sales", "sales-day", "sales-month", "emp-month-agg",
    "desempenho-sales", "desempenho-sales-prev", "trend-sales",
    "home-today-sales", "home-chart-sales", "home-highlights-sales",
    "home-highlights-sales-prev", "challenges-sales", "tv-sales", "week-sales",
  ],
  sgf_tickets: [
    "sgf-list", "sgf-day", "sgf-month", "sgf-kpi",
    "desempenho-sgf", "desempenho-sgf-prev", "trend-sgf", "desempenho-idle",
    "home-today-tickets", "home-chart-tickets", "week-tickets",
  ],
  shift_days: ["shift_days", "shifts-day", "shift-day", "desempenho-shifts", "desempenho-idle"],
  employees: [
    "employees", "employees-all", "employees-username", "employees-active-obj",
    "home-highlights-employees", "tv-emp", "week-emps",
  ],
  products: ["products", "products-all", "products-min", "tv-prod"],
  weight_overrides: ["weight_overrides"],
  nps_snapshots: ["nps-snapshots", "nps-latest-alert", "nps-trend", "home-chart-nps", "week-nps-snapshot", "week-nps"],
  nps_scores: ["nps-scores", "nps-latest-alert", "nps-trend", "home-chart-nps", "nps-individual", "challenges-nps-latest", "week-nps"],
  nps_surveys: ["nps-surveys", "nps-individual", "week-nps"],
  telemarketing_slots: ["telemarketing"],
  challenges: ["challenges", "challenges-active", "home-highlights-challenges", "tv-challenges"],

  day_notes: ["day-notes"],

};


/**
 * Subscribes to Postgres changes on the main tables and invalidates only the
 * matching React Query caches, with per-table debounce to avoid storms during
 * bulk imports.
 *
 * Handles reconnection: if the socket drops (network loss, sleep, tab in
 * background), the channel is torn down and re-created with exponential
 * backoff, and every cache is refetched once the link is restored so no
 * change made while offline is lost.
 */
export type RealtimeStatus = "connecting" | "live" | "offline";

export function useRealtimeSync(): RealtimeStatus {
  const qc = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  useEffect(() => {
    let disposed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let hadDrop = false;
    const pending: Record<string, ReturnType<typeof setTimeout> | undefined> = {};

    const schedule = (table: string) => {
      if (pending[table]) clearTimeout(pending[table]);
      pending[table] = setTimeout(() => {
        const keys = TABLE_KEYS[table] ?? [];
        for (const key of keys) {
          qc.invalidateQueries({ queryKey: [key] });
        }
        pending[table] = undefined;
      }, 300);
    };

    // Full resync after a reconnect: anything that changed while we were
    // disconnected never produced an event, so refetch everything active.
    // The toast reuses a fixed id (never stacks) and is throttled so uma
    // sequência de reconexões seguidas não enche o ecrã de notificações.
    let lastToastAt = 0;
    const resyncAll = () => {
      qc.invalidateQueries();
      const now = Date.now();
      if (now - lastToastAt < 20000) return;
      lastToastAt = now;
      toast.success("Ligação restabelecida — dados atualizados.", {
        id: "realtime-reconnect",
        duration: 2500,
      });
    };

    const teardown = () => {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };

    const scheduleReconnect = () => {
      if (disposed || retryTimer) return;
      const delay = Math.min(30000, 1000 * 2 ** retry);
      retry += 1;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        teardown();
        connect();
      }, delay);
    };

    function connect() {
      if (disposed) return;
      const ch = supabase.channel(`app-realtime-${Date.now()}`);
      channel = ch;

      for (const table of Object.keys(TABLE_KEYS)) {
        (ch as unknown as {
          on: (
            type: "postgres_changes",
            filter: { event: "*"; schema: string; table: string },
            cb: () => void,
          ) => void;
        }).on(
          "postgres_changes",
          { event: "*", schema: "public", table },
          () => schedule(table),
        );
      }

      ch.subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          retry = 0;
          setStatus("live");
          if (hadDrop) {
            hadDrop = false;
            resyncAll();
          }
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          hadDrop = true;
          setStatus("offline");
          scheduleReconnect();
        }
      });
    }

    // Browser regained connectivity or the tab became visible again: force an
    // immediate reconnect attempt instead of waiting out the backoff.
    const kick = () => {
      if (disposed) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      const state = (channel as unknown as { state?: string } | null)?.state;
      if (!channel || state === "closed" || state === "errored") {
        hadDrop = true;
        retry = 0;
        setStatus("connecting");
        teardown();
        connect();
      } else if (hadDrop) {
        resyncAll();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") kick();
    };

    connect();
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      disposed = true;
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", onVisibility);
      if (retryTimer) clearTimeout(retryTimer);
      for (const t of Object.keys(pending)) {
        if (pending[t]) clearTimeout(pending[t]);
      }
      teardown();
    };
  }, [qc]);

  return status;
}

