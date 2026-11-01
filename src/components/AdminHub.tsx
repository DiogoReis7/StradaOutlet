import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useConfirm } from "@/components/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ymd } from "@/lib/domain";
import {
  Megaphone, Plus, Trash2, EyeOff, Eye, UserCircle,
  CalendarClock, Save, Users, Check, X,
} from "lucide-react";
type Announcement = {
  id: string; titulo: string; corpo: string | null; prioridade: string;
  ativo: boolean; expira_em: string | null; created_at: string; employee_id: string | null;
};
const PRIORIDADES = ["normal", "importante", "urgente"] as const;
function prioridadeCor(p: string) {
  if (p === "urgente") return "var(--neon-pink)";
  if (p === "importante") return "var(--neon-yellow)";
  return "var(--neon-blue)";
}

type Emp = {
  id: string; nome: string; username_sgf: string | null; categoria: string | null;
  objetivo_pontos: number | null; ativo: boolean; ordem: number;
};

function useEmps() {
  return useQuery({
    queryKey: ["admin-hub-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,nome,username_sgf,categoria,objetivo_pontos,ativo,ordem")
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Emp[];
    },
  });
}

const inputCls = "rounded-md border bg-background px-3 py-2 text-sm";

export function AdminEmployees() {
  const qc = useQueryClient();
  const empsQ = useEmps();
  const [draft, setDraft] = useState<Record<string, Partial<Emp>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  function field(e: Emp, k: keyof Emp) {
    return draft[e.id]?.[k] !== undefined ? (draft[e.id] as any)[k] : (e[k] ?? "");
  }

  function setField(e: Emp, k: keyof Emp, v: unknown) {
    setDraft((d) => ({ ...d, [e.id]: { ...d[e.id], [k]: v } }));
  }

  async function save(e: Emp) {
    const d = draft[e.id];
    if (!d) return;
    setBusy(e.id);
    const payload: { nome?: string; username_sgf?: string | null; categoria?: string | null; objetivo_pontos?: number | null } = {};
    if (d.nome !== undefined) payload.nome = String(d.nome).trim();
    if (d.username_sgf !== undefined) payload.username_sgf = String(d.username_sgf).trim() || null;
    if (d.categoria !== undefined) payload.categoria = String(d.categoria).trim() || null;
    if (d.objetivo_pontos !== undefined) {
      const v = d.objetivo_pontos as number | string | null;
      payload.objetivo_pontos = v === "" || v === null ? null : Number(v);
    }
    const { error } = await supabase.from("employees").update(payload as never).eq("id", e.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`${e.nome} atualizado`);
    setDraft((dd) => { const nd = { ...dd }; delete nd[e.id]; return nd; });
    qc.invalidateQueries({ queryKey: ["admin-hub-employees"] });
    qc.invalidateQueries({ queryKey: ["employees"] });
  }

  async function toggleAtivo(e: Emp) {
    const { error } = await supabase.from("employees").update({ ativo: !e.ativo }).eq("id", e.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin-hub-employees"] });
    qc.invalidateQueries({ queryKey: ["employees"] });
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs">
            <th className="px-3 py-2 text-left">Nome</th>
            <th className="px-3 py-2 text-left">Utilizador SGF</th>
            <th className="px-3 py-2 text-left">Categoria</th>
            <th className="px-3 py-2 text-left">Obj. pontos</th>
            <th className="px-3 py-2 text-left">Estado</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {empsQ.isLoading && (
            <tr><td colSpan={6} className="px-3 py-4"><Skeleton className="h-6 w-full" /></td></tr>
          )}
          {(empsQ.data ?? []).map((e) => {
            const dirty = !!draft[e.id];
            return (
              <tr key={e.id} className="border-b last:border-0 align-middle">
                <td className="px-3 py-2">
                  <input value={field(e, "nome") as string} onChange={(ev) => setField(e, "nome", ev.target.value)}
                    className="w-40 rounded border bg-background px-2 py-1 text-xs" />
                </td>
                <td className="px-3 py-2">
                  <input value={field(e, "username_sgf") as string} onChange={(ev) => setField(e, "username_sgf", ev.target.value)}
                    className="w-32 rounded border bg-background px-2 py-1 text-xs" placeholder="—" />
                </td>
                <td className="px-3 py-2">
                  <input value={field(e, "categoria") as string} onChange={(ev) => setField(e, "categoria", ev.target.value)}
                    className="w-28 rounded border bg-background px-2 py-1 text-xs" placeholder="—" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" value={field(e, "objetivo_pontos") as any} onChange={(ev) => setField(e, "objetivo_pontos", ev.target.value)}
                    className="w-20 rounded border bg-background px-2 py-1 text-xs" placeholder="—" />
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => toggleAtivo(e)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${e.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                    {e.ativo ? "Ativo" : "Inativo"}
                  </button>
                </td>
                <td className="px-3 py-2 text-right">
                  {dirty && (
                    <span className="inline-flex items-center gap-1">
                      <button disabled={busy === e.id} onClick={() => save(e)}
                        className="rounded-md p-1.5 text-success hover:bg-success/10" title="Guardar">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => setDraft((dd) => { const nd = { ...dd }; delete nd[e.id]; return nd; })}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent" title="Cancelar">
                        <X className="h-4 w-4" />
                      </button>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
        <Users className="mr-1 inline h-3 w-3" />
        Edita os campos diretamente e clica no visto para guardar. Inativos não aparecem nos registos diários.
      </p>
    </div>
  );
}
