import { createFileRoute } from "@tanstack/react-router";
import { RouteError, RouteNotFound, pageHead } from "@/components/RouteBoundary";
import { useEffect, useMemo, useRef, useState } from "react";
import { chime, fanfare, unlockAudio } from "@/lib/sound";
import { haptic } from "@/lib/haptics";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Camera, Copy, Check, Share2, Tv, Play, Pause, Volume2, VolumeX, ShoppingCart, Sparkles, Trophy, Timer, Flag } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { withoutManagers } from "@/lib/manager";
import { PageHeader } from "@/components/AppShell";
import { MonthDayPicker } from "@/components/MonthDayPicker";
import { useSharedDate } from "@/hooks/useSharedDate";
import { MONTHS_PT, monthRange, fmtNum, fmtSecsAsTime, ymd, classNames, initials, avatarGradient } from "@/lib/domain";
import { NeonIcon, NeonBadge, pickIcon } from "@/lib/product-icons";
import { computeProgress, METRIC_LABELS, REDUCTION_METRICS, type Metric } from "@/lib/challenges";

import { NpsAlertBanner } from "@/components/NpsAlertBanner";
import { isMedicalLeave, isSalesBlockedShift } from "@/lib/shift-state";

export const Route = createFileRoute("/_authenticated/pds")({
  head: pageHead("PDS do dia · Strada Outlet", "Painel diário de vendas, senhas e indicadores da loja."),
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
  notFoundComponent: () => <RouteNotFound />,
  component: PdsPage,
});

type Ticket = {
  senha: string | null;
  estado: string | null;
  espera_s: number | null;
  atendimento_s: number | null;
  emitida_em: string;
  employee_id: string | null;
  inicio_em: string | null;
  fim_em: string | null;
};

type Employee = { id: string; nome: string; slug: string; ativo: boolean; ordem: number; categoria?: string | null; objetivo_mes?: string | null; notas?: string | null };
type Product = { id: string; codigo: string; nome: string; categoria: string | null; peso: number; ativo: boolean; ordem: number };
type Sale = { employee_id: string; product_id: string; data: string; quantidade: number; updated_at?: string | null };

// Indicadores do PDS (por código de produto). Móvel e Combina NÃO contam.
const MARCACOES_CODES = new Set(["sm-1a", "sm-2a", "sm-1a-estrela", "sm-2a-estrela", "sm-1a-movel", "sm-2a-movel", "xpert", "ecn", "premium", "segue-retencao"]);
const MOVEL_CODES = new Set(["cv", "cv-por-retencao", "pp", "pre-pagos"]);
const RETOMA_CODES = new Set(["cv-retoma", "retoma"]);
const FIXO_CODES = new Set(["tv", "net", "voz", "wifi-total", "migracoes", "migracoes-tv"]);
// Lista explícita do que conta como "+Negócio" — alinhada 1:1 com a página
// Individuais (src/routes/_authenticated/individual.$slug.tsx), que é a fonte
// de verdade desta classificação. Só o que está aqui conta; o resto que não
// bater com nenhuma categoria simplesmente não entra em "+Negócio" por defeito.
const NEGOCIO_CODES = new Set(["alarmes", "alarme", "smp", "smp-retoma", "acess", "pelicula", "seguro", "seg-fat", "device", "hotspot", "energia", "energia-sa", "cv-retoma", "retoma"]);
// Códigos excluídos do total "Ponderado" / %TEP (alinhado com /desempenho, /desafios e /tv).
const EXCLUDED_FROM_PTS = new Set(["combina", "nc"]);

