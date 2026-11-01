import { createFileRoute } from "@tanstack/react-router";
import { RouteError, RouteNotFound, pageHead } from "@/components/RouteBoundary";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { EditNumber } from "./contador";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmDialog";

export const Route = createFileRoute("/_authenticated/produtos")({
  head: pageHead("Produtos · PDS Strada Outlet", "Catálogo de produtos e ponderadores de pontos."),
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
  notFoundComponent: () => <RouteNotFound />,
  component: ProdutosPage,
});

function slugCode(s: string) {
  return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function ProdutosPage() {
  const qc = useQueryClient();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [nome, setNome] = useState("");
  const [peso, setPeso] = useState("1");

  const { data, isLoading } = useQuery({
    queryKey: ["products-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("ordem");
      if (error) throw error;
      return data;
    },
  });

  async function add() {
    if (!nome.trim()) return;
    const codigo = slugCode(nome);
    const { error } = await supabase.from("products").insert({
      nome: nome.trim(), codigo, peso: Number(peso) || 0,
      ordem: data?.length ?? 0,
    });
    if (error) toast.error(error.message); else {
      toast.success("Produto adicionado"); setNome(""); setPeso("1");
      qc.invalidateQueries({ queryKey: ["products-all"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    }
  }
  async function update(id: string, patch: { peso?: number; ativo?: boolean }) {
    await supabase.from("products").update(patch).eq("id", id);
    qc.invalidateQueries({ queryKey: ["products-all"] });
    qc.invalidateQueries({ queryKey: ["products"] });
  }
  async function remove(id: string, nome: string) {
    if (!(await confirm({
      title: `Eliminar "${nome}"?`,
      description: "Todas as vendas associadas a este produto também serão removidas.",
      confirmLabel: "Eliminar",
      destructive: true,
    }))) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message); else {
      qc.invalidateQueries({ queryKey: ["products-all"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    }
  }

  return (
    <div>
      <PageHeader title="Produtos" subtitle={`${data?.length ?? 0} produtos`} />
      <div className="p-4 md:p-6 space-y-4">
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Adicionar produto</h3>
          <div className="grid sm:grid-cols-[1fr_120px_auto] gap-2">
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do produto"
              className="rounded-md border bg-background px-3 py-2 text-sm" />
            <input value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="Peso" type="number" step="0.25"
              className="rounded-md border bg-background px-3 py-2 text-sm" />
            <button onClick={add} className="inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
              <Plus className="h-4 w-4" /> Adicionar
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs">
                <th className="px-3 py-2 text-left">Nome</th>
                <th className="px-3 py-2 text-left">Código</th>
                <th className="px-3 py-2 text-right">Peso</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">A carregar...</td></tr>}
              {data?.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-accent/20">
                  <td className="px-3 py-2 font-medium">{p.nome}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground font-mono">{p.codigo}</td>
                  <td className="px-3 py-2 text-right">
                    <EditNumber value={Number(p.peso)} onSave={(v) => update(p.id, { peso: v })} width="w-20" />
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => update(p.id, { ativo: !p.ativo })}
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${p.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                      {p.ativo ? "Ativo" : "Inativo"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => remove(p.id, p.nome)} className="rounded-md p-1.5 text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
