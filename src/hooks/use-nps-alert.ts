import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const NPS_DET_THRESHOLD = 0.12; // > 12% de detratores
export const NPS_NET_TARGET = 50;

export type NpsAlertRow = {
  raw_name: string;
  code: string | null;
  employee_id: string | null;
  inqueritos: number;
  netscore: number;
  det_pct: number;
};

export type NpsSummary = { inqueritos: number; netscore: number; detPct: number };

function summarize(rows: NpsAlertRow[]): NpsSummary {
  const totalInq = rows.reduce((a, r) => a + (Number(r.inqueritos) || 0), 0);
  const netscore = totalInq
    ? rows.reduce((a, r) => a + Number(r.netscore) * Number(r.inqueritos), 0) / totalInq
    : 0;
  const detPct = totalInq
    ? rows.reduce((a, r) => a + Number(r.det_pct) * Number(r.inqueritos), 0) / totalInq
    : 0;
  return { inqueritos: totalInq, netscore, detPct };
}

/** Devolve a última snapshot NPS + colaboradores acima do limiar de detratores. */
export function useNpsAlert() {
  return useQuery({
    queryKey: ["nps-latest-alert"],
    queryFn: async () => {
      const { data: snaps } = await supabase
        .from("nps_snapshots")
        .select("id,label,created_at")
        .order("created_at", { ascending: false })
        .limit(2);
      const snap = snaps?.[0] ?? null;
      const prevSnap = snaps?.[1] ?? null;
      if (!snap) {
        return {
          snapshot: null,
          prevSnapshot: null,
          rows: [] as NpsAlertRow[],
          all: [] as NpsAlertRow[],
          summary: null as NpsSummary | null,
          prevSummary: null as NpsSummary | null,
        };
      }
      const ids = prevSnap ? [snap.id, prevSnap.id] : [snap.id];
      const { data: allRows } = await supabase
        .from("nps_scores")
        .select("snapshot_id,raw_name,code,employee_id,inqueritos,netscore,det_pct")
        .in("snapshot_id", ids)
        .order("det_pct", { ascending: false });
      const rowsAll = (allRows ?? []) as (NpsAlertRow & { snapshot_id: string })[];
      const all = rowsAll.filter((r) => r.snapshot_id === snap.id) as NpsAlertRow[];
      const prevRows = prevSnap ? rowsAll.filter((r) => r.snapshot_id === prevSnap.id) : [];
      return {
        snapshot: snap,
        prevSnapshot: prevSnap,
        rows: all.filter((r) => Number(r.det_pct) > NPS_DET_THRESHOLD),
        all,
        summary: summarize(all),
        prevSummary: prevSnap ? summarize(prevRows as NpsAlertRow[]) : null,
      };
    },
    staleTime: 60_000,
  });
}