function normalize(s: string | null | undefined) {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function PdsPage() {
  const [{ year, month, day }, setDate] = useSharedDate();
  const { start, end } = monthRange(year, month);
  const dayIso = ymd(new Date(year, month - 1, day));

  const sgfQ = useQuery({
    queryKey: ["sgf-day", dayIso],
    queryFn: async () => {
      const { data } = await supabase
        .from("sgf_tickets")
        .select("senha,estado,espera_s,atendimento_s,emitida_em,employee_id,inicio_em,fim_em")
        .gte("emitida_em", dayIso + "T00:00:00")
        .lte("emitida_em", dayIso + "T23:59:59");
      return (data ?? []) as Ticket[];
    },
  });

  const empQ = useQuery({
    queryKey: ["employees", "all-active"],
    queryFn: async () => {
      const { data } = await supabase.from("employees").select("id,nome,slug,username_sgf,ativo,ordem,categoria,objetivo_mes,notas").eq("ativo", true).order("ordem");
      return (data ?? []) as Employee[];
    },
  });

  const opsEmployees = useMemo(() => withoutManagers(empQ.data ?? [] as any) as Employee[], [empQ.data]);

  const shiftDayQ = useQuery({
    queryKey: ["shift-day", dayIso],
    queryFn: async () => {
      const { data } = await supabase
        .from("shift_days")
        .select("employee_id,horas,estado,descricao")
        .eq("data", dayIso);
      return (data ?? []) as { employee_id: string; horas: number | null; estado: string | null; descricao: string | null }[];
    },
  });

  const prodQ = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id,codigo,nome,categoria,peso,ativo,ordem").eq("ativo", true).order("ordem");
      return (data ?? []) as Product[];
    },
  });

  const salesQ = useQuery({
    queryKey: ["sales-day", dayIso],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_entries")
        .select("employee_id,product_id,data,quantidade,updated_at")
        .eq("data", dayIso);
      return (data ?? []) as Sale[];
    },
  });

  const salesMonthQ = useQuery({
    queryKey: ["sales-month", start, end],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_entries")
        .select("employee_id,product_id,data,quantidade")
        .gte("data", start).lte("data", end);
      return (data ?? []) as Sale[];
    },
  });

  const weekStart = ymd(new Date(year, month - 1, day - 6));
  const salesWeekQ = useQuery({
    queryKey: ["sales-week", weekStart, dayIso],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales_entries")
        .select("employee_id,product_id,data,quantidade")
        .gte("data", weekStart).lte("data", dayIso);
      return (data ?? []) as Sale[];
    },
  });

  const tDay = sgfQ.data ?? [];
  const allEmployees = opsEmployees;
  const shiftsToday = shiftDayQ.data ?? [];

  const workingIds = new Set(
    shiftsToday
      .filter((s) =>
        !isSalesBlockedShift(s) && (
          s.estado === "trabalha" ||
          (s.estado == null && Number(s.horas ?? 0) > 0)
        ))
      .map((s) => s.employee_id),
  );

  const employees = shiftsToday.length === 0
    ? allEmployees
    : allEmployees.filter((e) => workingIds.has(e.id));
  const products = prodQ.data ?? [];
  const sales = salesQ.data ?? [];

  const totDay = aggregate(tDay);

  const prodMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const catTotals = useMemo(() => {
    const m: Record<string, number> = { "NC": 0, "Alarme": 0, "Móvel": 0, "Marcações": 0, "Energia": 0, "Fixo": 0, "MaisNegocio": 0 };
    for (const s of sales) {
      const p = prodMap.get(s.product_id);
      if (!p) continue;
      const code = (p.codigo ?? "").toLowerCase();
      const q = Number(s.quantidade);
      const w = q * Number(p.peso ?? 0);
      const isRetoma = RETOMA_CODES.has(code);
      if (code === "nc") m["NC"] += q;
      else if (code === "alarmes" || code === "alarme") m["Alarme"] += q;
      else if (MOVEL_CODES.has(code)) m["Móvel"] += w;
      else if (MARCACOES_CODES.has(code)) m["Marcações"] += w;
      else if (code === "energia" || code === "energia-sa") m["Energia"] += q;
      else if (FIXO_CODES.has(code)) m["Fixo"] += w;
      if (isRetoma || NEGOCIO_CODES.has(code)) m["MaisNegocio"] += w;
    }
    return m;
  }, [sales, prodMap]);

  const combinaTotal = useMemo(() => {
    let total = 0;
    for (const s of sales) {
      const p = prodMap.get(s.product_id);
      if (!p) continue;
      if ((p.codigo ?? "").toLowerCase() === "combina") total += Number(s.quantidade);
    }
    return total;
  }, [sales, prodMap]);

  const [combinaOpen, setCombinaOpen] = useState(false);
  const [combinaEmpId, setCombinaEmpId] = useState("");
  const [combinaQty, setCombinaQty] = useState(1);
  const combinaProduct = useMemo(() => products.find((p) => (p.codigo ?? "").toLowerCase() === "combina"), [products]);

  async function saveCombina() {
    if (!combinaProduct) { toast.error("Produto Combina não encontrado."); return; }
    const emp = (empQ.data ?? []).find((e) => e.id === combinaEmpId);
    if (!emp) { toast.error("Escolhe o colaborador."); return; }
    const current = sales
      .filter((s) => s.employee_id === emp.id && s.product_id === combinaProduct.id)
      .reduce((a, s) => a + Number(s.quantidade), 0);
    const next = current + combinaQty;
    const { error } = await supabase.from("sales_entries").upsert(
      { employee_id: emp.id, product_id: combinaProduct.id, data: dayIso, quantidade: next },
      { onConflict: "employee_id,product_id,data" },
    );
    if (error) { toast.error(error.message); return; }
    toast.success(`Combina +${combinaQty} · ${emp.nome}`);
    haptic("tap");
    setCombinaQty(1);
    qc.invalidateQueries({ queryKey: ["sales-day"] });
    qc.invalidateQueries({ queryKey: ["sales-emp-day"] });
  }
  const combinaByEmp = useMemo(() => {
    const everyone = empQ.data ?? [];
    const rows: { emp: string; qty: number }[] = [];
    for (const s of sales) {
      const p = prodMap.get(s.product_id);
      if (!p || (p.codigo ?? "").toLowerCase() !== "combina") continue;
      const emp = everyone.find((e) => e.id === s.employee_id)?.nome ?? "Sem nome";
      rows.push({ emp, qty: Number(s.quantidade) });
    }
    const groups = new Map<string, { qty: number }[]>();
    for (const r of rows) {
      if (!groups.has(r.emp)) groups.set(r.emp, []);
      groups.get(r.emp)!.push({ qty: r.qty });
    }
    return [...groups.entries()].sort((a, b) => b[1].reduce((x, y) => x + y.qty, 0) - a[1].reduce((x, y) => x + y.qty, 0));
  }, [sales, prodMap, empQ.data]);

  const totalGlobal = useMemo(
    () => sales.reduce((a, s) => a + Number(s.quantidade), 0),
    [sales],
  );

  const totalPtsDay = useMemo(() => {
    let pts = 0;
    for (const s of sales) {
      const p = prodMap.get(s.product_id);
      if (!p) continue;
      const code = (p.codigo ?? "").toLowerCase();
      if (code === "migracoes-tv") continue;
      if (EXCLUDED_FROM_PTS.has(code)) continue;
      pts += Number(s.quantidade) * Number(p.peso ?? 0);
    }
    return pts;
  }, [sales, prodMap]);

  const folgaEmpIds = useMemo(() => {
    const s = new Set<string>();
    for (const sh of shiftsToday) {
      const est = (sh.estado ?? "").trim();
      const isFolga = isSalesBlockedShift(sh) || (Number(sh.horas ?? 0) <= 0) || (est !== "" && est !== "trabalha");
      if (isFolga) s.add(sh.employee_id);
    }
    return s;
  }, [shiftsToday]);

  const empRows = useMemo(() => {
    const sgfByEmp = new Map<string, Ticket[]>();
    for (const t of tDay) {
      if (!t.employee_id) continue;
      if (!sgfByEmp.has(t.employee_id)) sgfByEmp.set(t.employee_id, []);
      sgfByEmp.get(t.employee_id)!.push(t);
    }
    const salesByEmp = new Map<string, Sale[]>();
    for (const s of sales) {
      if (!salesByEmp.has(s.employee_id)) salesByEmp.set(s.employee_id, []);
      salesByEmp.get(s.employee_id)!.push(s);
    }
    return employees.map((e) => {
      const ts = sgfByEmp.get(e.id) ?? [];
      const ss = salesByEmp.get(e.id) ?? [];
      const atendidos = ts.filter((x) => x.estado === "terminada").length;
      const aRows = ts.filter((x) => x.atendimento_s && !folgaEmpIds.has(e.id));
      const tma = aRows.reduce((a, r) => a + (r.atendimento_s ?? 0), 0) / (aRows.length || 1);
      let qty = 0, pts = 0, tvs = 0, alarmes = 0, movel = 0, marcacoes = 0, energia = 0, maisNegocio = 0;
      for (const s of ss) {
        const p = prodMap.get(s.product_id);
        if (!p) continue;
        const q = Number(s.quantidade);
        const w = q * Number(p.peso ?? 0);
        const code = (p.codigo ?? "").toLowerCase();
        const n = normalize(p.categoria ?? p.nome);
        const isFixo = FIXO_CODES.has(code);
        const isRetoma = RETOMA_CODES.has(code);
        // A coluna TV conta apenas vendas do produto com código "tv".
        // NET, Voz, Wi-Fi Total e migrações continuam no total Fixo, não em TV.
        if (code === "tv") tvs += q;
        if (code === "migracoes-tv") continue;
        qty += q;
        const isAlarme = code === "alarmes" || code === "alarme" || n.includes("alarme");
        if (isAlarme) alarmes += q;
        const isMovel = MOVEL_CODES.has(code);
        if (isMovel) movel += q;
        const isMarcacoes = MARCACOES_CODES.has(code);
        if (isMarcacoes) marcacoes += q;
        const isEnergia = code === "energia" || code === "energia-sa" || n.includes("energia");
        if (isEnergia) energia += q;
        if (isRetoma || NEGOCIO_CODES.has(code)) maisNegocio += w;
        if (EXCLUDED_FROM_PTS.has(code)) continue;
        pts += w;
      }
      const tep = atendidos > 0 ? (pts / atendidos) * 100 : 0;
      return { e, atendidos, tma, qty, pts, tvs, alarmes, movel, marcacoes, energia, maisNegocio, tep };
    }).sort((a, b) => b.pts - a.pts || b.qty - a.qty);
  }, [employees, tDay, sales, prodMap, folgaEmpIds]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => ymd(new Date(year, month - 1, day - 6 + i))),
    [year, month, day],
  );
  const weekSeries = useMemo(() => {
    const map = new Map<string, number[]>();
    const idx = new Map(weekDays.map((d, i) => [d, i]));
    for (const s of salesWeekQ.data ?? []) {
      const p = prodMap.get(s.product_id);
      if (!p) continue;
      const code = (p.codigo ?? "").toLowerCase();
      if (code === "migracoes-tv" || EXCLUDED_FROM_PTS.has(code)) continue;
      const i = idx.get(s.data);
      if (i == null) continue;
      if (!map.has(s.employee_id)) map.set(s.employee_id, Array(7).fill(0));
      map.get(s.employee_id)![i] += Number(s.quantidade) * Number(p.peso ?? 0);
    }
    return map;
  }, [salesWeekQ.data, prodMap, weekDays]);

  const [focusId, setFocusId] = useState<string | null>(null);

  const [combinaPop, setCombinaPop] = useState(false);
  const prevCombinaRef = useRef<number | null>(null);
  useEffect(() => {
    const prev = prevCombinaRef.current;
    prevCombinaRef.current = combinaTotal;
    if (prev == null || combinaTotal <= prev) return;
    setCombinaPop(true);
    const t = setTimeout(() => setCombinaPop(false), 700);
    return () => clearTimeout(t);
  }, [combinaTotal]);

  const captureRef = useRef<HTMLDivElement | null>(null);
  const eodCaptureRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState<null | "png" | "copy">(null);
  const [done, setDone] = useState<null | "png" | "copy">(null);
  const [tvMode, setTvMode] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (!tvMode) return;
    const id = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["sgf-day", dayIso] });
      qc.invalidateQueries({ queryKey: ["sales-day", dayIso] });
    }, 60_000);
    return () => clearInterval(id);
  }, [tvMode, qc, dayIso]);

  useEffect(() => {
    if (!tvMode) return;
    const el = rootRef.current;
    if (el && !document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
    const onExit = () => { if (!document.fullscreenElement) setTvMode(false); };
    document.addEventListener("fullscreenchange", onExit);
    return () => {
      document.removeEventListener("fullscreenchange", onExit);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [tvMode]);

  const [soundOn, setSoundOn] = useState(true);
  const prevTotalRef = useRef<number | null>(null);
  useEffect(() => {
    if (!tvMode) { prevTotalRef.current = null; return; }
    const prev = prevTotalRef.current;
    prevTotalRef.current = totalGlobal;
    if (prev == null || !soundOn) return;
    if (totalGlobal > prev) {
      if (Math.floor(totalGlobal / 10) > Math.floor(prev / 10)) fanfare();
      else chime();
    }
  }, [totalGlobal, tvMode, soundOn]);

  async function snapshot(): Promise<Blob | null> {
    if (!captureRef.current) return null;
    const { toBlob } = await import("html-to-image");
    const node = captureRef.current;
    node.setAttribute("data-capture", "true");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      return await toBlob(node, {
        width: 1280,
        height: Math.max(720, node.scrollHeight),
        pixelRatio: 2,
        backgroundColor: getComputedStyle(document.body).backgroundColor || "#fff",
        cacheBust: true,
        style: { width: "1280px", margin: "0", transform: "none" },
      });
    } finally {
      node.removeAttribute("data-capture");
    }
  }

  async function downloadPng() {
    try {
      setBusy("png");
      const blob = await snapshot();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `pds-${dayIso}.png`;
      a.click();
      URL.revokeObjectURL(url);
      setDone("png");
      setTimeout(() => setDone(null), 1500);
    } finally {
      setBusy(null);
    }
  }

  async function copyImage() {
    try {
      setBusy("copy");
      const blobPromise = snapshot().then((b) => {
        if (!b) throw new Error("snapshot vazio");
        return b;
      });
      // @ts-ignore
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]);
      setDone("copy");
      setTimeout(() => setDone(null), 1500);
    } catch {
      await downloadPng();
    } finally {
      setBusy(null);
    }
  }

  async function sharePng() {
    try {
      setBusy("png");
      const blob = await snapshot();
      if (!blob) return;
      const file = new File([blob], `pds-${dayIso}.png`, { type: "image/png" });
      // @ts-ignore
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `PDS ${dayIso}`, text: `PDS · Strada Outlet · ${dayIso}` });
      } else {
        await downloadPng();
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") await downloadPng();
    } finally {
      setBusy(null);
    }
  }

  const dayLabel = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
  const pdsWeekday = new Date(year, month - 1, day)
    .toLocaleDateString("pt-PT", { weekday: "long" })
    .toUpperCase();
  const topRows = useMemo(() => empRows.filter((r) => r.pts > 0 || r.qty > 0), [empRows]);
  const best = topRows[0] ?? null;

  const eodText = useMemo(() => {
    const medals = ["🥇", "🥈", "🥉"];
    const lines: string[] = [];
    lines.push(`🏁 FIM DE DIA · STRADA OUTLET · ${dayLabel}`);
    lines.push("———————————————");
    lines.push(`📦 Vendas: ${fmtNum(totalPtsDay, 2)} pts`);
    lines.push(`🔗 COMBINA: ${fmtNum(combinaTotal, 0)} adesões`);
    lines.push(
      `🎫 Senhas: ${fmtNum(totDay.atendidos, 0)} atendidas / ${fmtNum(totDay.total, 0)} · TME ${fmtSecsAsTime(totDay.tme)} · TMA ${fmtSecsAsTime(totDay.tma)}`,
    );
    lines.push(
      `📺 TV ${fmtNum(empRows.reduce((a, r) => a + r.tvs, 0), 0)} · 📱 Móvel ${fmtNum(catTotals["Móvel"], 0)} · 🚨 Alarme ${fmtNum(catTotals["Alarme"], 0)} · ⚡ Energia ${fmtNum(catTotals["Energia"], 0)} · 📍 +Negócio ${fmtNum(catTotals["MaisNegocio"], 0)}`,
    );
    if (best) {
      lines.push("");
      lines.push(`🏆 Melhor do dia: ${best.e.nome} — ${fmtNum(best.pts, 2)} pts`);
    }
    if (topRows.length > 0) {
      lines.push("");
      lines.push("Ranking:");
      topRows.forEach((r, i) => {
        lines.push(`${medals[i] ?? `${i + 1}.`} ${r.e.nome} · ${fmtNum(r.pts, 2)} pts`);
      });
    }
    return lines.join("\n");
  }, [dayLabel, totalGlobal, totalPtsDay, combinaTotal, totDay, catTotals, empRows, topRows, best]);

  const [eodOpen, setEodOpen] = useState(false);
  const [eodCopied, setEodCopied] = useState(false);

  async function copyEodText() {
    try {
      await navigator.clipboard.writeText(eodText);
      setEodCopied(true);
      haptic("tap");
      toast.success("Resumo copiado — cola no grupo da loja.");
      setTimeout(() => setEodCopied(false), 1800);
    } catch {
      toast.error("Não foi possível copiar. Seleciona o texto manualmente.");
    }
  }

  async function shareEodText() {
    try {
      if (navigator.share) {
        await navigator.share({ title: `PDS ${dayLabel}`, text: eodText });
      } else {
        await copyEodText();
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") await copyEodText();
    }
  }

  async function snapshotEod(): Promise<Blob | null> {
    const node = eodCaptureRef.current;
    if (!node) return null;
    const { toBlob } = await import("html-to-image");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return toBlob(node, {
      width: 900,
      height: Math.max(500, node.scrollHeight),
      pixelRatio: 2,
      backgroundColor: "#03130b",
      cacheBust: true,
      style: { width: "900px", maxHeight: "none", height: "auto", overflow: "visible", margin: "0", transform: "none" },
    });
  }

  async function shareEodImage() {
    try {
      setBusy("png");
      const blob = await snapshotEod();
      if (!blob) return;
      const file = new File([blob], `fim-do-dia-strada-${dayIso}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: `Fim do dia · Strada Outlet · ${dayLabel}` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error("Não foi possível gerar a imagem do fim do dia.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div ref={rootRef} className={tvMode ? "bg-background" : undefined}>
      <PageHeader
        title="PDS · Strada Outlet"
        subtitle={`${day} ${MONTHS_PT[month - 1]} ${year}`}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { haptic("tap"); setEodOpen(true); }}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--neon-green)]/60 bg-card px-2.5 py-1.5 text-xs font-semibold text-[var(--neon-green)] hover:bg-accent"
              title="Resumo do dia pronto a partilhar no WhatsApp"
            >
              <Flag className="h-3.5 w-3.5" />
              Fim do dia
            </button>
            <button
              type="button"
              onClick={() => { haptic("tap"); void copyImage(); }}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
              title="Copiar imagem do PDS para colar no Teams/WhatsApp"
            >
              {done === "copy" ? <Check className="h-3.5 w-3.5 text-[color:var(--success)]" /> : <Copy className="h-3.5 w-3.5" />}
              {done === "copy" ? "Copiado" : busy === "copy" ? "A copiar…" : "Copiar"}
            </button>
            <button
              type="button"
              onClick={downloadPng}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
              title="Guardar print do PDS como PNG"
            >
              {done === "png" ? <Check className="h-3.5 w-3.5 text-[color:var(--success)]" /> : <Camera className="h-3.5 w-3.5" />}
              {done === "png" ? "Pronto" : busy === "png" ? "A gerar…" : "Print"}
            </button>
            <button
              type="button"
              onClick={sharePng}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
              title="Partilhar (WhatsApp, Teams, Mail…)"
            >
              <Share2 className="h-3.5 w-3.5" />
              Partilhar
            </button>
            <a
              href="/tv"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--neon-yellow)]/60 bg-card px-2.5 py-1.5 text-xs font-semibold text-[var(--neon-yellow)] hover:bg-accent"
              title="Abrir Modo TV Loja (fullscreen, refresh 15s, som opcional)"
            >
              <Tv className="h-3.5 w-3.5" />
              TV Loja
            </a>
            <button
              type="button"
              onClick={() => setTvMode((v) => !v)}
              className={classNames(
                "inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-semibold hover:bg-accent",
                tvMode && "border-[var(--neon-green)] text-[var(--neon-green)]",
              )}
              title="Modo TV compacto — ecrã cheio + refresh 60s"
            >
              {tvMode ? <Pause className="h-3.5 w-3.5" /> : <Tv className="h-3.5 w-3.5" />}
              {tvMode ? "Sair TV" : "TV compacto"}
            </button>
            {tvMode && (
              <button
                type="button"
                onClick={() => { unlockAudio(); setSoundOn((v) => !v); }}
                className={classNames(
                  "inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs font-semibold hover:bg-accent",
                  soundOn && "border-[var(--neon-green)] text-[var(--neon-green)]",
                )}
                title={soundOn ? "Som ligado — toca a cada nova venda" : "Som desligado"}
              >
                {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                {soundOn ? "Som" : "Sem som"}
              </button>
            )}
            <MonthDayPicker year={year} month={month} day={day} onChange={setDate} />
          </div>
        }
      />

      <NpsAlertBanner />

      <Dialog open={eodOpen} onOpenChange={setEodOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <div className="space-y-3 rounded-xl bg-[#03130b] p-4 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[var(--neon-green)]">
              <Flag className="h-4 w-4" /> Fim do dia · {dayLabel}
            </DialogTitle>
            <DialogDescription>Resumo do dia. A imagem inclui apenas este resumo em texto, com o ranking por pontos.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2">
            <EodStat label="Vendas" value={`${fmtNum(totalGlobal, 0)} un`} hint={`${fmtNum(totalPtsDay, 2)} pts`} color="var(--neon-blue)" />
            <EodStat label="COMBINA" value={fmtNum(combinaTotal, 0)} hint="adesões" color="var(--combina-galp)" />
            <EodStat label="Senhas" value={fmtNum(totDay.atendidos, 0)} hint={`${fmtNum(totDay.total, 0)} entradas · TMA ${fmtSecsAsTime(totDay.tma)}`} color="var(--neon-violet)" />
            <EodStat label="Melhor do dia" value={best ? best.e.nome : "—"} hint={best ? `${fmtNum(best.pts, 2)} pts` : "sem vendas"} color="var(--neon-yellow)" />
          </div>

          <div className="rounded-lg border bg-card p-2">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ranking do dia</div>
            {topRows.length === 0 ? (
              <div className="py-3 text-center text-xs text-muted-foreground">Ainda sem vendas registadas hoje.</div>
            ) : (
              <ul className="space-y-1">
                {topRows.map((r, i) => (
                  <li key={r.e.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">
                      <b className="mr-1">{["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`}</b>
                      {r.e.nome}
                    </span>
                    <span className="shrink-0 tabular-nums font-semibold">{fmtNum(r.pts, 2)} pts</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <pre ref={eodCaptureRef} className="whitespace-pre-wrap break-words rounded-xl border border-white/30 bg-[#03130b] p-6 font-mono text-[22px] leading-[1.75] text-white">{eodText}</pre>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copyEodText()}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--neon-green)]/60 bg-card px-3 py-1.5 text-xs font-semibold text-[var(--neon-green)] hover:bg-accent"
            >
              {eodCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {eodCopied ? "Copiado" : "Copiar texto"}
            </button>
            <button
              type="button"
              onClick={() => void shareEodText()}
              className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-accent"
            >
              <Share2 className="h-3.5 w-3.5" /> Partilhar no WhatsApp
            </button>
            <button
              type="button"
              onClick={() => void shareEodImage()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--neon-green)]/60 bg-[color:color-mix(in_oklab,var(--neon-green)_10%,transparent)] px-3 py-1.5 text-xs font-semibold text-[var(--neon-green)] hover:bg-accent disabled:opacity-50"
              title="Gerar uma imagem PNG do resumo Fim do dia para partilhar"
            >
              <Camera className="h-3.5 w-3.5" /> {busy === "png" ? "A gerar imagem…" : "Partilhar imagem do resumo"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="pds-rotate-hint mx-3 mt-2 items-center gap-2 rounded-md border border-[color:var(--neon-blue)]/40 bg-[color:color-mix(in_oklab,var(--neon-blue)_10%,transparent)] px-3 py-1.5 text-[10px] font-medium text-muted-foreground">
        📱 <span>«Fim do dia» gera uma imagem apenas com o resumo e o ranking por pontos.</span>
      </div>

      <div className="pds-scroll p-2 pb-24 md:p-3 md:pb-6">
        <div ref={captureRef} className="pds-frame rounded-lg bg-background p-2">
          <div className="pds-grid">
            <div className="flex flex-col gap-2.5 min-h-0">
              <div className="rounded-md border bg-card px-3.5 py-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div className="pds-neon-word select-none font-extrabold uppercase leading-none">
                    STRADA OUTLET
                  </div>
                  <div className="text-right text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {pdsWeekday}
                    <div className="text-xs font-bold text-foreground">{dayLabel}</div>
                  </div>
                </div>
                <div className="mt-2 h-[3px] w-full rounded-full" style={{ background: "linear-gradient(90deg, var(--neon-blue), var(--neon-pink), var(--neon-yellow))", opacity: 0.55 }} />
              </div>

              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  <span>⚡</span> Atividade
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatCardCalm label="Pontos" value={fmtNum(totalPtsDay, 2)} color="var(--neon-blue)" />
                  <StatCardCalm label="Novos" value={fmtNum(catTotals["NC"] ?? 0, 0)} color="var(--success)" />
                  <StatCardCalm label="Alarmes" value={fmtNum(catTotals["Alarme"] ?? 0, 0)} color="var(--destructive)" />
                  <StatCardCalm label="Energia" value={fmtNum(catTotals["Energia"] ?? 0, 0)} color="var(--neon-orange)" />
                </div>

                {(() => {
                  const segs = [
                    { label: "Fixo", value: catTotals["Fixo"] ?? 0, color: "var(--neon-blue)" },
                    { label: "Móvel", value: catTotals["Móvel"] ?? 0, color: "var(--success)" },
                    { label: "Marcações", value: catTotals["Marcações"] ?? 0, color: "var(--neon-violet)" },
                    { label: "Mais Negócio", value: catTotals["MaisNegocio"] ?? 0, color: "var(--neon-yellow)" },
                  ];
                  const sum = segs.reduce((a, s) => a + s.value, 0);
                  return (
                    <div className="mt-2.5">
                      <div className="flex h-3 w-full gap-1">
                        {segs.map((s) => (
                          <div
                            key={s.label}
                            className="h-full min-w-[6px] rounded-full"
                            style={{
                              flexGrow: sum > 0 ? Math.max(s.value, sum * 0.015) : 1,
                              flexBasis: 0,
                              background: s.value > 0 ? s.color : "var(--muted)",
                              opacity: s.value > 0 ? 1 : 0.4,
                            }}
                          />
                        ))}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
                        {segs.map((s) => (
                          <span key={s.label} className="inline-flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                            {s.label} <b className="tabular-nums text-foreground">{fmtNum(s.value, 2)}</b>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <button
                type="button"
                onClick={() => { setCombinaOpen(true); haptic("tap"); }}
                className="press flex items-center gap-3 rounded-md border px-3 py-2 text-left transition hover:bg-muted/40"
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white"
                  style={{ background: "linear-gradient(135deg, var(--combina-continente), var(--combina-galp))" }}
                >
                  <ShoppingCart className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--combina-continente)" }}>Combina</div>
                  <div className="truncate text-[10px] text-muted-foreground">NOS + Galp + Continente · toca para ver/registar</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xl font-extrabold tabular-nums" style={{ color: "var(--combina-continente)" }}>
                    <AnimatedNumber value={combinaTotal} formatter={(v) => fmtNum(v, 0)} />
                  </div>
                  <div className="text-[9px] uppercase text-muted-foreground">hoje</div>
                </div>
              </button>

              <div className="rounded-md border bg-muted/20 px-3 py-2">
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Serviço</div>
                <div className="grid grid-cols-3 gap-y-1.5 text-[11px] sm:grid-cols-5">
                  <div>TME <b className="tabular-nums text-foreground">{fmtSecsAsTime(totDay.tme)}</b></div>
                  <div>TMA <b className="tabular-nums text-foreground">{fmtSecsAsTime(totDay.tma)}</b></div>
                  <div>%TD <b className="tabular-nums text-foreground">{totDay.pct.toFixed(0)}%</b></div>
                  <div>Atend. <b className="tabular-nums" style={{ color: "var(--success)" }}>{fmtNum(totDay.atendidos, 0)}</b></div>
                  <div>Senhas <b className="tabular-nums text-foreground">{tDay.length}</b></div>
                </div>
              </div>

              <Dialog open={combinaOpen} onOpenChange={setCombinaOpen}>
                <DialogContent
                  className="max-w-md bg-card"
                  style={{ borderColor: "color-mix(in oklab, var(--combina-continente) 45%, transparent)" }}
                >
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-base font-black uppercase tracking-wider">
                      <ShoppingCart className="h-5 w-5" style={{ color: "var(--combina-galp)" }} />
                      <span style={{ color: "var(--combina-continente)" }}>Combina</span>
                      <span className="text-muted-foreground normal-case tracking-normal">· Adesões do dia</span>
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                      {combinaTotal > 0
                        ? `${fmtNum(combinaTotal, 0)} adesões registadas hoje (NOS + Galp + Continente), por colaborador.`
                        : "Ainda não há adesões Combina registadas hoje."}
                    </DialogDescription>
                    <div className="flex overflow-hidden rounded-md border border-border/60 text-[9px] font-black uppercase tracking-widest" aria-hidden>
                      <span className="flex-1 py-1 text-center" style={{ background: "var(--combina-nos)", color: "#fff" }}>NOS</span>
                      <span className="flex-1 py-1 text-center" style={{ background: "var(--combina-galp)", color: "#fff" }}>Galp</span>
                      <span className="flex-1 py-1 text-center" style={{ background: "var(--combina-continente)", color: "#fff" }}>Continente</span>
                    </div>
                  </DialogHeader>
                  <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
                    {combinaByEmp.map(([emp, items]) => {
                      const subtotal = items.reduce((a, x) => a + x.qty, 0);
                      return (
                        <div
                          key={emp}
                          className="rounded-lg border bg-muted/40 p-2"
                          style={{ borderColor: "color-mix(in oklab, var(--combina-galp) 30%, transparent)" }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                              <span
                                className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-black"
                                style={{
                                  background: "linear-gradient(135deg, var(--combina-galp), var(--combina-continente))",
                                  color: "#fff",
                                }}
                              >
                                {initials(emp)}
                              </span>
                              {emp}
                            </span>
                            <span className="text-sm font-black tabular-nums" style={{ color: "var(--combina-galp)" }}>
                              {fmtNum(subtotal, 0)}
                            </span>
                          </div>
                          <ul className="mt-1.5 space-y-1">
                            {items.map((it, i) => (
                              <li key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>Adesão</span>
                                <span className="font-semibold tabular-nums text-foreground">+{fmtNum(it.qty, 0)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                    {combinaByEmp.length === 0 && (
                      <p className="py-4 text-center text-xs text-muted-foreground">Sem adesões para mostrar.</p>
                    )}
                  </div>

                  <div
                    className="mt-3 rounded-lg border bg-muted/40 p-2.5"
                    style={{ borderColor: "color-mix(in oklab, var(--combina-continente) 35%, transparent)" }}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--combina-continente)" }}>
                      Registar adesão
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        value={combinaEmpId}
                        onChange={(e) => setCombinaEmpId(e.target.value)}
                        className="focus-neon min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-xs"
                      >
                        <option value="">Colaborador…</option>
                        {(empQ.data ?? []).map((e) => (
                          <option key={e.id} value={e.id}>{e.nome}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setCombinaQty((v) => Math.max(1, v - 1))}
                          className="press focus-neon grid h-8 w-8 place-items-center rounded-md border bg-card text-sm font-bold"
                          aria-label="Menos"
                        >−</button>
                        <span className="w-6 text-center text-sm font-black tabular-nums">{combinaQty}</span>
                        <button
                          onClick={() => setCombinaQty((v) => v + 1)}
                          className="press focus-neon grid h-8 w-8 place-items-center rounded-md border bg-card text-sm font-bold"
                          aria-label="Mais"
                        >+</button>
                      </div>
                      <button
                        onClick={() => void saveCombina()}
                        disabled={!combinaEmpId}
                        className="press focus-neon rounded-md px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
                        style={{
                          background: "linear-gradient(90deg, var(--combina-galp), var(--combina-continente))",
                          boxShadow: "none",
                        }}
                      >
                        Guardar
                      </button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <SectionCard
              title="Ranking"
              accent="blue"
              right={shiftsToday.length === 0 ? `${empRows.length} (sem Sisqual)` : `${empRows.length}`}
            >
              {empRows.length === 0 ? (
                <div className="vendor-empty">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-[var(--neon-blue)]">
                    <ShoppingCart className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-foreground">Sem vendedores para mostrar</div>
                    <div className="text-[10px] text-muted-foreground">
                      {shiftsToday.length === 0
                        ? "Ainda não existem colaboradores ativos."
                        : "Ninguém está escalado para hoje na Sisqual."}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="overflow-auto" style={{ maxHeight: "min(48vh, 420px)" }}>
                  <table className="w-full min-w-[720px] text-xs md:text-sm">
                    <thead className="sticky top-0 z-10 bg-card">
                      <tr className="border-b text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-2.5 py-2 text-left font-semibold">Vendedor</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Pts</th>
                        <th className="px-2.5 py-2 text-right font-semibold">TV</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Móvel</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Alarme</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Energia</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Marcações</th>
                        <th className="px-2.5 py-2 text-right font-semibold">+Negócio</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Atd.</th>
                        <th className="px-2.5 py-2 text-right font-semibold">TMA</th>
                        <th className="px-2.5 py-2 text-right font-semibold">Efic.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empRows.map((r, i) => {
                        const medal = r.pts > 0 ? ["🥇", "🥈", "🥉"][i] : null;
                        const effColor = r.tep >= 45 ? "var(--success)" : r.tep >= 25 ? "var(--neon-yellow)" : "var(--destructive)";
                        return (
                          <tr
                            key={r.e.id}
                            onClick={() => { haptic("tap"); setFocusId((v) => (v === r.e.id ? null : r.e.id)); }}
                            className={classNames(
                              "cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/40",
                              focusId === r.e.id && "bg-muted/60",
                            )}
                          >
                            <td className="px-2.5 py-2 font-semibold text-foreground">
                              {medal && <span className="mr-1.5">{medal}</span>}
                              {r.e.nome}
                            </td>
                            <td className="px-2.5 py-2 text-right font-bold tabular-nums" style={{ color: "var(--neon-blue)" }}>{fmtNum(r.pts, 2)}</td>
                            <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">{r.tvs}</td>
                            <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">{r.movel}</td>
                            <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">{r.alarmes}</td>
                            <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">{r.energia}</td>
                            <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">{r.marcacoes}</td>
                            <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">{fmtNum(r.maisNegocio, 2)}</td>
                            <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">{r.atendidos}</td>
                            <td className="px-2.5 py-2 text-right tabular-nums text-muted-foreground">{fmtSecsAsTime(r.tma)}</td>
                            <td className="px-2.5 py-2 text-right">
                              <span className="inline-flex items-center gap-1.5 font-bold tabular-nums" style={{ color: effColor }}>
                                <span className="h-1.5 w-1.5 rounded-full" style={{ background: effColor }} />
                                {r.tep.toFixed(0)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        {(sgfQ.isLoading || salesQ.isLoading || salesWeekQ.isLoading) && (
          <div className="mt-2 grid grid-cols-2 gap-2" aria-label="A carregar dados do PDS">
            <span className="skeleton-neon h-2" />
            <span className="skeleton-neon h-2" />
          </div>
        )}
        {!salesMonthQ.isFetched && <span className="hidden" />}
      </div>
    </div>
  );
}

type Agg = {
  total: number; atendidos: number; cancelados: number;
  tme: number; tma: number; pct: number;
};

function EodStat({ label, value, hint, color }: { label: string; value: string; hint: string; color: string }) {
  return (
    <div
      className="rounded-lg border bg-card p-2"
      style={{ boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${color} 30%, transparent)` }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="truncate text-base font-extrabold tabular-nums" style={{ color }}>{value}</div>
      <div className="truncate text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function aggregate(rows: Ticket[]): Agg {
  const atendidos = rows.filter((r) => r.estado === "terminada").length;
  const cancelados = rows.filter((r) => r.estado === "cancelado").length;
  const wRows = rows.filter((r) => r.espera_s);
  const aRows = rows.filter((r) => r.atendimento_s);
  const tme = wRows.reduce((a, r) => a + (r.espera_s ?? 0), 0) / (wRows.length || 1);
  const tma = aRows.reduce((a, r) => a + (r.atendimento_s ?? 0), 0) / (aRows.length || 1);
  const total = rows.length;
  const pct = total ? (cancelados / total) * 100 : 0;
  return { total, atendidos, cancelados, tme, tma, pct };
}

function brand(accent: "orange" | "blue") {
  return accent === "orange" ? "var(--brand-orange)" : "var(--brand-blue)";
}

function useIsMobile() {
  const [m, setM] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1023px)");
    const h = () => setM(mq.matches);
    h();
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return m;
}

function SectionCard({
  title, accent, right, children,
  collapsibleOnMobile = false,
  defaultMobileOpen = true,
}: {
  title: string;
  accent: "orange" | "blue";
  right?: React.ReactNode;
  children: React.ReactNode;
  collapsibleOnMobile?: boolean;
  defaultMobileOpen?: boolean;
}) {
  const c = brand(accent);
  const isMobile = useIsMobile();
  const collapsible = collapsibleOnMobile && isMobile;
  const [open, setOpen] = useState<boolean>(defaultMobileOpen);
  useEffect(() => {
    if (!isMobile) setOpen(true);
    else setOpen(defaultMobileOpen);
  }, [isMobile, defaultMobileOpen]);

  return (
    <section className="glass-card overflow-hidden rounded-lg shadow-sm">
      <header
        role={collapsible ? "button" : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
        onKeyDown={collapsible ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); } } : undefined}
        className={classNames(
          "flex items-center justify-between gap-2 px-3 py-1.5 text-foreground select-none",
          collapsible && "cursor-pointer",
        )}
        style={{ background: `color-mix(in oklab, ${c} 12%, var(--card))`, boxShadow: `inset 3px 0 0 ${c}`, borderBottom: `1px solid color-mix(in oklab, ${c} 25%, transparent)` }}
      >
        <h2 className="section-title-neon text-[10px] font-black uppercase tracking-widest">{title}</h2>
        <div className="flex items-center gap-2">
          {right && <span className="text-[10px] opacity-80 tabular-nums">{right}</span>}
          {collapsible && (
            <ChevronDown className={classNames("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          )}
        </div>
      </header>
      {(!collapsible || open) && children}
    </section>
  );
}

function StatCardCalm({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2.5" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-extrabold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

function Metric({
  label, value, tone, big, icon,
}: { label: string; value: string; tone?: "success" | "danger"; big?: boolean; icon?: string }) {
  const c = tone === "success" ? "text-[color:var(--success)]" : tone === "danger" ? "text-destructive" : "";
  const accent = icon ? pickIcon(icon).color : undefined;
  const isGlobal = label === "GLOBAL";
  return (
    <div data-metric className={`glass-card px-1 py-1.5 text-center md:px-2 ${big ? "relative overflow-hidden" : ""}`}>
      {big && (
        <div
          className="pointer-events-none absolute inset-0 opacity-15"
          style={{
            background: accent
              ? `radial-gradient(circle at 50% 80%, color-mix(in oklab, ${accent} 35%, transparent), transparent 70%)`
              : "radial-gradient(circle at 50% 80%, color-mix(in oklab, var(--neon-green) 30%, transparent), transparent 70%)",
          }}
        />
      )}
      <div className="relative flex items-center justify-center gap-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground leading-tight">
        {icon && <NeonIcon label={icon} size={11} />}
        <span data-label>{label}</span>
      </div>
      <div
        data-value
        className={`relative tabular-nums font-black leading-none ${big ? (isGlobal ? "text-[1.75rem] sm:text-[2.1rem] lg:text-[2.6rem]" : "text-[1.55rem] sm:text-[1.7rem] lg:text-[2.1rem]") : "text-[0.95rem] sm:text-[1.1rem]"}`}
        style={
          accent && !tone
            ? { color: accent }
            : undefined
        }
      >
        {value}
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  const { color } = pickIcon(label);
  const short = { "Marcações": "Marc.", "Alarme": "Alarm.", "Energia": "Energ." }[label] ?? label;
  return (
    <div className="vendor-mini bg-background/80 px-0.5 py-0.5 text-center">
      <div className="flex items-center justify-center gap-0.5 text-[8px] font-semibold uppercase tracking-wider text-foreground/75 leading-tight">
        <NeonIcon label={label} size={10} className="shrink-0" />
        <span className="cap-label-full min-w-0 truncate hidden sm:inline">{label}</span>
        <span className="cap-label-short min-w-0 truncate sm:hidden">{short}</span>
      </div>
      <div
        className="tabular-nums font-bold text-[12px] leading-tight"
        style={value > 0 ? { color } : undefined}
      >
        <AnimatedNumber value={value} formatter={(current) => fmtNum(current, 0)} />
      </div>
    </div>
  );
}

function MiniPodium({ top3 }: { top3: { e: Employee; pts: number }[] }) {
  if (top3.length === 0 || top3.every((r) => r.pts === 0)) return null;
  const [second, first, third] = [top3[1], top3[0], top3[2]];
  const firstNames = top3.map((r) => r?.e.nome?.split(" ")[0] ?? "");
  const displayName = (nome?: string) => {
    if (!nome) return "—";
    const parts = nome.trim().split(/\s+/);
    const first = parts[0];
    const collides = firstNames.filter((n) => n === first).length > 1;
    if (!collides || parts.length < 2) return first;
    return `${first} ${parts[parts.length - 1][0]}.`;
  };
  const cells = [
    { r: second, place: 2, medal: "🥈", color: "#c0c9d6", h: 52 },
    { r: first, place: 1, medal: "🥇", color: "var(--neon-yellow)", h: 76 },
    { r: third, place: 3, medal: "🥉", color: "#cd7f32", h: 38 },
  ];
  return (
    <div className="border-b bg-gradient-to-b from-black/20 to-transparent px-2 pt-3 pb-2">
      <div className="grid grid-cols-3 items-end gap-2">
        {cells.map(({ r, place, medal, color, h }) => (
          <div key={place} className="flex flex-col items-center">
            <div className="text-xl leading-none">{medal}</div>
            <div className="mt-1 truncate text-[11px] font-bold text-center w-full" title={r?.e.nome}>
              {displayName(r?.e.nome)}
            </div>
            <div className="tabular-nums text-[13px] font-black leading-tight" style={{ color }}>
              {r ? fmtNum(r.pts, 2) : "0"}
            </div>
            <div
              className="mt-1.5 w-full rounded-t border border-white/10"
              style={{
                height: `${h}px`,
                background: `linear-gradient(180deg, color-mix(in oklab, ${color} 45%, transparent), color-mix(in oklab, ${color} 8%, transparent))`,
                boxShadow: `inset 0 2px 8px color-mix(in oklab, ${color} 40%, transparent)`,
              }}
            >
              <div className="grid h-full place-items-center">
                <span className="text-xl font-black" style={{ color, opacity: 0.4 }}>{place}º</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
