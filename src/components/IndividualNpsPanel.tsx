import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Smile, Meh, Frown, Star } from "lucide-react";

type Survey = {
  id: string;
  employee_id: string | null;
  area_n1: string | null;
  tip_n1: string | null;
  tip_n2: string | null;
  tip_n3: string | null;
  nota_global: number | null;
  nota_pessoa: number | null;
  tipo: string | null;
};

function deriveTipo(area: string | null | undefined, tips: (string | null | undefined)[] = []): "venda" | "servicing" {
  const bag = [area, ...tips]
    .map((v) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
    .join(" ");
  return /\bvenda|vendas\b/.test(bag) ? "venda" : "servicing";
}
function surveyNota(s: Survey): number | null {
  const tipo = (s.tipo as "venda" | "servicing" | null) ?? deriveTipo(s.area_n1, [s.tip_n1, s.tip_n2, s.tip_n3]);
  return tipo === "venda" ? (s.nota_pessoa ?? s.nota_global) : (s.nota_global ?? s.nota_pessoa);
}
function classify(n: number | null | undefined): "promoter" | "neutral" | "detractor" | null {
  if (n == null || isNaN(Number(n))) return null;
  const v = Number(n);
  if (v >= 9) return "promoter";
  if (v >= 7) return "neutral";
  if (v >= 0) return "detractor";
  return null;
}

export function IndividualNpsPanel({ employeeId }: { employeeId: string | undefined }) {
  const q = useQuery({
    queryKey: ["nps-individual", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data: snap } = await supabase
        .from("nps_snapshots")
        .select("id,label,created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!snap) return { snap: null, surveys: [] as Survey[] };
      const { data } = await supabase
        .from("nps_surveys")
        .select("id,employee_id,area_n1,tip_n1,tip_n2,tip_n3,nota_global,nota_pessoa,tipo")
        .eq("snapshot_id", snap.id)
        .eq("employee_id", employeeId!);
      return { snap, surveys: (data ?? []) as Survey[] };
    },
    staleTime: 60_000,
  });

  const groups = useMemo(() => {
    const surveys = q.data?.surveys ?? [];
    const buckets: Record<"venda" | "servicing", Survey[]> = { venda: [], servicing: [] };
    for (const s of surveys) {
      const t = (s.tipo as "venda" | "servicing" | null) ?? deriveTipo(s.area_n1, [s.tip_n1, s.tip_n2, s.tip_n3]);
      buckets[t].push(s);
    }
    return buckets;
  }, [q.data]);

  if (!employeeId) return null;
  if (q.isLoading) return null;
  const surveys = q.data?.surveys ?? [];
  if (!q.data?.snap || surveys.length === 0) return null;

  // Totais globais (Venda + Servicing agregados)
  let tProm = 0, tNeut = 0, tDet = 0;
  for (const s of surveys) {
    const c = classify(surveyNota(s));
    if (c === "promoter") tProm++;
    else if (c === "neutral") tNeut++;
    else if (c === "detractor") tDet++;
  }
  const tTot = tProm + tNeut + tDet;
  const tDetPct = tTot > 0 ? (tDet / tTot) * 100 : 0;
  const tNet = tTot > 0 ? ((tProm - tDet) / tTot) * 100 : 0;

  return (
    <section className="mb-2 overflow-hidden rounded-lg border bg-card shadow-sm">
      <header
        className="flex items-center justify-between gap-2 px-2.5 py-1 text-white"
        style={{ background: "linear-gradient(90deg, var(--neon-pink), color-mix(in oklab, var(--neon-pink) 55%, black))" }}
      >
        <h2 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-black/85">
          <Star className="h-3 w-3" /> NPS individual · {q.data.snap.label ?? "última snapshot"}
        </h2>
        <span className="text-[10px] text-black/80 tabular-nums font-semibold">
          {tTot} inquérito{tTot === 1 ? "" : "s"}
        </span>
      </header>
      <div className="grid grid-cols-3 gap-px bg-border">
        <TotalCell label="Inquéritos" value={String(tTot)} tone="var(--foreground)" />
        <TotalCell label="NetScore" value={tNet.toFixed(1)} tone={tNet >= 0 ? "#22c55e" : "var(--destructive)"} />
        <TotalCell label="% Detratores" value={`${tDetPct.toFixed(1)}%`} tone={tDetPct > 20 ? "var(--destructive)" : "#22c55e"} />
      </div>
      <div className="grid grid-cols-1 gap-px bg-border md:grid-cols-2 border-t">
        <TipoBlock label="Venda" color="var(--neon-blue)" surveys={groups.venda} />
        <TipoBlock label="Servicing" color="var(--neon-violet)" surveys={groups.servicing} />
      </div>
    </section>
  );
}

function TotalCell({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="bg-card px-2 py-1.5 text-center">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="tabular-nums text-base font-black leading-tight" style={{ color: tone }}>{value}</div>
    </div>
  );
}


function TipoBlock({ label, color, surveys }: { label: string; color: string; surveys: Survey[] }) {
  const stats = useMemo(() => {
    let prom = 0, neut = 0, det = 0;
    for (const s of surveys) {
      const c = classify(surveyNota(s));
      if (c === "promoter") prom++;
      else if (c === "neutral") neut++;
      else if (c === "detractor") det++;
    }
    const total = prom + neut + det;
    const detPct = total > 0 ? (det / total) * 100 : 0;
    const promPct = total > 0 ? (prom / total) * 100 : 0;
    const net = total > 0 ? promPct - detPct : 0;
    return { prom, neut, det, total, detPct, net };
  }, [surveys]);

  return (
    <div className="bg-card p-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-black"
            style={{ background: color }}
          >
            {label}
          </span>
          <span className="text-[10px] text-muted-foreground tabular-nums">{stats.total} inq.</span>
        </div>
        {stats.total > 0 && (
          <div className="flex items-center gap-2 text-[10px]">
            <span className="tabular-nums text-muted-foreground">Net <b className="text-foreground">{stats.net.toFixed(0)}</b></span>
            <span
              className="tabular-nums font-bold"
              style={{ color: stats.detPct > 20 ? "var(--destructive)" : "var(--neon-green)" }}
            >
              {stats.detPct.toFixed(1)}% det
            </span>
          </div>
        )}
      </div>

      {stats.total === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">Sem inquéritos.</p>
      ) : (
        <div className="mt-1.5 grid grid-cols-3 gap-1 text-center text-[10px]">
          <CountPill icon={Smile} label="Promotores" value={stats.prom} tone="#22c55e" />
          <CountPill icon={Meh} label="Neutros" value={stats.neut} tone="#eab308" />
          <CountPill icon={Frown} label="Detratores" value={stats.det} tone="var(--destructive)" />
        </div>
      )}
    </div>
  );
}


function CountPill({ icon: Icon, label, value, tone }: { icon: typeof Smile; label: string; value: number; tone: string }) {
  return (
    <div
      className="rounded-md border px-1.5 py-1"
      style={{
        borderColor: `color-mix(in oklab, ${tone} 40%, transparent)`,
        background: `color-mix(in oklab, ${tone} 8%, transparent)`,
      }}
    >
      <div className="flex items-center justify-center gap-1 text-[9px] uppercase tracking-wider" style={{ color: tone }}>
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="tabular-nums text-sm font-bold" style={{ color: tone }}>{value}</div>
    </div>
  );
}
