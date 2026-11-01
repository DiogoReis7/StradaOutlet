/** Constrói o texto CSV (separador ';', números com vírgula decimal). */
export function toCsv(rows: Record<string, any>[]): string {
  if (!rows.length) return "";
  const cols = Array.from(rows.reduce<Set<string>>((set, r) => {
    Object.keys(r).forEach((k) => set.add(k));
    return set;
  }, new Set()));

  const esc = (v: any) => {
    if (v == null) return "";
    const s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  return [cols.join(";"), ...rows.map((r) => cols.map((c) => esc(r[c])).join(";"))].join("\r\n");
}

/** Exporta linhas para CSV (Excel-friendly: separador ';' e BOM UTF-8). */
export function exportCsv(filename: string, rows: Record<string, any>[]) {
  if (typeof window === "undefined") return;
  if (!rows.length) return;
  const csv = toCsv(rows);

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
