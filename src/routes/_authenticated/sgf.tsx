import { createFileRoute } from "@tanstack/react-router";
import { RouteError, RouteNotFound, pageHead } from "@/components/RouteBoundary";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { fmtSecsAsTime, ymd } from "@/lib/domain";
import { useConfirm } from "@/components/ConfirmDialog";
import { Search, Upload, RefreshCw, FileSpreadsheet, Trash2 } from "lucide-react";
import Papa from "papaparse";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/sgf")({
  head: pageHead("Senhas SGF · PDS Strada Outlet", "Importação e consulta de senhas, esperas e atendimentos."),
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
  notFoundComponent: () => <RouteNotFound />,
  component: SgfPage,
});

function SgfPage() {
  const qc = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState<string>("");
  const [page, setPage] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const PER = 50;

  const ticketsQ = useQuery({
    queryKey: ["sgf-list", q, estado, page],
    queryFn: async () => {
      let qry = supabase.from("sgf_tickets").select("*", { count: "exact" })
        .order("emitida_em", { ascending: false }).range(page * PER, page * PER + PER - 1);
      if (estado) qry = qry.eq("estado", estado);
      if (q) qry = qry.or(`senha.ilike.%${q}%,nome_staff.ilike.%${q}%,servico.ilike.%${q}%`);
      const { data, error, count } = await qry;
      if (error) throw error;
      return { rows: data, count };
    },
  });

  const employeesQ = useQuery({
    queryKey: ["employees-username"],
    queryFn: async () => (await supabase.from("employees").select("id,username_sgf,nome_sgf,nome")).data ?? [],
  });

  const totalPages = useMemo(
    () => (ticketsQ.data?.count ? Math.ceil(ticketsQ.data.count / PER) : 0),
    [ticketsQ.data?.count],
  );

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["sgf-list"] });
    qc.invalidateQueries({ queryKey: ["sgf-month"] });
    qc.invalidateQueries({ queryKey: ["sgf-kpi"] });
    toast.success("Senhas atualizadas.");
  }

  async function onFile(file: File) {
    setUploading(true);
    setProgress("A ler ficheiro…");
    try {
      const text = await file.text();
      const parsed = Papa.parse<Record<string, string>>(text, {
        header: true, skipEmptyLines: true, delimiter: "",
      });
      if (parsed.errors.length) {
        console.warn("CSV errors:", parsed.errors);
      }
      const rows = parsed.data;
      if (rows.length === 0) throw new Error("CSV vazio.");

      const emps = employeesQ.data ?? [];
      const byUser = new Map<string, string>();
      const byName = new Map<string, string>();
      const norm = (s: string) =>
        s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
      for (const e of emps) {
        if (e.username_sgf) byUser.set(e.username_sgf.toLowerCase(), e.id);
        if (e.nome_sgf) byName.set(norm(e.nome_sgf), e.id);
        if (e.nome) byName.set(norm(e.nome), e.id);
      }

      const mapEstado = (s: string): string | null => {
        const v = s.toLowerCase().trim();
        if (!v) return null;
        if (v === "cancelled" || v === "canceled" || v === "cancelado") return "cancelado";
        if (
          v === "finished" || v === "served" || v === "terminated" ||
          v === "terminada" || v === "terminado" || v === "atendida"
        ) return "terminada";
        if (v === "attending" || v === "em atendimento" || v === "a atender") return "em_atendimento";
        if (v === "waiting" || v === "pending" || v === "em espera") return "em_espera";
        return v;
      };

      setProgress(`A processar ${rows.length} senhas…`);
      const records: any[] = [];
      let minDate = "9999-12-31", maxDate = "0000-01-01";

      for (const r of rows) {
        const senha = pick(r, ["Senha", "senha"]);
        const emitida = parseDate(pick(r, ["Data de criação", "Data e hora de emissão", "Emissão", "emitida_em"]));
        if (!senha || !emitida) continue;
        const dateStr = ymd(emitida);
        if (dateStr < minDate) minDate = dateStr;
        if (dateStr > maxDate) maxDate = dateStr;

        const staffUser = (pick(r, ["Staff", "staff"]) || "").toLowerCase();
        const nomeStaff = pick(r, ["Utilizador", "Nome staff"]) || null;
        const empId =
          (staffUser && byUser.get(staffUser)) ||
          (nomeStaff && byName.get(norm(nomeStaff))) ||
          null;
        records.push({
          senha,
          servico: pick(r, ["Serviço", "ID do serviço", "servico"]) || null,
          staff_username: staffUser || null,
          nome_staff: nomeStaff,
          balcao: pick(r, ["Local de destino", "Balcão", "Balcao"]) || null,
          emitida_em: emitida.toISOString(),
          inicio_em: parseDate(pick(r, ["Data e hora de início do atendimento", "Início"]))?.toISOString() ?? null,
          fim_em: parseDate(pick(r, ["Data e hora de fim do atendimento", "Fim"]))?.toISOString() ?? null,
          espera_s: numOrNull(pick(r, ["Tempo de espera", "Tempo de espera (s)", "Espera"])),
          atendimento_s: numOrNull(pick(r, ["Tempo de atendimento", "Tempo de atendimento (s)", "Atendimento"])),
          estado: mapEstado(pick(r, ["Estado"])),
          eh_marcacao: pick(r, ["É marcação", "Marcação"]) === "1",
          paperless: pick(r, ["Paperless"]) === "1",
          employee_id: empId,
        });
      }

      if (records.length === 0) throw new Error("Nenhuma linha válida no CSV.");

      setProgress(`A limpar senhas de ${minDate} a ${maxDate}…`);
      const del = await supabase.from("sgf_tickets")
        .delete()
        .gte("emitida_em", minDate + "T00:00:00")
        .lte("emitida_em", maxDate + "T23:59:59");
      if (del.error) throw del.error;

      // Insert in batches of 500
      const BATCH = 500;
      for (let i = 0; i < records.length; i += BATCH) {
        setProgress(`A guardar ${i + 1}–${Math.min(i + BATCH, records.length)} de ${records.length}…`);
        const slice = records.slice(i, i + BATCH);
        const ins = await supabase.from("sgf_tickets").insert(slice);
        if (ins.error) throw ins.error;
      }

      toast.success(`${records.length} senhas importadas (${minDate} → ${maxDate})`);
      refreshAll();
    } catch (e: any) {
      console.error(e);
      toast.error(`Erro: ${e.message ?? e}`);
    } finally {
      setUploading(false);
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function clearAll() {
    if (!(await confirm({
      title: "Apagar TODAS as senhas SGF?",
      description: "Esta acção não pode ser revertida. Todos os registos SGF serão removidos.",
      confirmLabel: "Apagar tudo",
      destructive: true,
    }))) return;
    const { error } = await supabase.from("sgf_tickets").delete().not("id", "is", null);
    if (error) toast.error(error.message);
    else { toast.success("Senhas apagadas."); refreshAll(); }
  }

  return (
    <div>
      <PageHeader title="SGF · Senhas" subtitle={`${ticketsQ.data?.count ?? 0} senhas no total`} />
      <div className="p-4 md:p-6 space-y-4">
        {/* Upload area */}
        <div className="rounded-xl border bg-gradient-to-br from-[var(--brand-blue)]/8 to-[var(--brand-orange)]/8 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-card border">
              <FileSpreadsheet className="h-5 w-5 text-[var(--brand-blue)]" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold">Importar senhas do SGF</h3>
              <p className="text-xs text-muted-foreground">
                Carrega o CSV exportado do sistema. As senhas no intervalo do ficheiro são substituídas.
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
            />
            <button
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {uploading ? "A carregar…" : "Carregar CSV"}
            </button>
            <button
              onClick={refreshAll}
              className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
              title="Atualizar listagem"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
            <button
              onClick={clearAll}
              className="inline-flex items-center gap-2 rounded-md border border-destructive/40 bg-card px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
              title="Apagar tudo"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          {progress && (
            <div className="mt-3 rounded-md bg-card/70 border px-3 py-2 text-xs text-muted-foreground">
              {progress}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }}
              placeholder="Pesquisar senha, colaborador, serviço..."
              className="w-full rounded-md border bg-background pl-8 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <select value={estado} onChange={(e) => { setEstado(e.target.value); setPage(0); }}
            className="rounded-md border bg-background px-2 py-2 text-sm">
            <option value="">Todos os estados</option>
            <option value="terminada">Terminada</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </div>

        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs">
                <th className="px-3 py-2 text-left">Senha</th>
                <th className="px-3 py-2 text-left">Serviço</th>
                <th className="px-3 py-2 text-left">Colaborador</th>
                <th className="px-3 py-2 text-left">Emissão</th>
                <th className="px-3 py-2 text-right">Espera</th>
                <th className="px-3 py-2 text-right">Atendimento</th>
                <th className="px-3 py-2 text-left">Estado</th>
              </tr>
            </thead>
            <tbody>
              {ticketsQ.isLoading && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">A carregar...</td></tr>
              )}
              {!ticketsQ.isLoading && ticketsQ.data?.rows?.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Sem senhas. Importa um CSV acima.</td></tr>
              )}
              {ticketsQ.data?.rows?.map((t) => (
                <tr key={t.id} className="border-b last:border-0 hover:bg-accent/20">
                  <td className="px-3 py-1.5 font-mono font-medium">{t.senha}</td>
                  <td className="px-3 py-1.5 truncate max-w-40">{t.servico}</td>
                  <td className="px-3 py-1.5 truncate max-w-40">{t.nome_staff}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground tabular-nums">
                    {t.emitida_em ? new Date(t.emitida_em).toLocaleString("pt-PT") : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtSecsAsTime(t.espera_s)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmtSecsAsTime(t.atendimento_s)}</td>
                  <td className="px-3 py-1.5">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      t.estado === "terminada" ? "bg-[color:var(--success)]/15 text-[color:var(--success)]" :
                      t.estado === "cancelado" ? "bg-destructive/15 text-destructive" :
                      "bg-muted text-muted-foreground"
                    }`}>{t.estado}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Página {page + 1} de {totalPages}</span>
            <div className="flex gap-2">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}
                className="rounded-md border px-3 py-1.5 disabled:opacity-50">Anterior</button>
              <button disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}
                className="rounded-md border px-3 py-1.5 disabled:opacity-50">Seguinte</button>
            </div>
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}

function pick(r: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    if (k in r && r[k] != null && r[k] !== "") return String(r[k]).trim();
    // case-insensitive fallback
    const found = Object.keys(r).find((x) => x.toLowerCase() === k.toLowerCase());
    if (found && r[found]) return String(r[found]).trim();
  }
  return "";
}

function numOrNull(s: string): number | null {
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n) : null;
}

// Parse "DD/MM/YYYY HH:MM[:SS]" or ISO or "YYYY-MM-DD HH:MM"
function parseDate(s: string): Date | null {
  if (!s) return null;
  // try direct ISO
  const iso = new Date(s);
  if (!isNaN(iso.getTime()) && /\d{4}-\d{2}-\d{2}/.test(s)) return iso;

  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    let [_, dd, mm, yy, hh = "0", mi = "0", se = "0"] = m;
    let y = Number(yy); if (y < 100) y += 2000;
    return new Date(y, Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(se));
  }
  if (!isNaN(iso.getTime())) return iso;
  return null;
}
