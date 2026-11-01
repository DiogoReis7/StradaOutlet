import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { useState } from "react";
import { useNpsAlert, NPS_DET_THRESHOLD } from "@/hooks/use-nps-alert";
import { useAuth } from "@/hooks/use-auth";
import { readNotifPrefs } from "@/lib/notif-prefs";

function extractName(raw: string) {
  const m = raw.match(/^(.*?)\s*\([^)]+\)\s*$/);
  return m ? m[1].trim() : raw.trim();
}

export function NpsAlertBanner() {
  const { data } = useNpsAlert();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const rows = data?.rows ?? [];
  if (rows.length === 0) return null;
  if (!readNotifPrefs(user?.id ?? null).detratores) return null;

  const preview = rows.slice(0, 3);
  const hidden = rows.length - preview.length;

  return (
    <div
      className="alert-pulse mx-3 mt-2 rounded-md border px-3 py-1.5 text-[11px]"
      style={{
        borderColor: "var(--destructive)",
        background: "color-mix(in oklab, var(--destructive) 12%, transparent)",
        color: "var(--destructive)",
              }}
    >
      <div className="flex items-center justify-between gap-2">
        <Link to="/nps" className="min-w-0 font-bold uppercase tracking-wider hover:opacity-90">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          NPS · baixar detratores (&gt; {(NPS_DET_THRESHOLD * 100).toFixed(0)}%) — {rows.length} colaborador(es)
        </Link>
        {rows.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0 inline-flex items-center gap-0.5 rounded border border-current px-1.5 py-0.5 text-[10px] font-semibold hover:opacity-80"
          >
            {expanded ? "Ver menos" : `Ver ${hidden}+`}
            <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>
      <div className="mt-0.5 font-normal text-foreground/90">
        {(expanded ? rows : preview).map((d) => `${extractName(d.raw_name)} (${(d.det_pct * 100).toFixed(1)}%)`).join(" · ")}
        {!expanded && hidden > 0 && <span className="text-muted-foreground"> · +{hidden}</span>}
      </div>
    </div>
  );
}
