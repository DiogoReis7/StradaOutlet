import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RouteError, RouteNotFound, pageHead } from "@/components/RouteBoundary";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { fmtNum, classNames } from "@/lib/domain";
import { toast } from "sonner";
import { AlertTriangle, Upload, Smile, Frown, Meh, Trash2, ChevronDown, X, Users, User } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, Legend, ReferenceLine } from "recharts";
import { useConfirm } from "@/components/ConfirmDialog";
import { NPS_DET_THRESHOLD } from "@/hooks/use-nps-alert";

const npsSearchSchema = z.object({
  emp: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/_authenticated/nps")({
  head: pageHead("NPS · PDS Strada Outlet", "NetScore, detratores e inquéritos por colaborador."),
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
  notFoundComponent: () => <RouteNotFound />,
  validateSearch: zodValidator(npsSearchSchema),
  component: NpsPage,
});

type Snapshot = { id: string; label: string; notas: string | null; created_at: string };
type Score = {
  id: string;
  snapshot_id: string;
  raw_name: string;
  code: string | null;
  employee_id: string | null;
  inqueritos: number;
  netscore: number;
  det_pct: number;
};
type Survey = {
  id: string;
  data: string | null;
  area_n1: string | null;
  tip_n1: string | null;
  tip_n2: string | null;
  tip_n3: string | null;
  motivo_macro: string | null;
  nota_global: number | null;
  nota_pessoa: number | null;
  tipo: string | null;
  classe: string | null;
  raw_name: string | null;
  code: string | null;
  cav: string | null;
  segmento: string | null;
  confirmacao: string | null;
  employee_id: string | null;
};

type ImportIssueKind = "no_match" | "no_id" | "no_nota" | "no_date";
type ImportIssue = {
  line: number;          // linha no CSV (1-indexed, inclui cabeçalho)
  kind: ImportIssueKind;
  reason: string;
  rawName: string;
  extId: string | null;
  ignored: boolean;      // true = não foi importado; false = importado com aviso
};
type ImportReport = {
  fileName: string;
  total: number;
  imported: number;
  ignored: number;
  warnings: number;
  issues: ImportIssue[];
};

/** Deriva tipo (venda/servicing) a partir de area_n1 ou dos campos de tipificação. */
function deriveTipo(area: string | null | undefined, tips: (string | null | undefined)[] = []): "venda" | "servicing" {
  const bag = [area, ...tips].map((v) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")).join(" ");
  return /\bvenda|vendas\b/.test(bag) ? "venda" : "servicing";
}

/** Devolve a nota do inquérito conforme o tipo: venda → Nota_Pergunta_Pessoa; servicing → Nota_Global. */
function surveyNota(s: Survey): number | null {
  const tipo = (s.tipo as "venda" | "servicing" | null) ?? deriveTipo(s.area_n1, [s.tip_n1, s.tip_n2, s.tip_n3]);
  return tipo === "venda" ? (s.nota_pessoa ?? s.nota_global) : (s.nota_global ?? s.nota_pessoa);
}

function TipoBadge({ tipo }: { tipo: string | null | undefined }) {
  const t = (tipo ?? "").toLowerCase();
  if (t !== "venda" && t !== "servicing") return null;
  const cls = t === "venda"
    ? "bg-sky-500/15 text-sky-600 border-sky-500/30"
    : "bg-violet-500/15 text-violet-600 border-violet-500/30";
  return (
    <span className={classNames("inline-block rounded border px-1 py-[1px] text-[9px] font-semibold uppercase tracking-wide", cls)}>
      {t === "venda" ? "Venda" : "Servicing"}
    </span>
  );
}


/** Normaliza o valor de "Confimacao" do CSV para categorias apresentáveis. */
function normalizeConfirmacao(v: unknown): { label: string; kind: "sim" | "nao" | "na" | "outro" } | null {
  const raw = String(v ?? "").trim();
  if (!raw) return null;
  const n = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (n === "sim") return { label: "Sim", kind: "sim" };
  if (n === "nao" || n === "não") return { label: "Não", kind: "nao" };
  if (n === "na" || n === "n/a") return { label: "NA", kind: "na" };
  return { label: raw, kind: "outro" };
}

function ConfirmBadge({ value }: { value: string | null | undefined }) {
  const c = normalizeConfirmacao(value);
  if (!c) return null;
  const cls =
    c.kind === "sim" ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" :
    c.kind === "nao" ? "bg-rose-500/15 text-rose-600 border-rose-500/30" :
    c.kind === "na"  ? "bg-muted text-muted-foreground border-border" :
                       "bg-amber-500/15 text-amber-600 border-amber-500/30";
  return (
    <span className={classNames("ml-1 inline-block rounded border px-1 py-[1px] text-[9px] font-semibold uppercase tracking-wide", cls)}>
      {c.label}
    </span>
  );
}
type Employee = { id: string; nome: string; username_sgf: string | null; ativo: boolean };

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/** Extrai código entre parênteses de "NICOLE TEIXEIRA PINTO (NTPINTO)" → "NTPINTO". */
function extractCode(raw: string): { name: string; code: string | null } {
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) return { name: m[1].trim(), code: m[2].trim().toUpperCase() };
  return { name: raw.trim(), code: null };
}

/** Match employee: primeiro por username_sgf, depois por nome (fallback). */
function matchEmployee(name: string, code: string | null, emps: Employee[]): string | null {
  if (code) {
    const byCode = emps.find((e) => (e.username_sgf ?? "").toUpperCase() === code);
    if (byCode) return byCode.id;
  }
  const nn = norm(name);
  if (!nn) return null;
  // exato
  const exact = emps.find((e) => norm(e.nome) === nn);
  if (exact) return exact.id;
  // por primeiro+último nome (mais tolerante)
  const parts = nn.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0];
    const last = parts[parts.length - 1];
    const cand = emps.find((e) => {
      const en = norm(e.nome).split(/\s+/);
      return en[0] === first && en[en.length - 1] === last;
    });
    if (cand) return cand.id;
  }
  return null;
}

function classifyNota(n: number | null | undefined): "promoter" | "neutral" | "detractor" | null {
  if (n == null || isNaN(Number(n))) return null;
  const v = Number(n);
  if (v >= 9) return "promoter";
  if (v >= 7) return "neutral";
  if (v >= 0) return "detractor";
  return null;
}

