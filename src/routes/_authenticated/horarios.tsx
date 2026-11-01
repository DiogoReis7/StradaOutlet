import { createFileRoute } from "@tanstack/react-router";
import { RouteError, RouteNotFound, pageHead } from "@/components/RouteBoundary";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { MonthDayPicker } from "@/components/MonthDayPicker";
import { useSharedDate } from "@/hooks/useSharedDate";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Calendar, Download } from "lucide-react";
import { toast } from "sonner";


export const Route = createFileRoute("/_authenticated/horarios")({
  head: pageHead("Horários · PDS Strada Outlet", "Horários, turnos e folgas dos colaboradores."),
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
  notFoundComponent: () => <RouteNotFound />,
  component: HorariosPage,
});

type Employee = { id: string; nome: string; slug: string; nif: number | null; ativo: boolean; ordem: number };
type Shift = { id: string; employee_id: string; data: string; horas: number | null; estado: string | null; descricao: string | null };

function pad(n: number) { return String(n).padStart(2, "0"); }
function isoDate(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}`; }
function daysInMonth(y: number, m: number) { return new Date(y, m, 0).getDate(); }

function normalizeEstado(desc: string | null | undefined, horas: number): "folga" | "ferias" | "ausencia" | "trabalha" {
  const d = (desc ?? "").toLowerCase();
  if (d.includes("folga")) return "folga";
  if (d.includes("férias") || d.includes("ferias")) return "ferias";
  if (horas <= 0) return "ausencia";
  return "trabalha";
}

function fmtExcelDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isoDate(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === "number") {
    // Excel serial date: days since 1899-12-30 (handles the 1900 leap-year bug)
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const t = new Date(ms);
    if (!isNaN(t.getTime())) return isoDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
  }
  if (typeof v === "string") {
    const t = new Date(v);
    if (!isNaN(t.getTime())) return isoDate(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }
  return null;
}

/** Extrai intervalos "HH:MM-HH:MM" de um texto livre (ex.: "09:00-13:00 / 14:00-18:00 (8h)"). */
function parseShiftTimes(desc: string | null | undefined): { start: string; end: string }[] {
  if (!desc) return [];
  const out: { start: string; end: string }[] = [];
  for (const m of desc.matchAll(/(\d{1,2})[:.](\d{2})\s*-\s*(\d{1,2})[:.](\d{2})/g)) {
    out.push({ start: `${pad(+m[1])}${m[2]}`, end: `${pad(+m[3])}${m[4]}` });
  }
  return out;
}

function icsEscape(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

/** Gera um ficheiro .ics com os turnos de um colaborador num mês e despoleta a transferência. */
function exportShiftsToIcs(employee: Employee, shifts: Shift[], year: number, month: number) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Strada Outlet//Horarios//PT", "CALSCALE:GREGORIAN"];
  let n = 0;
  for (const s of shifts.filter((x) => x.employee_id === employee.id)) {
    const dateCompact = s.data.replace(/-/g, "");
    const est = normalizeEstado(s.descricao, Number(s.horas ?? 0));
    n++;
    if (est === "trabalha") {
      const ranges = parseShiftTimes(s.descricao);
      if (ranges.length > 0) {
        ranges.forEach((r, i) => {
          lines.push(
            "BEGIN:VEVENT",
            `UID:ls-${employee.id}-${s.data}-${i}@stradaoutlet.local`,
            `DTSTAMP:${stamp}`,
            `DTSTART:${dateCompact}T${r.start}00`,
            `DTEND:${dateCompact}T${r.end}00`,
            `SUMMARY:${icsEscape(`Trabalho — ${employee.nome}`)}`,
            `DESCRIPTION:${icsEscape(s.descricao ?? "")}`,
            "END:VEVENT",
          );
        });
      } else {
        lines.push(
          "BEGIN:VEVENT",
          `UID:ls-${employee.id}-${s.data}@stradaoutlet.local`,
          `DTSTAMP:${stamp}`,
          `DTSTART;VALUE=DATE:${dateCompact}`,
          `SUMMARY:${icsEscape(`Trabalho (${s.horas ?? 0}h) — ${employee.nome}`)}`,
          "END:VEVENT",
        );
      }
    } else if (est === "folga" || est === "ferias") {
      const next = new Date(year, month - 1, Number(s.data.slice(8, 10)) + 1);
      const nextCompact = isoDate(next.getFullYear(), next.getMonth() + 1, next.getDate()).replace(/-/g, "");
      lines.push(
        "BEGIN:VEVENT",
        `UID:ls-${employee.id}-${s.data}@stradaoutlet.local`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${dateCompact}`,
        `DTEND;VALUE=DATE:${nextCompact}`,
        `SUMMARY:${icsEscape(est === "folga" ? `Folga — ${employee.nome}` : `Férias — ${employee.nome}`)}`,
        "END:VEVENT",
      );
    } else {
      n--;
    }
  }
  lines.push("END:VCALENDAR");
  if (n === 0) {
    toast.info("Sem turnos para exportar neste mês.");
    return;
  }
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `horario-${employee.slug || employee.nome}-${year}-${pad(month)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function HorariosPage() {
  const qc = useQueryClient();
  const [date, setDate] = useSharedDate();
  const [importing, setImporting] = useState(false);
  const [replaceMode, setReplaceMode] = useState(true);
  const [report, setReport] = useState<{ inserted: number; matched: number; unmatched: string[]; days: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("id,nome,slug,ativo,ordem").order("ordem");
      if (error) throw error;
      return (data as Omit<Employee, "nif">[]).map((e) => ({ ...e, nif: null }));
    },
  });

  const monthStart = isoDate(date.year, date.month, 1);
  const monthEnd = isoDate(date.year, date.month, daysInMonth(date.year, date.month));

  const { data: shifts = [] } = useQuery({
    queryKey: ["shift_days", monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase.from("shift_days")
        .select("id,employee_id,data,horas,estado,descricao")
        .gte("data", monthStart).lte("data", monthEnd);
      if (error) throw error;
      return data as Shift[];
    },
  });

  // index shifts by data|employee_id
  const shiftIdx = useMemo(() => {
    const m = new Map<string, Shift>();
    for (const s of shifts) m.set(`${s.data}|${s.employee_id}`, s);
    return m;
  }, [shifts]);

  const activeEmps = useMemo(() => employees.filter(e => e.ativo), [employees]);

  function parseHoras(v: unknown): number {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return v; // already decimal hours
    if (v instanceof Date) return v.getUTCHours() + v.getUTCMinutes() / 60;
    if (typeof v === "string") {
      const m = v.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (m) return Number(m[1]) + Number(m[2]) / 60 + (m[3] ? Number(m[3]) / 3600 : 0);
      const n = Number(v.replace(",", "."));
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }

  async function handleFile(file: File) {
    setImporting(true);
    setReport(null);
    try {
      if (!file) throw new Error("Nenhum ficheiro selecionado.");
      if (employees.length === 0) {
        throw new Error("Sem colaboradores carregados. Recarrega a página (ou inicia sessão) antes de importar.");
      }
      const XLSX = await import("xlsx");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });

      // Aceita a folha "Data" (formato atual da Sisqual), "Sisqual" (formato antigo)
      // ou qualquer folha que contenha as colunas esperadas (NIF + Data).
      const findSheet = (): string | null => {
        const preferred = wb.SheetNames.find(
          (n: string) => ["data", "sisqual"].includes(n.toLowerCase()),
        );
        if (preferred) return preferred;
        for (const n of wb.SheetNames) {
          const head = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[n], { defval: null, range: 0 });
          if (head[0] && "NIF" in head[0] && "Data" in head[0]) return n;
        }
        return null;
      };
      const sheetName = findSheet();
      if (!sheetName) {
        throw new Error('Não encontrei uma folha válida. Esperado: "Data" ou "Sisqual" com colunas Data e NIF.');
      }
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

      // Collect all NIFs from the file then resolve them server-side via the
      // match_employees_by_nifs RPC (NIF column is not readable from the client).
      const fileNifs = new Set<number>();
      for (const r of rows) {
        const n = r["NIF"] != null ? Number(r["NIF"]) : NaN;
        if (Number.isFinite(n)) fileNifs.add(n);
      }
      const { data: matches, error: matchErr } = await supabase.rpc(
        "match_employees_by_nifs",
        { p_nifs: Array.from(fileNifs) },
      );
      if (matchErr) throw matchErr;
      const nifMap = new Map<number, { id: string; nome: string }>();
      for (const m of (matches ?? []) as { nif: number; id: string; nome: string }[]) {
        nifMap.set(Number(m.nif), { id: m.id, nome: m.nome });
      }

      const upserts: { employee_id: string; data: string; horas: number; estado: string; descricao: string | null }[] = [];
      const unmatchedSet = new Set<string>();
      const daysSet = new Set<string>();
      const monthsTouched = new Set<string>();
      const nifCategoria = new Map<number, string>();

      for (const r of rows) {
        const data = fmtExcelDate(r["Data"]);
        const nifRaw = r["NIF"];
        const nif = nifRaw != null ? Number(nifRaw) : null;
        const carga = parseHoras(r["Carga Horária"] ?? r["Carga Horaria"]);
        const desc = (r["Descrição Horário"] ?? r["Descricao Horario"] ?? null) as string | null;
        const funcao = (r["Função Colaborador"] ?? r["Funcao Colaborador"] ?? r["Função"] ?? r["Funcao"] ?? null) as string | null;
        if (!data || !nif) continue;
        monthsTouched.add(data.slice(0, 7));
        const emp = nifMap.get(nif);
        if (!emp) {
          unmatchedSet.add(`${r["Nome"] ?? "?"} (NIF ${nif})`);
          continue;
        }
        if (funcao && funcao.trim() && !nifCategoria.has(nif)) {
          nifCategoria.set(nif, funcao.trim());
        }
        daysSet.add(data);
        upserts.push({
          employee_id: emp.id,
          data,
          horas: carga,
          estado: normalizeEstado(desc, carga),
          descricao: desc,
        });
      }

      if (upserts.length === 0) {
        if (unmatchedSet.size > 0) {
          throw new Error(`Nenhum NIF do ficheiro corresponde aos colaboradores. ${unmatchedSet.size} NIFs não emparelhados — adiciona-os em /colaboradores.`);
        }
        throw new Error("Nenhum registo válido encontrado no ficheiro. Verifica que tem colunas Data, NIF e Carga Horária.");
      }


      if (replaceMode) {
        // Apaga registos existentes nos meses que o ficheiro cobre
        for (const ym of monthsTouched) {
          const [y, m] = ym.split("-").map(Number);
          const start = isoDate(y, m, 1);
          const end = isoDate(y, m, daysInMonth(y, m));
          const { error: delErr } = await supabase
            .from("shift_days")
            .delete()
            .gte("data", start)
            .lte("data", end);
          if (delErr) throw delErr;
        }
      }

      const chunkSize = 200;
      let inserted = 0;
      for (let i = 0; i < upserts.length; i += chunkSize) {
        const chunk = upserts.slice(i, i + chunkSize);
        const { error } = await supabase
          .from("shift_days")
          .upsert(chunk, { onConflict: "employee_id,data" });
        if (error) throw error;
        inserted += chunk.length;
      }


      // Atualiza categoria (Função Colaborador) por NIF
      if (nifCategoria.size > 0) {
        const pairs = [...nifCategoria.entries()].map(([nif, categoria]) => ({ nif, categoria }));
        await supabase.rpc("set_employee_categorias_by_nif", { p_pairs: pairs });
      }

      setReport({
        inserted,
        matched: new Set(upserts.map(u => u.employee_id)).size,
        unmatched: [...unmatchedSet],
        days: daysSet.size,
      });
      toast.success(`Importado: ${inserted} registos em ${daysSet.size} dias.`);
      qc.invalidateQueries({ queryKey: ["shift_days"] });
      qc.invalidateQueries({ queryKey: ["employees"] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao importar";
      toast.error(msg);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const dim = daysInMonth(date.year, date.month);
  const selectedIso = isoDate(date.year, date.month, date.day);

  // Today summary
  const todayShifts = activeEmps.map(e => ({
    emp: e,
    shift: shiftIdx.get(`${selectedIso}|${e.id}`) ?? null,
  }));
  const trabalham = todayShifts.filter(t => t.shift && normalizeEstado(t.shift.descricao, Number(t.shift.horas ?? 0)) === "trabalha");
  const folgas = todayShifts.filter(t => t.shift && normalizeEstado(t.shift.descricao, Number(t.shift.horas ?? 0)) !== "trabalha");
  const semInfo = todayShifts.filter(t => !t.shift);

  return (
    <div>
      <PageHeader
        title="Horários Sisqual"
        subtitle="Importação mensal e validação diária"
        actions={
          <MonthDayPicker year={date.year} month={date.month} day={date.day} onChange={setDate} />
        }
      />
      <div className="p-4 md:p-6 space-y-4">
        {/* Upload */}
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold">Importar ficheiro Sisqual</h3>
              <p className="text-xs text-muted-foreground">
                Carrega o Excel da Sisqual (folha <span className="font-mono">Data</span> ou <span className="font-mono">Sisqual</span>). Todos os meses presentes no ficheiro serão importados.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
                <button
                  disabled={importing}
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  {importing ? "A importar..." : "Escolher Excel"}
                </button>
                <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground select-none">
                  <input
                    type="checkbox"
                    checked={replaceMode}
                    onChange={(e) => setReplaceMode(e.target.checked)}
                    className="h-3.5 w-3.5"
                  />
                  Substituir base do(s) mês(es) carregado(s)
                </label>
                {report && (
                  <div className="text-xs text-muted-foreground">
                    {report.inserted} registos · {report.matched} colaboradores · {report.days} dias
                    {report.unmatched.length > 0 && (
                      <span className="text-amber-600"> · {report.unmatched.length} não emparelhados</span>
                    )}
                  </div>
                )}
              </div>
              {report && report.unmatched.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-amber-700">Ver não emparelhados ({report.unmatched.length})</summary>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                    {report.unmatched.map((u, i) => <li key={i}>{u}</li>)}
                  </ul>
                  <p className="mt-1 text-muted-foreground">Adiciona o NIF correto na ficha do colaborador em <span className="font-mono">/colaboradores</span>.</p>
                </details>
              )}
            </div>
          </div>
        </div>

        {/* Today validation */}
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Validação do dia {pad(date.day)}/{pad(date.month)}/{date.year}</h3>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <StatBox color="emerald" label="A trabalhar" count={trabalham.length}>
              {trabalham.map(t => (
                <li key={t.emp.id} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="truncate text-foreground">{t.emp.nome}</span>
                  <span className="text-[11px] text-foreground/70">{t.shift?.descricao ?? `${t.shift?.horas}h`}</span>
                </li>
              ))}
            </StatBox>
            <StatBox color="amber" label="Folga / Férias" count={folgas.length}>
              {folgas.map(t => (
                <li key={t.emp.id} className="flex items-center justify-between gap-2 py-0.5">
                  <span className="truncate text-foreground">{t.emp.nome}</span>
                  <span className="text-[11px] text-foreground/70">{t.shift?.descricao ?? t.shift?.estado}</span>
                </li>
              ))}
            </StatBox>
            <StatBox color="slate" label="Sem informação" count={semInfo.length}>
              {semInfo.map(t => (
                <li key={t.emp.id} className="py-0.5 text-foreground">{t.emp.nome}</li>
              ))}
            </StatBox>
          </div>
        </div>

        {/* Monthly grid */}
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="sticky left-0 z-10 bg-muted/50 px-2 py-2 text-left font-medium">Dia</th>
                {activeEmps.map(e => (
                  <th key={e.id} className="px-2 py-2 text-left font-medium whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {e.nome}
                      <button
                        onClick={() => exportShiftsToIcs(e, shifts, date.year, date.month)}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                        title={`Exportar horário de ${e.nome} para o calendário`}
                        aria-label={`Exportar horário de ${e.nome}`}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: dim }, (_, i) => i + 1).map(d => {
                const iso = isoDate(date.year, date.month, d);
                const isSelected = d === date.day;
                const dow = new Date(date.year, date.month - 1, d).getDay();
                const isWeekend = dow === 0 || dow === 6;
                return (
                  <tr key={d} className={isSelected ? "bg-primary/5" : isWeekend ? "bg-muted/20" : ""}>
                    <td className="sticky left-0 z-10 bg-inherit px-2 py-1 font-medium whitespace-nowrap">
                      <button
                        onClick={() => setDate({ ...date, day: d })}
                        className={`rounded px-1.5 py-0.5 ${isSelected ? "bg-primary text-primary-foreground" : "hover:bg-accent/40"}`}
                      >
                        {pad(d)}/{pad(date.month)}
                      </button>
                    </td>
                    {activeEmps.map(e => {
                      const s = shiftIdx.get(`${iso}|${e.id}`);
                      const est = s ? normalizeEstado(s.descricao, Number(s.horas ?? 0)) : null;
                      const cls =
                        est === "trabalha" ? "bg-emerald-50 text-emerald-900 border-emerald-200" :
                        est === "folga" ? "bg-amber-50 text-amber-800 border-amber-200" :
                        est === "ferias" ? "bg-sky-50 text-sky-800 border-sky-200" :
                        est === "ausencia" ? "bg-rose-50 text-rose-800 border-rose-200" :
                        "bg-muted/30 text-muted-foreground border-transparent";
                      return (
                        <td key={e.id} className="px-1 py-1 align-top">
                          <div className={`rounded border px-1.5 py-1 ${cls}`} title={s?.descricao ?? "sem informação"}>
                            {s ? (
                              est === "trabalha"
                                ? <span className="font-mono text-[11px]">{(s.descricao ?? "").replace(/\s*\(.+?\)\s*/, "") || `${s.horas}h`}</span>
                                : <span className="text-[11px]">{est === "folga" ? "Folga" : est === "ferias" ? "Férias" : "—"}</span>
                            ) : (
                              <span className="text-[11px]">—</span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatBox({
  color, label, count, children,
}: { color: "emerald" | "amber" | "slate"; label: string; count: number; children: React.ReactNode }) {
  const tone = {
    emerald: { wrap: "border-emerald-500/40 bg-emerald-500/10", text: "text-emerald-200", count: "text-emerald-100" },
    amber:   { wrap: "border-amber-500/40 bg-amber-500/10",     text: "text-amber-200",   count: "text-amber-100" },
    slate:   { wrap: "border-slate-400/40 bg-slate-500/10",     text: "text-slate-200",   count: "text-slate-100" },
  }[color];
  const Icon = color === "emerald" ? CheckCircle2 : AlertCircle;
  return (
    <div className={`rounded-lg border p-3 ${tone.wrap}`}>
      <div className="flex items-center justify-between mb-2">
        <div className={`flex items-center gap-1.5 text-xs font-semibold ${tone.text}`}>
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <div className={`text-lg font-extrabold ${tone.count}`}>{count}</div>
      </div>
      <ul className={`text-xs max-h-48 overflow-y-auto space-y-0.5 ${tone.text}`}>{children}</ul>
    </div>
  );
}
