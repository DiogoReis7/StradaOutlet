// Shared helpers for challenges progress calculation
export type Metric =
  | "pts" | "qty"
  | "fixo" | "movel" | "marcacoes" | "maisNegocio"
  | "nc" | "alarme" | "energia" | "continente"
  | "nps_det";

export const METRIC_LABELS: Record<Metric, string> = {
  pts: "Pontos ponderados",
  qty: "Quantidade total",
  fixo: "Fixo (ponderado)",
  movel: "Móvel (un)",
  marcacoes: "Marcações (ponderado)",
  maisNegocio: "+Negócio (ponderado)",
  nc: "NC's (un)",
  alarme: "Alarme (un)",
  energia: "Energia (un)",
  continente: "Continente (un)",
  nps_det: "% Detratores (baixar)",
};

/** Metrics where lower is better and target is a MAX allowed value. */
export const REDUCTION_METRICS = new Set<Metric>(["nps_det"]);

export const FIXO_CODES = new Set(["tv", "net", "voz", "wifi-total", "migracoes", "migracoes-tv"]);
/** Códigos que contam para o indicador TV (inclui TV em migração). */
export const TV_CODES = new Set(["tv", "migracoes-tv"]);
/** Códigos que são só indicador: não somam quantidade nem pontos. */
export const INDICATOR_ONLY_CODES = new Set(["migracoes-tv"]);
export const MOVEL_CODES = new Set(["cv", "cv-por-retencao", "pp", "pre-pagos"]);
export const MARCACOES_CODES = new Set([
  "sm-1a", "sm-2a", "sm-1a-estrela", "sm-2a-estrela", "sm-1a-movel", "sm-2a-movel",
  "xpert", "ecn", "premium", "segue-retencao",
]);
/** Tudo o resto (alarmes, smp, smp-retoma, seguros, devices, energia…) = +Negócio */
export const EXCLUDED = new Set(["combina", "nc"]);
export const ALARME_CODES = new Set(["alarme", "alarmes"]);
export const ENERGIA_CODES = new Set(["energia", "energia-sa"]);

export type SaleRow = { employee_id: string; product_id: string; quantidade: number };
export type ProdRow = { id: string; codigo: string; peso: number };

/** Accumulate a metric value from a single sale row */
export function addMetric(
  metric: Metric,
  code: string,
  qty: number,
  weight: number,
): number {
  const w = qty * weight;
  switch (metric) {
    case "pts": {
      // Total pts, excluindo combina e nc
      if (EXCLUDED.has(code)) return 0;
      return w;
    }
    case "qty":
      return qty;
    case "fixo":
      return FIXO_CODES.has(code) ? w : 0;
    case "movel":
      return MOVEL_CODES.has(code) ? qty : 0;
    case "marcacoes":
      return MARCACOES_CODES.has(code) ? w : 0;
    case "maisNegocio": {
      if (EXCLUDED.has(code)) return 0;
      if (FIXO_CODES.has(code) || MOVEL_CODES.has(code) || MARCACOES_CODES.has(code)) return 0;
      return w;
    }
    case "nc":
      return code === "nc" ? qty : 0;
    case "alarme":
      return ALARME_CODES.has(code) ? qty : 0;
    case "energia":
      return ENERGIA_CODES.has(code) ? qty : 0;
    case "continente":
      return code === "combina" ? qty : 0;
    default:
      return 0;
  }
}

/** Compute total (loja) or per-employee (individual) progress */
export function computeProgress(
  sales: SaleRow[],
  products: ProdRow[],
  metric: Metric,
) {
  const pmap = new Map(products.map((p) => [p.id, p]));
  let total = 0;
  const byEmp = new Map<string, number>();
  for (const s of sales) {
    const p = pmap.get(s.product_id);
    if (!p) continue;
    const code = (p.codigo ?? "").toLowerCase();
    const v = addMetric(metric, code, Number(s.quantidade), Number(p.peso ?? 0));
    if (v === 0) continue;
    total += v;
    byEmp.set(s.employee_id, (byEmp.get(s.employee_id) ?? 0) + v);
  }
  return { total, byEmp };
}
