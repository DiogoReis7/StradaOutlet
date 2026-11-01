import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StickyNote, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

type Note = {
  id: string;
  data: string;
  texto: string;
  autor: string | null;
  created_at: string;
};

/** Notas/ocorrências do dia (avarias, falta de stock, afluência). */
export function DayNotesPanel({ dayIso }: { dayIso: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const [busy, setBusy] = useState(false);

  const notesQ = useQuery({
    queryKey: ["day-notes", dayIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_notes")
        .select("id,data,texto,autor,created_at")
        .eq("data", dayIso)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Note[];
    },
  });

  const notes = notesQ.data ?? [];

  async function add() {
    const t = texto.trim();
    if (!t) return;
    setBusy(true);
    try {
      const autor = user?.email?.split("@")[0] ?? null;
      const { error } = await supabase.from("day_notes").insert({ data: dayIso, texto: t, autor, user_id: user?.id ?? null });
      if (error) throw new Error(error.message);
      setTexto("");
      await qc.invalidateQueries({ queryKey: ["day-notes", dayIso] });
      toast.success("Nota registada.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao guardar nota");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    const { error } = await supabase.from("day_notes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey: ["day-notes", dayIso] });
    toast.success("Nota removida.");
  }

  return (
    <div className="mx-3 mt-2 rounded-md border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <StickyNote className="h-4 w-4 text-[color:var(--neon-orange,var(--neon-yellow))]" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-foreground/80">
          Notas do dia
        </span>
        {notes.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
            {notes.length}
          </span>
        )}
        <span className="ml-auto text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="space-y-2 border-t px-3 py-2">
          <div className="flex flex-wrap gap-2">
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
              placeholder="Ex.: sistema em baixo das 11h às 12h, sem stock de iPhone…"
              className="min-w-0 flex-1 rounded-md border bg-background px-2 py-1.5 text-xs"
            />
            <button
              onClick={() => void add()}
              disabled={busy || !texto.trim()}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-semibold hover:bg-accent disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar
            </button>
          </div>

          {notes.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Sem ocorrências registadas neste dia.</p>
          ) : (
            <ul className="space-y-1">
              {notes.map((n) => (
                <li key={n.id} className="flex items-start gap-2 rounded-md border bg-background px-2 py-1.5">
                  <span className="flex-1 text-xs">
                    {n.texto}
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {n.autor ? `· ${n.autor} ` : ""}
                      · {new Date(n.created_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                  <button
                    onClick={() => void remove(n.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
                    title="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
