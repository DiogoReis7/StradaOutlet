import { useState } from "react";
import JSZip from "jszip";
import { Database, Download, FileArchive } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { exportCsv, toCsv } from "@/lib/export-csv";
import { ymd } from "@/lib/domain";

const PAGE = 1000;

async function fetchAll<T = any>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = ymd(new Date(y, m, 0));
  return { start, end };
}

type Dataset = { name: string; rows: Record<string, any>[] };

/** Backup mensal: exporta todos os dados do mês em CSV ou num único ZIP. */
export function BackupPanel() {
  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );
  const [busy, setBusy] = useState<null | "csv" | "zip">(null);

  async function collect(month: string): Promise<Dataset[]> {
    const { start, end } = monthRange(month);
    const [emps, prods] = await Promise.all([
      supabase.from("employees").select("id,nome"),
      supabase.from("products").select("id,codigo,nome,peso"),
    ]);
    const empName = new Map((emps.data ?? []).map((e) => [e.id, e.nome]));
    const prod = new Map((prods.data ?? []).map((p) => [p.id, p]));

    const sales = await fetchAll((f, t) =>
      supabase.from("sales_entries")
        .select("employee_id,product_id,data,quantidade")
        .gte("data", start).lte("data", end).order("data").range(f, t),
    );
    const tickets = await fetchAll((f, t) =>
      supabase.from("sgf_tickets")
        .select("senha,servico,employee_id,balcao,emitida_em,inicio_em,fim_em,espera_s,atendimento_s,estado")
        .gte("emitida_em", `${start}T00:00:00`).lte("emitida_em", `${end}T23:59:59`)
        .order("emitida_em").range(f, t),
    );
    const shifts = await fetchAll((f, t) =>
      supabase.from("shift_days")
        .select("employee_id,data,horas,estado,descricao")
        .gte("data", start).lte("data", end).order("data").range(f, t),
    );
    const surveys = await fetchAll((f, t) =>
      supabase.from("nps_surveys")
        .select("employee_id,data,tipo,confirmacao,area_n1,tip_n1,tip_n2,tip_n3,motivo_macro,nota_global,nota_pessoa,classe,raw_name")
        .gte("data", start).lte("data", end).order("data").range(f, t),
    );
    const tele = await fetchAll((f, t) =>
      supabase.from("telemarketing_slots")
        .select("employee_id,data,hora,feito,vendas")
        .gte("data", start).lte("data", end).order("data").range(f, t),
    );
    const notes = await fetchAll((f, t) =>
      supabase.from("day_notes")
        .select("data,texto,autor,created_at")
        .gte("data", start).lte("data", end).order("data").range(f, t),
    );

    // Ociosidade agregada por colaborador/dia a partir das senhas terminadas.
    const idleMap = new Map<string, { atend: number; atendS: number; esperaS: number }>();
    for (const t of tickets as any[]) {
      if (!t.employee_id || (t.estado ?? "").toLowerCase() !== "terminada") continue;
      const iso = String(t.emitida_em).slice(0, 10);
      const key = `${t.employee_id}|${iso}`;
      const cur = idleMap.get(key) ?? { atend: 0, atendS: 0, esperaS: 0 };
      cur.atend += 1;
      cur.atendS += Number(t.atendimento_s ?? 0);
      cur.esperaS += Number(t.espera_s ?? 0);
      idleMap.set(key, cur);
    }

    return [
      {
        name: `vendas-${month}`,
        rows: (sales as any[]).map((s) => ({
          data: s.data,
          colaborador: empName.get(s.employee_id) ?? s.employee_id,
          produto: prod.get(s.product_id)?.nome ?? s.product_id,
          codigo: prod.get(s.product_id)?.codigo ?? "",
          quantidade: Number(s.quantidade),
          peso: Number(prod.get(s.product_id)?.peso ?? 0),
        })),
      },
      {
        name: `senhas-${month}`,
        rows: (tickets as any[]).map((t) => ({
          senha: t.senha,
          servico: t.servico ?? "",
          colaborador: t.employee_id ? (empName.get(t.employee_id) ?? "") : "",
          balcao: t.balcao ?? "",
          emitida_em: t.emitida_em,
          inicio_em: t.inicio_em ?? "",
          fim_em: t.fim_em ?? "",
          espera_s: t.espera_s ?? "",
          atendimento_s: t.atendimento_s ?? "",
          estado: t.estado ?? "",
        })),
      },
      {
        name: `horarios-${month}`,
        rows: (shifts as any[]).map((s) => ({
          data: s.data,
          colaborador: empName.get(s.employee_id) ?? s.employee_id,
          horas: s.horas ?? "",
          estado: s.estado ?? "",
          descricao: s.descricao ?? "",
        })),
      },
      {
        name: `nps-${month}`,
        rows: (surveys as any[]).map((s) => ({
          data: s.data ?? "",
          colaborador: s.employee_id ? (empName.get(s.employee_id) ?? "") : (s.raw_name ?? ""),
          tipo: s.tipo ?? "",
          confirmacao: s.confirmacao ?? "",
          area: s.area_n1 ?? "",
          assunto: [s.tip_n1, s.tip_n2, s.tip_n3].filter(Boolean).join(" › "),
          motivo: s.motivo_macro ?? "",
          nota: (String(s.tipo ?? "").toLowerCase() === "venda" ? (s.nota_pessoa ?? s.nota_global) : (s.nota_global ?? s.nota_pessoa)) ?? "",
          classe: s.classe ?? "",
        })),
      },
      {
        name: `telemarketing-${month}`,
        rows: (tele as any[]).map((t) => ({
          data: t.data,
          colaborador: empName.get(t.employee_id) ?? t.employee_id,
          hora: t.hora,
          feito: t.feito ? "Sim" : "Não",
          vendas: Number(t.vendas ?? 0),
        })),
      },
      {
        name: `ociosidade-${month}`,
        rows: [...idleMap.entries()].map(([key, v]) => {
          const [empId, iso] = key.split("|");
          return {
            data: iso,
            colaborador: empName.get(empId) ?? empId,
            atendimentos: v.atend,
            tempo_atendimento_s: v.atendS,
            tempo_espera_s: v.esperaS,
            tma_s: v.atend ? Math.round(v.atendS / v.atend) : 0,
          };
        }).sort((a, b) => (a.data < b.data ? -1 : 1)),
      },
      {
        name: `notas-${month}`,
        rows: (notes as any[]).map((n) => ({
          data: n.data,
          nota: n.texto,
          autor: n.autor ?? "",
          registada_em: n.created_at,
        })),
      },
    ];
  }

  async function run(mode: "csv" | "zip") {
    setBusy(mode);
    try {
      const sets = await collect(month);
      const total = sets.reduce((a, s) => a + s.rows.length, 0);
      if (!total) {
        toast.info("Sem dados para este mês.");
        return;
      }

      if (mode === "csv") {
        for (const s of sets) if (s.rows.length) exportCsv(`backup-${s.name}`, s.rows);
      } else {
        const zip = new JSZip();
        for (const s of sets) if (s.rows.length) zip.file(`${s.name}.csv`, "\uFEFF" + toCsv(s.rows));
        const blob = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `backup-strada-${month}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      }

      toast.success(
        `Backup ${mode === "zip" ? "ZIP" : "CSV"} gerado: ${total} registos (${sets.filter((s) => s.rows.length).length} ficheiros).`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao gerar backup");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <Database className="h-4 w-4" /> Backup mensal
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Exporta vendas, senhas, horários, NPS, telemarketing, ociosidade e notas do mês escolhido —
        em ficheiros CSV separados ou num único ZIP.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={() => void run("zip")}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-50"
        >
          <FileArchive className="h-4 w-4" />
          {busy === "zip" ? "A gerar…" : "Descarregar ZIP (tudo)"}
        </button>
        <button
          onClick={() => void run("csv")}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {busy === "csv" ? "A gerar…" : "CSV separados"}
        </button>
      </div>
    </div>
  );
}