/** Parse a CSV string (delimiter auto-detected: ';' or ','). Handles quoted fields. */
function parseCsv(text: string): Record<string, string>[] {
  const stripped = text.replace(/^\uFEFF/, "");
  const firstLine = stripped.split(/\r?\n/)[0] ?? "";
  const sep = firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (inQ) {
      if (ch === '"') {
        if (stripped[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === sep) { cur.push(field); field = ""; }
      else if (ch === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (ch === "\r") { /* skip */ }
      else field += ch;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length === 1 && r[0] === "") continue;
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = (r[j] ?? "").trim();
    out.push(obj);
  }
  return out;
}

/** Accept "YYYY-MM-DD", "DD/MM/YYYY" or Excel serial number. Returns ISO date or null. */
function parseDateLoose(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  // Excel serial (float)
  const n = Number(s);
  if (!isNaN(n) && n > 20000 && n < 80000) {
    const ms = Math.round((n - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

/* ---------------- Page ---------------- */

function NpsPage() {
  const qc = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { emp: empId } = Route.useSearch();
  const navigate = useNavigate();
  const [importing, setImporting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedSurvey, setSelectedSurvey] = useState<Survey | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [showReport, setShowReport] = useState(true);
  const lastCsvFileRef = useRef<File | null>(null);


  const empQ = useQuery({
    queryKey: ["employees-all"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id,nome,username_sgf,ativo").eq("ativo", true).order("nome");
      return (data ?? []) as Employee[];
    },
  });


  const snapsQ = useQuery({
    queryKey: ["nps-snapshots"],
    queryFn: async () => {
      const { data } = await supabase
        .from("nps_snapshots")
        .select("*")
        .order("created_at", { ascending: false });
      return (data ?? []) as Snapshot[];
    },
  });

  const latest = snapsQ.data?.[0] ?? null;

  const scoresQ = useQuery({
    queryKey: ["nps-scores", latest?.id],
    enabled: !!latest,
    queryFn: async () => {
      const { data } = await supabase
        .from("nps_scores")
        .select("*")
        .eq("snapshot_id", latest!.id)
        .order("det_pct", { ascending: false });
      return (data ?? []) as Score[];
    },
  });

  const surveysQ = useQuery({
    queryKey: ["nps-surveys", latest?.id],
    enabled: !!latest,
    queryFn: async () => {
      const { data } = await supabase
        .from("nps_surveys")
        .select("*")
        .eq("snapshot_id", latest!.id)
        .order("data", { ascending: false })
        .limit(5000);
      return (data ?? []) as Survey[];
    },
  });

  // Trend: fetch scores for all snapshots to build a monthly trend chart
  const trendQ = useQuery({
    queryKey: ["nps-trend"],
    queryFn: async () => {
      const { data } = await supabase
        .from("nps_scores")
        .select("snapshot_id,employee_id,inqueritos,netscore,det_pct");
      return (data ?? []) as Pick<Score, "snapshot_id" | "employee_id" | "inqueritos" | "netscore" | "det_pct">[];
    },
  });

  const employees = empQ.data ?? [];
  const rawScores = scoresQ.data ?? [];
  const surveys = surveysQ.data ?? [];

  /**
   * Recomputa métricas (inqueritos/det_pct/netscore) a partir dos inquéritos detalhados
   * quando existem, aplicando a regra Venda→Nota_Pergunta_Pessoa e Servicing→Nota_Global.
   * Quando não há detalhe para o colaborador, mantém os valores do Excel resumo.
   */
  const scores = useMemo<Score[]>(() => {
    if (surveys.length === 0) return rawScores;
    // agrupa surveys por empregado (ou por code/nome quando não emparelhado)
    const buckets = new Map<string, Survey[]>();
    for (const s of surveys) {
      const key = s.employee_id ?? (s.code ? `code:${s.code.toUpperCase()}` : `name:${norm(s.raw_name ?? "")}`);
      const arr = buckets.get(key) ?? [];
      arr.push(s);
      buckets.set(key, arr);
    }
    return rawScores.map((sc) => {
      const key = sc.employee_id ?? (sc.code ? `code:${sc.code.toUpperCase()}` : `name:${norm(extractCode(sc.raw_name).name)}`);
      const bucket = buckets.get(key);
      if (!bucket || bucket.length === 0) return sc;
      let prom = 0, det = 0, tot = 0;
      for (const sv of bucket) {
        const c = classifyNota(surveyNota(sv));
        if (!c) continue;
        tot++;
        if (c === "promoter") prom++;
        else if (c === "detractor") det++;
      }
      if (tot === 0) return sc;
      return {
        ...sc,
        inqueritos: tot,
        det_pct: det / tot,
        netscore: ((prom - det) / tot) * 100,
      };
    }).sort((a, b) => b.det_pct - a.det_pct);
  }, [rawScores, surveys]);

  /** Devolve o(s) surveys correspondentes a um score, com fallback por código e nome normalizado. */
  function surveysForScore(score: Score): Survey[] {
    const targetName = norm(extractCode(score.raw_name).name);
    const targetCode = (score.code ?? "").toUpperCase();
    return surveys.filter((s) => {
      if (score.employee_id && s.employee_id && s.employee_id === score.employee_id) return true;
      const sCode = (s.code ?? "").toUpperCase();
      if (targetCode && sCode && targetCode === sCode) return true;
      const sName = s.raw_name ? norm(extractCode(s.raw_name).name) : "";
      if (targetName && sName && sName === targetName) return true;
      return false;
    });
  }

  const globals = useMemo(() => {
    const src = empId ? scores.filter((s) => s.employee_id === empId) : scores;
    if (src.length === 0) return null;
    const totalInq = src.reduce((a, s) => a + s.inqueritos, 0);
    const totalDet = src.reduce((a, s) => a + s.det_pct * s.inqueritos, 0);
    const weightedNet = src.reduce((a, s) => a + s.netscore * s.inqueritos, 0);
    return {
      inqueritos: totalInq,
      netscore: totalInq ? weightedNet / totalInq : 0,
      det_pct: totalInq ? totalDet / totalInq : 0,
      acima: src.filter((s) => s.det_pct > NPS_DET_THRESHOLD).length,
    };
  }, [scores, empId]);

  // Visão individual: filtra scores para o colaborador selecionado
  const selectedEmp = null;
  const visibleScores = useMemo(
    () => (selectedEmp ? scores.filter((s) => s.employee_id === selectedEmp.id) : scores),
    [scores, selectedEmp],
  );
  const scopeLabel = selectedEmp ? selectedEmp.nome : "Loja";

  // Ao entrar em individual, auto-expande as suas linhas
  useEffect(() => {
    if (selectedEmp) {
      const sc = scores.find((s) => s.employee_id === selectedEmp.id);
      if (sc) setExpanded(sc.id);
    }
  }, [selectedEmp, scores]);

  const detratoresAlerta = visibleScores.filter((s) => s.det_pct > NPS_DET_THRESHOLD);

  /* ---------- Assuntos críticos (mais notas 0-6) ---------- */
  const criticalTopics = useMemo(() => {
    const src = selectedEmp ? surveys.filter((s) => s.employee_id === selectedEmp.id) : surveys;
    if (src.length === 0) return [];
    const empName = new Map(employees.map((e) => [e.id, e.nome] as const));
    const map = new Map<string, { assunto: string; det: number; total: number; who: Map<string, number> }>();
    for (const sv of src) {
      const c = classifyNota(surveyNota(sv));
      if (!c) continue;
      const assunto = [sv.tip_n1, sv.tip_n2].filter(Boolean).join(" › ") || sv.motivo_macro || "Sem assunto";
      const g = map.get(assunto) ?? { assunto, det: 0, total: 0, who: new Map<string, number>() };
      g.total++;
      if (c === "detractor") {
        g.det++;
        const who = (sv.employee_id ? empName.get(sv.employee_id) : null) ?? extractCode(sv.raw_name ?? "").name ?? "—";
        g.who.set(who, (g.who.get(who) ?? 0) + 1);
      }
      map.set(assunto, g);
    }
    return [...map.values()]
      .filter((g) => g.det > 0)
      .map((g) => ({
        assunto: g.assunto,
        det: g.det,
        total: g.total,
        pct: g.total ? g.det / g.total : 0,
        who: [...g.who.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3),
      }))
      .sort((a, b) => b.det - a.det || b.pct - a.pct)
      .slice(0, 8);
  }, [surveys, selectedEmp, employees]);
  const criticalMax = criticalTopics[0]?.det ?? 0;

  /* ---------- Notas 0-6 por colaborador: por nota, quantos e quais assuntos ---------- */
  const detByEmployee = useMemo(() => {
    if (surveys.length === 0) return [];
    const empName = new Map(employees.map((e) => [e.id, e.nome] as const));
    const map = new Map<string, { nome: string; total: number; notas: Map<number, Map<string, number>> }>();
    for (const sv of surveys) {
      const n = surveyNota(sv);
      if (n == null || isNaN(Number(n))) continue;
      const nota = Math.round(Number(n));
      if (nota < 0 || nota > 6) continue;
      const nome = (sv.employee_id ? empName.get(sv.employee_id) : null) ?? extractCode(sv.raw_name ?? "").name;
      if (!nome) continue;
      if (selectedEmp && sv.employee_id !== selectedEmp.id) continue;
      const g = map.get(nome) ?? { nome, total: 0, notas: new Map<number, Map<string, number>>() };
      g.total++;
      const assunto = [sv.tip_n1, sv.tip_n2].filter(Boolean).join(" › ") || sv.motivo_macro || "Sem assunto";
      const bucket = g.notas.get(nota) ?? new Map<string, number>();
      bucket.set(assunto, (bucket.get(assunto) ?? 0) + 1);
      g.notas.set(nota, bucket);
      map.set(nome, g);
    }
    return [...map.values()]
      .map((g) => ({
        nome: g.nome,
        total: g.total,
        notas: [...g.notas.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([nota, assuntos]) => ({
            nota,
            count: [...assuntos.values()].reduce((a, c) => a + c, 0),
            assuntos: [...assuntos.entries()]
              .map(([assunto, count]) => ({ assunto, count }))
              .sort((a, b) => b.count - a.count),
          })),
      }))
      .sort((a, b) => b.total - a.total);
  }, [surveys, selectedEmp, employees]);
  const detEmpMax = detByEmployee[0]?.total ?? 0;

  /* ---------- Trend data (por snapshot / mês) ---------- */
  const trendData = useMemo(() => {
    const snaps = snapsQ.data ?? [];
    const rows = trendQ.data ?? [];
    if (!snaps.length || !rows.length) return [];
    const byId = new Map(snaps.map((s) => [s.id, s]));
    const groups = new Map<string, { inq: number; netW: number; detW: number }>();
    for (const r of rows) {
      if (!byId.has(r.snapshot_id)) continue;
      if (selectedEmp) {
        if (r.employee_id !== selectedEmp.id) continue;
      } else {
        if (!r.employee_id) continue; // ignora sem correspondência
      }
      const g = groups.get(r.snapshot_id) ?? { inq: 0, netW: 0, detW: 0 };
      const n = Number(r.inqueritos) || 0;
      g.inq += n;
      g.netW += (Number(r.netscore) || 0) * n;
      g.detW += (Number(r.det_pct) || 0) * n;
      groups.set(r.snapshot_id, g);
    }
    const out = [] as { key: string; label: string; ts: number; netscore: number; det: number; inq: number }[];
    for (const [sid, g] of groups) {
      const snap = byId.get(sid)!;
      if (g.inq <= 0) continue;
      out.push({
        key: sid,
        label: snap.label || new Date(snap.created_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" }),
        ts: new Date(snap.created_at).getTime(),
        netscore: g.netW / g.inq,
        det: (g.detW / g.inq) * 100,
        inq: g.inq,
      });
    }
    return out.sort((a, b) => a.ts - b.ts);
  }, [snapsQ.data, trendQ.data, selectedEmp]);




  /* ---------- Import handler ---------- */

  const fileScoreRef = useRef<HTMLInputElement>(null);
  const fileSurveyRef = useRef<HTMLInputElement>(null);
  const [pendingLabel, setPendingLabel] = useState("");

  async function importScoreFile(file: File) {
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws, { header: 1, defval: null });
      // encontrar header row (contém "nif_lojista")
      let headerIdx = -1;
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const r = rows[i];
        if (Array.isArray(r) && r.some((c) => String(c ?? "").toLowerCase().includes("nif_lojista"))) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx === -1) throw new Error("Não encontrei cabeçalho com 'nif_lojista'.");
      const headers = (rows[headerIdx] as any[]).map((h) => String(h ?? "").trim().toLowerCase());
      const iName = headers.findIndex((h) => h.includes("nif_lojista"));
      const iInq = headers.findIndex((h) => h.includes("inqu"));
      const iNet = headers.findIndex((h) => h.includes("netscore"));
      const iDet = headers.findIndex((h) => h.includes("detrator"));

      const label = pendingLabel.trim() || `Import ${new Date().toLocaleDateString("pt-PT")}`;
      const { data: snap, error: snapErr } = await supabase
        .from("nps_snapshots")
        .insert({ label })
        .select()
        .single();
      if (snapErr || !snap) throw snapErr ?? new Error("Falha ao criar snapshot");

      const inserts: any[] = [];
      let skipped = 0;
      for (let i = headerIdx + 1; i < rows.length; i++) {
        const r = rows[i] as any[];
        if (!r || !r[iName]) continue;
        const raw = String(r[iName]);
        const { name, code } = extractCode(raw);
        const empId = matchEmployee(name, code, employees);
        if (!empId) { skipped++; continue; }
        const detRaw = Number(r[iDet] ?? 0);
        // se vier "18%" pode ser >1; se vier 0.18 fica igual
        const det_pct = detRaw > 1 ? detRaw / 100 : detRaw;
        inserts.push({
          snapshot_id: snap.id,
          employee_id: empId,
          raw_name: raw,
          code,
          inqueritos: Number(r[iInq] ?? 0) | 0,
          netscore: Number(r[iNet] ?? 0),
          det_pct,
        });
      }
      if (inserts.length) {
        const { error } = await supabase.from("nps_scores").insert(inserts);
        if (error) throw error;
      }
      toast.success(
        `Resumo importado: ${inserts.length} colaboradores${skipped ? ` · ${skipped} ignorados (sem correspondência)` : ""}`
      );

      setPendingLabel("");
      qc.invalidateQueries({ queryKey: ["nps-snapshots"] });
      qc.invalidateQueries({ queryKey: ["nps-latest-alert"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falhou importação");
    } finally {
      setImporting(false);
      if (fileScoreRef.current) fileScoreRef.current.value = "";
    }
  }

  async function importSurveyCsv(file: File) {
    if (!latest) {
      toast.error("Importa primeiro o Excel resumo (cria a snapshot).");
      return;
    }
    lastCsvFileRef.current = file;
    setShowReport(true);
    setImporting(true);
    try {
      // O CSV vem em windows-1252 (não UTF-8). Detecta BOM UTF-8 e cai para 1252 caso contrário.
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const hasUtf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
      let text: string;
      try {
        const enc = hasUtf8Bom ? "utf-8" : "windows-1252";
        text = new TextDecoder(enc).decode(bytes);
      } catch {
        text = new TextDecoder("utf-8").decode(bytes);
      }
      const rows = parseCsv(text);

      const inserts: any[] = [];
      const issues: ImportIssue[] = [];
      for (let idx = 0; idx < rows.length; idx++) {
        const r = rows[idx];
        const line = idx + 2; // +1 header, +1 para 1-index
        // Nome do colaborador: preferir nif_lojista (contém "NOME (CODIGO)"); fallback para dsc_equipa
        const rawName = String(
          r.nif_lojista ?? r.NIF_LOJISTA ?? r.dsc_equipa ?? r.DSC_EQUIPA ?? ""
        ).replace(/^"|"$/g, "").trim();
        const extId = r.ID ?? r.id ?? null;
        if (!rawName && !extId) {
          issues.push({ line, kind: "no_id", reason: "Linha sem nome nem ID", rawName: "—", extId: null, ignored: true });
          continue;
        }
        const { name, code } = extractCode(rawName);
        const empId = rawName ? matchEmployee(name, code, employees) : null;
        if (!empId) {
          issues.push({
            line, kind: "no_match",
            reason: `Sem correspondência no colaborador${code ? ` (código ${code})` : ""}`,
            rawName: rawName || "—", extId, ignored: true,
          });
          continue;
        }
        const toNum = (v: any) => (v != null && v !== "" && !isNaN(Number(v)) ? Number(v) : null);
        const nota = toNum(r.Nota_Global ?? r.nota_global);
        const notaPessoa = toNum(r.Nota_Pergunta_Pessoa ?? r.nota_pergunta_pessoa ?? r.Nota_Pergunta_pessoa);
        const tipo = deriveTipo(r.area_n1, [r.Tipificacao_N1, r.Tipificacao_N2, r.Tipificacao_N3]);
        const notaUsada = tipo === "venda" ? (notaPessoa ?? nota) : (nota ?? notaPessoa);
        const dataParsed = parseDateLoose(r.cod_mes_fecho);
        if (notaUsada == null) {
          issues.push({
            line, kind: "no_nota",
            reason: `Sem nota utilizável para tipo ${tipo} (importado mesmo assim)`,
            rawName: name || rawName, extId, ignored: false,
          });
        }
        if (!dataParsed) {
          issues.push({
            line, kind: "no_date",
            reason: "Data inválida ou vazia (importado sem data)",
            rawName: name || rawName, extId, ignored: false,
          });
        }
        inserts.push({
          snapshot_id: latest.id,
          employee_id: empId,
          ext_id: extId,
          data: dataParsed,
          semana: r.semana ?? null,
          area_n1: r.area_n1 ?? null,
          tip_n1: r.Tipificacao_N1 ?? null,
          tip_n2: r.Tipificacao_N2 ?? null,
          tip_n3: r.Tipificacao_N3 ?? null,
          tip_n4: r.Tipificacao_N4 ?? null,
          tip_n5: r.Tipificacao_N5 ?? null,
          tip_n6: r.Tipificacao_N6 ?? null,
          motivo_macro: r.Motivo_Tratamento_Macro ?? null,
          nota_global: nota,
          nota_pessoa: notaPessoa,
          tipo,
          classe: r.classe_Global ?? null,
          raw_name: rawName || null,
          code,
          cav: r.CAV ?? null,
          segmento: r.segmento ?? null,
          confirmacao: r.Confimacao ?? r.Confirmacao ?? r.confirmacao ?? r.CONFIMACAO ?? null,
        });
      }
      // inserir em lotes de 500
      for (let i = 0; i < inserts.length; i += 500) {
        const batch = inserts.slice(i, i + 500);
        const { error } = await supabase
          .from("nps_surveys")
          .upsert(batch, { onConflict: "snapshot_id,ext_id", ignoreDuplicates: false });
        if (error) throw error;
      }
      const ignored = issues.filter((i) => i.ignored).length;
      const warnings = issues.length - ignored;
      setImportReport({
        fileName: file.name,
        total: rows.length,
        imported: inserts.length,
        ignored,
        warnings,
        issues,
      });
      toast.success(
        `Detalhe importado: ${inserts.length} inquéritos${ignored ? ` · ${ignored} ignorados` : ""}${warnings ? ` · ${warnings} avisos` : ""}`
      );
      qc.invalidateQueries({ queryKey: ["nps-surveys", latest.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falhou importação CSV");
    } finally {
      setImporting(false);
      if (fileSurveyRef.current) fileSurveyRef.current.value = "";
    }
  }

  async function deleteSnapshot(id: string) {
    const ok = await confirm({
      title: "Apagar snapshot NPS?",
      description: "Todos os inquéritos e scores associados serão removidos.",
      confirmLabel: "Apagar",
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase.from("nps_snapshots").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Snapshot apagada");
    qc.invalidateQueries({ queryKey: ["nps-snapshots"] });
    qc.invalidateQueries({ queryKey: ["nps-latest-alert"] });
  }

  return (
    <div>
      <PageHeader
        title="NPS · Melhoria"
        subtitle={`${scopeLabel}${latest ? ` · ${latest.label}` : " · sem dados"}`}
        actions={null}
      />

      <div className="mx-auto max-w-[1400px] space-y-3 p-3">
        {/* Importação */}
        <section className="rounded-lg border bg-card p-3 shadow-sm">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted-foreground">
            <Upload className="mr-1 inline h-4 w-4" /> Importar dados NPS
          </h2>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <input
              type="text"
              value={pendingLabel}
              onChange={(e) => setPendingLabel(e.target.value)}
              placeholder="Etiqueta (ex: Julho 2026)"
              className="rounded-md border bg-background px-3 py-2 text-sm"
            />
            <label className="cursor-pointer rounded-md border bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              {importing ? "A importar…" : "📊 Excel Resumo"}
              <input
                ref={fileScoreRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && importScoreFile(e.target.files[0])}
                disabled={importing}
              />
            </label>
            <label className={classNames(
              "cursor-pointer rounded-md border px-3 py-2 text-sm font-medium hover:bg-accent",
              !latest && "opacity-50 pointer-events-none"
            )}>
              📄 CSV Detalhe
              <input
                ref={fileSurveyRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && importSurveyCsv(e.target.files[0])}
                disabled={importing || !latest}
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            <b>Fluxo:</b> Excel Resumo cria a snapshot (por colaborador: #inquéritos, NetScore, %Detratores).
            CSV Detalhe adiciona cada inquérito com assunto e nota (0-6 detrator · 7-8 neutro · 9-10 promoter).
          </p>
        </section>

        {/* Relatório da última importação CSV */}
        {importReport && (
          <ImportReportPanel
            report={importReport}
            open={showReport}
            onToggle={() => setShowReport((v) => !v)}
            onDismiss={() => setImportReport(null)}
            onReimport={
              lastCsvFileRef.current && !importing
                ? () => lastCsvFileRef.current && importSurveyCsv(lastCsvFileRef.current)
                : undefined
            }
          />
        )}



        {/* Alerta */}
        {detratoresAlerta.length > 0 && (
          <section
            className="rounded-lg border p-3 text-sm"
            style={{
              borderColor: "var(--destructive)",
              background: "color-mix(in oklab, var(--destructive) 12%, transparent)",
              color: "var(--destructive)",
              boxShadow: "none",
            }}
          >
            <div className="font-bold uppercase tracking-wider">
              <AlertTriangle className="mr-1 inline h-4 w-4" />
              Detratores &gt; {(NPS_DET_THRESHOLD * 100).toFixed(0)}% — {detratoresAlerta.length} colaborador(es)
            </div>
            <div className="mt-1 text-foreground/90 font-normal">
              {detratoresAlerta
                .map((d) => `${extractCode(d.raw_name).name} (${(d.det_pct * 100).toFixed(1)}%)`)
                .join(" · ")}
            </div>
          </section>
        )}

        {/* Totais loja */}
        {globals && (
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Inquéritos" value={fmtNum(globals.inqueritos, 0)} />
            <Stat label="NetScore médio" value={fmtNum(globals.netscore, 1)} tone={globals.netscore >= 50 ? "ok" : globals.netscore >= 0 ? "warn" : "bad"} />
            <Stat label="% Detratores" value={`${(globals.det_pct * 100).toFixed(1)}%`} tone={globals.det_pct <= 0.08 ? "ok" : globals.det_pct <= NPS_DET_THRESHOLD ? "warn" : "bad"} />
            <Stat label={selectedEmp ? "Acima do limiar" : "Acima do limiar"} value={fmtNum(globals.acima, 0)} tone={globals.acima === 0 ? "ok" : "bad"} />
          </section>
        )}

        {/* Assuntos críticos */}
        {criticalTopics.length > 0 && (
          <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
            <header className="flex items-baseline justify-between bg-muted/50 px-3 py-2">
              <h3 className="text-xs font-bold uppercase tracking-wider">
                <AlertTriangle className="mr-1 inline h-4 w-4 text-rose-500" />
                Assuntos críticos — {scopeLabel}
              </h3>
              <span className="text-[11px] text-muted-foreground">notas 0-6</span>
            </header>
            <ul className="divide-y">
              {criticalTopics.map((t) => (
                <li key={t.assunto} className="px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1 text-sm font-medium break-words" title={t.assunto}>
                      {t.assunto}
                    </span>
                    <span className="shrink-0 text-right text-xs">
                      <span className="font-bold text-rose-500">{t.det}</span>
                      <span className="text-muted-foreground"> / {t.total} · {(t.pct * 100).toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
                    <div
                      className="h-full rounded bg-rose-500"
                      style={{ width: `${criticalMax ? (t.det / criticalMax) * 100 : 0}%` }}
                    />
                  </div>
                  {!selectedEmp && t.who.length > 0 && (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {t.who.map(([n, c]) => `${n} (${c})`).join(" · ")}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Notas 0-6 por colaborador */}
        {detByEmployee.length > 0 && (
          <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
            <header className="flex items-baseline justify-between bg-muted/50 px-3 py-2">
              <h3 className="text-xs font-bold uppercase tracking-wider">
                <AlertTriangle className="mr-1 inline h-4 w-4 text-rose-500" />
                Notas 0-6 por colaborador — {scopeLabel}
              </h3>
              <span className="text-[11px] text-muted-foreground">nota · quantos · assuntos</span>
            </header>
            <ul className="divide-y">
              {detByEmployee.map((e) => (
                <li key={e.nome} className="px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold" title={e.nome}>
                      {e.nome}
                    </span>
                    <span className="shrink-0 text-xs">
                      <span className="font-bold text-rose-500">{e.total}</span>
                      <span className="text-muted-foreground"> nota{e.total === 1 ? "" : "s"} 0-6</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
                    <div
                      className="h-full rounded bg-rose-500"
                      style={{ width: `${detEmpMax ? (e.total / detEmpMax) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {e.notas.map((n) => (
                      <div key={n.nota} className="flex items-start gap-2">
                        <span
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white"
                          style={{ background: n.nota <= 2 ? "#dc2626" : n.nota <= 4 ? "#f43f5e" : "#fb7185" }}
                        >
                          {n.nota}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="text-[11px] font-semibold text-rose-500 tabular-nums">
                            {n.count} inquérito{n.count === 1 ? "" : "s"}
                          </span>
                          <ul className="mt-0.5 space-y-0.5">
                            {n.assuntos.map((a) => (
                              <li key={a.assunto} className="flex items-center justify-between gap-2 text-[11px]">
                                <span className="min-w-0 flex-1 truncate text-muted-foreground" title={a.assunto}>
                                  {a.assunto}
                                </span>
                                <span className="shrink-0 font-semibold text-rose-500 tabular-nums">{a.count}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Tendência mensal */}
        {trendData.length >= 2 && (
          <section className="rounded-lg border bg-card p-3 shadow-sm">
            <header className="mb-2 flex items-baseline justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider">
                Tendência — {selectedEmp ? selectedEmp.nome : "Loja"}
              </h3>
              <span className="text-[11px] text-muted-foreground">{trendData.length} snapshots</span>
            </header>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis
                    dataKey="ts"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    ticks={trendData.map((d) => d.ts)}
                    tickFormatter={(t: number) => new Date(t).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis yAxisId="net" domain={[-100, 100]} tick={{ fontSize: 11 }} width={36} />
                  <YAxis yAxisId="det" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} width={36} unit="%" />
                  <RTooltip
                    formatter={(v: number, name: string) =>
                      name === "% Detratores" ? [`${v.toFixed(1)}%`, name] : [v.toFixed(1), name]
                    }
                    labelFormatter={(t: number) => new Date(t).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine yAxisId="net" y={50} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: "Alvo Net 50", position: "insideTopLeft", fontSize: 10, fill: "#10b981" }} />
                  <ReferenceLine yAxisId="det" y={12} stroke="#f43f5e" strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: "Alvo Det 12%", position: "insideBottomRight", fontSize: 10, fill: "#f43f5e" }} />
                  <Line yAxisId="net" type="monotone" dataKey="netscore" name="NetScore" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                  <Line yAxisId="det" type="monotone" dataKey="det" name="% Detratores" stroke="#f43f5e" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Ranking colaboradores */}



        {visibleScores.length > 0 && (
          <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
            <header className="bg-muted/50 px-3 py-2 text-xs font-bold uppercase tracking-wider">
              {selectedEmp ? `${selectedEmp.nome} — inquéritos` : "Colaboradores — ordenados por % detratores"}
            </header>
            <div className="divide-y">
              {visibleScores.map((s) => {
                const { name } = extractCode(s.raw_name);
                const acima = s.det_pct > NPS_DET_THRESHOLD;
                return (
                  <div
                    key={s.id}
                    className={classNames(
                      "flex w-full items-center gap-3 px-3 py-2 text-sm",
                      acima && "bg-rose-500/5",
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {s.code ?? "—"} · {s.inqueritos} inquéritos
                        {!s.employee_id && <span className="ml-2 text-amber-500">⚠ sem correspondência</span>}
                      </div>
                    </div>
                    <div className="w-20 text-right tabular-nums">
                      <div className="text-[10px] uppercase text-muted-foreground">NetScore</div>
                      <div className={classNames("font-bold", s.netscore >= 50 ? "text-emerald-500" : s.netscore >= 0 ? "text-amber-500" : "text-rose-500")}>
                        {fmtNum(s.netscore, 1)}
                      </div>
                    </div>
                    <div className="w-24 text-right tabular-nums">
                      <div className="text-[10px] uppercase text-muted-foreground">% Detrat.</div>
                      <div className={classNames("font-bold", acima ? "text-rose-500" : "text-emerald-500")}>
                        {(s.det_pct * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}




        {!latest && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Sem dados NPS. Importa o Excel resumo para começar.
          </div>
        )}
        {latest && selectedEmp && visibleScores.length === 0 && (
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Sem dados NPS para <b>{selectedEmp.nome}</b> nesta snapshot.
          </div>
        )}
      </div>
      {confirmDialog}
    </div>

  );
}

/* ------- helpers ------- */

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "bad" }) {
  const t =
    tone === "ok" ? "text-emerald-500" :
    tone === "warn" ? "text-amber-500" :
    tone === "bad" ? "text-rose-500" : "text-foreground";
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-lg font-extrabold tabular-nums ${t}`}>{value}</div>
    </div>
  );
}

function SurveyList({ surveys, onOpen }: { surveys: Survey[]; onOpen?: (s: Survey) => void }) {
  const [tipoFilter, setTipoFilter] = useState<"all" | "venda" | "servicing">("all");
  const tipoOf = (s: Survey) =>
    (s.tipo as "venda" | "servicing" | null) ?? deriveTipo(s.area_n1, [s.tip_n1, s.tip_n2, s.tip_n3]);
  const filtered = useMemo(
    () => (tipoFilter === "all" ? surveys : surveys.filter((s) => tipoOf(s) === tipoFilter)),
    [surveys, tipoFilter],
  );
  const stats = useMemo(() => {
    let p = 0, n = 0, d = 0;
    for (const s of filtered) {
      const c = classifyNota(surveyNota(s));
      if (c === "promoter") p++;
      else if (c === "neutral") n++;
      else if (c === "detractor") d++;
    }
    return { p, n, d };
  }, [filtered]);
  const counts = useMemo(() => {
    let v = 0, sv = 0;
    for (const s of surveys) (tipoOf(s) === "venda" ? v++ : sv++);
    return { v, sv, total: surveys.length };
  }, [surveys]);
  const btn = (key: "all" | "venda" | "servicing", label: string, count: number) => (
    <button
      type="button"
      onClick={() => setTipoFilter(key)}
      className={classNames(
        "rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors",
        tipoFilter === key
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:bg-accent",
      )}
    >
      {label} <span className="opacity-70">({count})</span>
    </button>
  );
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {btn("all", "Ambos", counts.total)}
          {btn("venda", "Venda", counts.v)}
          {btn("servicing", "Servicing", counts.sv)}
        </div>
        <div className="ml-auto flex gap-3 text-xs">
          <span className="text-emerald-500 font-semibold"><Smile className="inline h-3 w-3 mr-0.5" />{stats.p}</span>
          <span className="text-amber-500 font-semibold"><Meh className="inline h-3 w-3 mr-0.5" />{stats.n}</span>
          <span className="text-rose-500 font-semibold"><Frown className="inline h-3 w-3 mr-0.5" />{stats.d}</span>
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto rounded border">
        <table className="w-full text-xs">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-2 py-1 text-left">Data</th>
              <th className="px-2 py-1 text-left">Tipo</th>
              <th className="px-2 py-1 text-left">Área</th>
              <th className="px-2 py-1 text-left">Assunto</th>
              <th className="px-2 py-1 text-right">Nota</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((s) => {
              const nota = surveyNota(s);
              const c = classifyNota(nota);
              const tipo = tipoOf(s);
              return (
                <tr
                  key={s.id}
                  onClick={() => onOpen?.(s)}
                  className={classNames("border-t", onOpen && "cursor-pointer hover:bg-accent/50")}
                >
                  <td className="px-2 py-1 text-muted-foreground">{s.data ?? "—"}</td>
                  <td className="px-2 py-1"><TipoBadge tipo={tipo} /></td>
                  <td className="px-2 py-1">{s.area_n1 ?? "—"}</td>
                  <td className="px-2 py-1 max-w-[320px]" title={[s.tip_n1, s.tip_n2, s.tip_n3].filter(Boolean).join(" › ")}>
                    <span className="truncate align-middle">{[s.tip_n1, s.tip_n2, s.tip_n3].filter(Boolean).join(" › ") || "—"}</span>
                    <ConfirmBadge value={s.confirmacao} />
                  </td>
                  <td className={classNames(
                    "px-2 py-1 text-right font-bold tabular-nums",
                    c === "promoter" && "text-emerald-500",
                    c === "neutral" && "text-amber-500",
                    c === "detractor" && "text-rose-500",
                  )}>
                    {nota ?? "—"}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-2 py-4 text-center text-muted-foreground">Sem inquéritos deste tipo.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 200 && (
        <div className="mt-1 text-[10px] text-muted-foreground">A mostrar 200 de {filtered.length} inquéritos.</div>
      )}
    </div>
  );
}

function SurveyModal({
  survey, onClose, personName, personSurveys = [], personScore = null,
}: {
  survey: Survey;
  onClose: () => void;
  personName?: string;
  personSurveys?: Survey[];
  personScore?: Score | null;
}) {
  const nota = surveyNota(survey);
  const c = classifyNota(nota);
  const toneClr = c === "promoter" ? "text-emerald-500" : c === "neutral" ? "text-amber-500" : c === "detractor" ? "text-rose-500" : "text-foreground";
  const toneLabel = c === "promoter" ? "Promoter" : c === "neutral" ? "Neutro" : c === "detractor" ? "Detrator" : "—";
  const name = personName ?? (survey.raw_name ? extractCode(survey.raw_name).name : "—");
  // Métricas agregadas da pessoa (a partir dos inquéritos detalhados)
  let pProm = 0, pNeut = 0, pDet = 0;
  for (const s of personSurveys) {
    const cc = classifyNota(surveyNota(s));
    if (cc === "promoter") pProm++;
    else if (cc === "neutral") pNeut++;
    else if (cc === "detractor") pDet++;
  }
  const pTot = pProm + pNeut + pDet;
  const pDetPct = personScore ? personScore.det_pct * 100 : (pTot ? (pDet / pTot) * 100 : 0);
  const pNet = personScore ? personScore.netscore : (pTot ? ((pProm - pDet) / pTot) * 100 : 0);
  const pInq = personScore ? personScore.inqueritos : pTot;
  const hasPerson = pInq > 0;
  const assunto = [survey.tip_n1, survey.tip_n2, survey.tip_n3].filter(Boolean).join(" › ") || "—";
  const tipo = (survey.tipo as "venda" | "servicing" | null) ?? deriveTipo(survey.area_n1, [survey.tip_n1, survey.tip_n2, survey.tip_n3]);
  const notaSource = tipo === "venda" ? "Nota_Pergunta_Pessoa" : "Nota_Global";
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Inquérito NPS</div>
            <div className="font-bold">{name}</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 hover:bg-accent"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {hasPerson && (
          <div className="border-b bg-muted/30 px-4 py-2.5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Métricas do colaborador
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Inquéritos</div>
                <div className="text-base font-extrabold tabular-nums">{pInq}</div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">NetScore</div>
                <div className={classNames("text-base font-extrabold tabular-nums", pNet >= 0 ? "text-emerald-500" : "text-rose-500")}>
                  {pNet.toFixed(1)}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">% Detratores</div>
                <div className={classNames("text-base font-extrabold tabular-nums", pDetPct > NPS_DET_THRESHOLD * 100 ? "text-rose-500" : "text-emerald-500")}>
                  {pDetPct.toFixed(1)}%
                </div>
              </div>
            </div>
            {pTot > 0 && (
              <div className="mt-1.5 flex items-center justify-center gap-3 text-[10px]">
                <span className="text-emerald-500"><Smile className="inline h-3 w-3" /> {pProm} prom.</span>
                <span className="text-amber-500"><Meh className="inline h-3 w-3" /> {pNeut} neut.</span>
                <span className="text-rose-500"><Frown className="inline h-3 w-3" /> {pDet} detr.</span>
              </div>
            )}
          </div>
        )}
        <div className="grid gap-2 p-4 text-sm">
          <Row label="Data" value={survey.data ?? "—"} />
          <Row label="Tipo">
            <TipoBadge tipo={tipo} />
          </Row>
          <Row label="Nota">
            <span className={classNames("text-lg font-extrabold tabular-nums", toneClr)}>
              {nota ?? "—"}
            </span>
            <span className={classNames("ml-2 text-xs font-semibold uppercase", toneClr)}>{toneLabel}</span>
            <span className="ml-2 text-[10px] text-muted-foreground">({notaSource})</span>
          </Row>
          <Row label="Área" value={survey.area_n1 ?? "—"} />
          <Row label="Assunto">
            <span>{assunto}</span>
            <ConfirmBadge value={survey.confirmacao} />
          </Row>
          <Row label="Confirmação" value={normalizeConfirmacao(survey.confirmacao)?.label ?? "—"} />
          <Row label="Motivo macro" value={survey.motivo_macro ?? "—"} />
          <Row label="Segmento" value={survey.segmento ?? "—"} />
          <Row label="CAV" value={survey.cav ?? "—"} />
          <Row label="Classe" value={survey.classe ?? "—"} />
          <Row label="Código" value={survey.code ?? "—"} />
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, children }: { label: string; value?: string; children?: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-baseline gap-2 border-b border-dashed pb-1.5 last:border-0">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words">{children ?? value}</div>
    </div>
  );
}

const ISSUE_LABEL: Record<ImportIssueKind, string> = {
  no_match: "Sem correspondência",
  no_id: "Sem nome/ID",
  no_nota: "Sem nota",
  no_date: "Sem data",
};
const ISSUE_TONE: Record<ImportIssueKind, string> = {
  no_match: "bg-rose-500/10 text-rose-600 border-rose-500/30",
  no_id: "bg-rose-500/10 text-rose-600 border-rose-500/30",
  no_nota: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  no_date: "bg-amber-500/10 text-amber-600 border-amber-500/30",
};

function ImportReportPanel({
  report, open, onToggle, onDismiss, onReimport,
}: {
  report: ImportReport;
  open: boolean;
  onToggle: () => void;
  onDismiss: () => void;
  onReimport?: () => void;
}) {
  const hasIssues = report.issues.length > 0;
  const grouped = useMemo(() => {
    const g: Record<ImportIssueKind, ImportIssue[]> = { no_match: [], no_id: [], no_nota: [], no_date: [] };
    for (const it of report.issues) g[it.kind].push(it);
    return g;
  }, [report.issues]);

  function downloadCsv() {
    const header = "linha;tipo;motivo;colaborador;ext_id;ignorado";
    const body = report.issues.map((i) =>
      [i.line, ISSUE_LABEL[i.kind], i.reason.replace(/;/g, ","), i.rawName.replace(/;/g, ","), i.extId ?? "", i.ignored ? "sim" : "não"].join(";"),
    ).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nps-import-report-${report.fileName.replace(/\.[^.]+$/, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className={classNames(
      "overflow-hidden rounded-lg border shadow-sm",
      hasIssues ? "border-amber-500/40 bg-amber-500/5" : "border-emerald-500/40 bg-emerald-500/5",
    )}>
      <header className="flex items-center gap-2 px-3 py-2 text-xs">
        <button onClick={onToggle} className="flex flex-1 items-center gap-2 text-left">
          <ChevronDown className={classNames("h-4 w-4 shrink-0 transition-transform", !open && "-rotate-90")} />
          <div className="min-w-0 flex-1">
            <div className="font-bold uppercase tracking-wider">Última importação · {report.fileName}</div>
            <div className="text-muted-foreground">
              {report.total} linhas · <span className="text-emerald-600 font-semibold">{report.imported} importadas</span>
              {report.ignored > 0 && <> · <span className="text-rose-600 font-semibold">{report.ignored} ignoradas</span></>}
              {report.warnings > 0 && <> · <span className="text-amber-600 font-semibold">{report.warnings} avisos</span></>}
            </div>
          </div>
        </button>
        {onReimport && (
          <button
            onClick={onReimport}
            className="rounded-md border bg-card px-2 py-1 text-[11px] font-semibold hover:bg-accent"
            title="Reimportar o mesmo CSV"
          >
            ↻ Reimportar
          </button>
        )}
        {hasIssues && (
          <button
            onClick={downloadCsv}
            className="rounded-md border bg-card px-2 py-1 text-[11px] font-semibold hover:bg-accent"
            title="Exportar problemas (CSV)"
          >
            ⤓ CSV
          </button>
        )}
        <button
          onClick={onDismiss}
          className="rounded-md p-1 text-muted-foreground hover:bg-accent"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      {open && (
        <div className="border-t bg-card/60 px-3 py-2">
          {!hasIssues ? (
            <div className="py-2 text-center text-xs text-emerald-600">
              ✓ Todas as linhas foram importadas sem problemas.
            </div>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap gap-1 text-[10px]">
                {(Object.keys(grouped) as ImportIssueKind[]).map((k) => grouped[k].length > 0 && (
                  <span key={k} className={classNames("rounded border px-1.5 py-0.5 font-semibold", ISSUE_TONE[k])}>
                    {ISSUE_LABEL[k]}: {grouped[k].length}
                  </span>
                ))}
              </div>
              <div className="max-h-64 overflow-y-auto rounded border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80">
                    <tr>
                      <th className="px-2 py-1 text-left">Linha</th>
                      <th className="px-2 py-1 text-left">Tipo</th>
                      <th className="px-2 py-1 text-left">Colaborador</th>
                      <th className="px-2 py-1 text-left">Motivo</th>
                      <th className="px-2 py-1 text-left">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.issues.slice(0, 300).map((it, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1 tabular-nums text-muted-foreground">{it.line}</td>
                        <td className="px-2 py-1">
                          <span className={classNames("rounded border px-1 py-[1px] text-[9px] font-semibold", ISSUE_TONE[it.kind])}>
                            {ISSUE_LABEL[it.kind]}
                          </span>
                        </td>
                        <td className="px-2 py-1 truncate max-w-[200px]" title={it.rawName}>{it.rawName}</td>
                        <td className="px-2 py-1 text-muted-foreground">{it.reason}</td>
                        <td className={classNames("px-2 py-1 font-semibold", it.ignored ? "text-rose-600" : "text-amber-600")}>
                          {it.ignored ? "Ignorado" : "Aviso"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {report.issues.length > 300 && (
                <div className="mt-1 text-[10px] text-muted-foreground">A mostrar 300 de {report.issues.length}. Exporta o CSV para ver todos.</div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}



