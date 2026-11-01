import { createFileRoute } from "@tanstack/react-router";
import { RouteError, RouteNotFound, pageHead } from "@/components/RouteBoundary";
import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Plus, Trash2, Check, X, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useConfirm } from "@/components/ConfirmDialog";

export const Route = createFileRoute("/_authenticated/colaboradores")({
  head: pageHead("Colaboradores · PDS Strada Outlet", "Gestão de colaboradores, categorias e objetivos."),
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
  notFoundComponent: () => <RouteNotFound />,
  component: ColaboradoresPage,
});

const EMP_COLS = "id,nome,slug,username_sgf,nome_sgf,ativo,ordem,categoria,objetivo_mes,notas";


function slugify(s: string) {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function ColaboradoresPage() {
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [nome, setNome] = useState("");
  const [user, setUser] = useState("");
  const [nif, setNif] = useState("");
  const [categoria, setCategoria] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUser, setEditUser] = useState("");
  const [editNif, setEditNif] = useState("");
  const [editCategoria, setEditCategoria] = useState("");
  const [editObjetivo, setEditObjetivo] = useState("");
  const [editNotas, setEditNotas] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["employees-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select(EMP_COLS).order("ordem");
      if (error) throw error;
      return data as any[];
    },
  });

  // Admin-only: fetch NIFs through secure RPC
  const nifsQ = useQuery({
    queryKey: ["employees-nifs"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_get_employee_nifs");
      if (error) throw error;
      return data as { id: string; nif: number | null }[];
    },
  });

  const nifMap = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const r of nifsQ.data ?? []) m.set(r.id, r.nif);
    return m;
  }, [nifsQ.data]);

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["employees-all"] });
    qc.invalidateQueries({ queryKey: ["employees-nifs"] });
    qc.invalidateQueries({ queryKey: ["employees"] });
    qc.invalidateQueries({ queryKey: ["employees-username"] });
  }

  async function add() {
    if (!nome.trim()) return;
    const nifN = nif.trim() ? Number(nif.trim()) : null;
    if (nif.trim() && !Number.isFinite(nifN)) {
      toast.error("NIF inválido"); return;
    }
    const insertPayload: any = {
      nome: nome.trim(),
      slug: slugify(nome),
      username_sgf: user.trim() || null,
      categoria: categoria.trim() || null,
      ordem: (data?.length ?? 0),
    };
    if (isAdmin && nifN != null) insertPayload.nif = nifN;
    const { error } = await supabase.from("employees").insert(insertPayload);
    if (error) toast.error(error.message); else {
      toast.success("Vendedor adicionado");
      setNome(""); setUser(""); setNif(""); setCategoria("");
      invalidateAll();
    }
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    await supabase.from("employees").update({ ativo: !ativo }).eq("id", id);
    invalidateAll();
  }

  async function remove(id: string, nome: string) {
    if (!(await confirm({
      title: `Eliminar "${nome}"?`,
      description: "Todas as vendas associadas a este vendedor também serão removidas.",
      confirmLabel: "Eliminar",
      destructive: true,
    }))) return;
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) toast.error(error.message); else invalidateAll();
  }

  function startEdit(e: any) {
    setEditingId(e.id);
    setEditUser(e.username_sgf ?? "");
    setEditNif(isAdmin ? (nifMap.get(e.id) != null ? String(nifMap.get(e.id)) : "") : "");
    setEditCategoria(e.categoria ?? "");
    setEditObjetivo(e.objetivo_mes ?? "");
    setEditNotas(e.notas ?? "");
  }

  async function saveEdit(id: string) {
    const nifN = editNif.trim() ? Number(editNif.trim()) : null;
    if (editNif.trim() && !Number.isFinite(nifN)) {
      toast.error("NIF inválido"); return;
    }
    const { error } = await supabase.from("employees").update({
      username_sgf: editUser.trim() || null,
      categoria: editCategoria.trim() || null,
      objetivo_mes: editObjetivo.trim() || null,
      notas: editNotas.trim() || null,
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (isAdmin) {
      const { error: e2 } = await supabase.rpc("admin_set_employee_nif", { _id: id, _nif: nifN as any });
      if (e2) { toast.error(e2.message); return; }
    }
    toast.success("Atualizado");
    setEditingId(null);
    invalidateAll();
  }

  return (
    <div>
      <PageHeader title="Vendedores" subtitle={`${data?.length ?? 0} vendedores`} />
      <div className="p-4 md:p-6 space-y-4">
        {!isAdmin && (
          <div className="flex items-center gap-2 rounded-lg border bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            <ShieldAlert className="h-4 w-4" />
            O NIF dos vendedores está oculto. Só os administradores podem ver e editar.
          </div>
        )}

        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Adicionar vendedor</h3>
          <div className={`grid gap-2 ${isAdmin ? "sm:grid-cols-[1fr_1fr_140px_160px_auto]" : "sm:grid-cols-[1fr_1fr_160px_auto]"}`}>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo"
              className="rounded-md border bg-background px-3 py-2 text-sm" />
            <input value={user} onChange={(e) => setUser(e.target.value)} placeholder="Username SGF (ex: ntpinto)"
              className="rounded-md border bg-background px-3 py-2 text-sm" />
            {isAdmin && (
              <input value={nif} onChange={(e) => setNif(e.target.value)} placeholder="NIF (Sisqual)"
                inputMode="numeric"
                className="rounded-md border bg-background px-3 py-2 text-sm" />
            )}
            <input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Categoria (opcional)"
              className="rounded-md border bg-background px-3 py-2 text-sm" />
            <button onClick={add} className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" /> Adicionar
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            A <b>Categoria</b> é opcional (é preenchida com a categoria da Sisqual) e aparece à frente do nome no PDS e na página individual. O <b>Username SGF</b> emparelha as senhas SGF{isAdmin && <> · O <b>NIF</b> é necessário para emparelhar com a Sisqual</>}.
          </p>
        </div>

        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs">
                <th className="px-3 py-2 text-left">Nome</th>
                <th className="px-3 py-2 text-left">Categoria</th>
                <th className="px-3 py-2 text-left">SGF</th>
                {isAdmin && <th className="px-3 py-2 text-left">NIF</th>}
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={isAdmin ? 6 : 5} className="px-3 py-6 text-center text-muted-foreground">A carregar...</td></tr>}
              {data?.map((e) => {
                const editing = editingId === e.id;
                const currentNif = nifMap.get(e.id);
                return (
                  <Fragment key={e.id}>
                  <tr className="border-b last:border-0 hover:bg-accent/20">
                    <td className="px-3 py-2 font-medium">
                      {e.nome}
                      {(e.objetivo_mes || e.notas) && !editing && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground truncate max-w-[260px]">
                          {e.objetivo_mes && <span className="mr-2">🎯 {e.objetivo_mes}</span>}
                          {e.notas && <span>📝 {e.notas}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {editing ? (
                        <input value={editCategoria} onChange={(ev) => setEditCategoria(ev.target.value)}
                          className="w-32 rounded border bg-background px-2 py-1 text-xs" />
                      ) : e.categoria ? (
                        <span className="inline-flex items-center rounded-full bg-[color:var(--brand-orange)]/10 px-2 py-0.5 text-[11px] font-medium text-[color:var(--brand-orange)]">{e.categoria}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {editing ? (
                        <input value={editUser} onChange={(ev) => setEditUser(ev.target.value)}
                          className="w-32 rounded border bg-background px-2 py-1 text-xs" />
                      ) : (
                        <span className="text-muted-foreground">@{e.username_sgf ?? "—"}</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-3 py-2 text-xs tabular-nums">
                        {editing ? (
                          <input value={editNif} onChange={(ev) => setEditNif(ev.target.value)}
                            inputMode="numeric"
                            className="w-28 rounded border bg-background px-2 py-1 text-xs" />
                        ) : (
                          <span className={currentNif == null ? "text-amber-600 font-medium" : "text-muted-foreground"}>
                            {currentNif ?? "— (em falta)"}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <button onClick={() => toggleAtivo(e.id, e.ativo)}
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${e.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                        {e.ativo ? "Ativo" : "Inativo"}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {editing ? (
                        <>
                          <button onClick={() => saveEdit(e.id)} className="rounded-md p-1.5 text-success hover:bg-success/10" title="Guardar">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent" title="Cancelar">
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(e)} className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent">
                            Editar
                          </button>
                          <button onClick={() => remove(e.id, e.nome)} className="rounded-md p-1.5 text-destructive hover:bg-destructive/10" title="Eliminar">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                  {editing && (
                    <tr className="border-b bg-accent/10">
                      <td colSpan={isAdmin ? 6 : 5} className="px-3 py-2">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <label className="text-[11px] text-muted-foreground">
                            🎯 Objetivo do mês
                            <input value={editObjetivo} onChange={(ev) => setEditObjetivo(ev.target.value)} placeholder="Ex: 30 móveis · 5 alarmes"
                              className="mt-1 w-full rounded border bg-background px-2 py-1 text-xs text-foreground" />
                          </label>
                          <label className="text-[11px] text-muted-foreground">
                            📝 Notas
                            <input value={editNotas} onChange={(ev) => setEditNotas(ev.target.value)} placeholder="Observação visível no PDS"
                              className="mt-1 w-full rounded border bg-background px-2 py-1 text-xs text-foreground" />
                          </label>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
