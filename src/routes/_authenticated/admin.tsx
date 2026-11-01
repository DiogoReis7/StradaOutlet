import { createFileRoute } from "@tanstack/react-router";
import { RouteError, RouteNotFound, pageHead } from "@/components/RouteBoundary";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useConfirm } from "@/components/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  adminListUsers, adminCreateUser, adminSetPassword, adminSetUsername,
  adminSetUserDisabled, adminDeleteUser, adminSetRole,
} from "@/lib/admin-users.functions";
import { ShieldAlert, UserPlus, KeyRound, Check, X, Trash2, ShieldCheck, ShieldOff, History, Download, Crown, Megaphone, CalendarClock, Users, UserCog } from "lucide-react";
import { exportCsv } from "@/lib/export-csv";
import { BackupPanel } from "@/components/BackupPanel";
import { AdminEmployees } from "@/components/AdminHub";

export const Route = createFileRoute("/_authenticated/admin")({
  head: pageHead("Gestão · PDS Strada Outlet", "Gestão central da loja: contas e colaboradores."),
  errorComponent: ({ error, reset }) => <RouteError error={error} reset={reset} />,
  notFoundComponent: () => <RouteNotFound />,
  component: AdminPage,
});

type Employee = { id: string; nome: string; slug: string; username_sgf: string | null; ativo: boolean };

function AdminPage() {
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  const { confirm, dialog } = useConfirm();

  const listFn = useServerFn(adminListUsers);
  const createFn = useServerFn(adminCreateUser);
  const passFn = useServerFn(adminSetPassword);
  const nameFn = useServerFn(adminSetUsername);
  const disableFn = useServerFn(adminSetUserDisabled);
  const deleteFn = useServerFn(adminDeleteUser);
  const roleFn = useServerFn(adminSetRole);
  

  const [newUser, setNewUser] = useState("");
  const [newPass, setNewPass] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [pwId, setPwId] = useState<string | null>(null);
  const [pwValue, setPwValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"contas" | "colaboradores" | "atividade">("contas");

  const TABS = [
    { id: "contas" as const, label: "Contas", icon: UserCog },
    { id: "colaboradores" as const, label: "Colaboradores", icon: Users },
    { id: "atividade" as const, label: "Atividade", icon: History },
  ];

  const usersQ = useQuery({
    queryKey: ["admin-users"],
    enabled: isAdmin,
    queryFn: async () => listFn({ data: undefined as never }),
  });

  const empQ = useQuery({
    queryKey: ["admin-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees").select("id,nome,slug,username_sgf,ativo").order("ordem");
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
  });

  const empByUsername = useMemo(() => {
    const m = new Map<string, Employee>();
    for (const e of empQ.data ?? []) {
      if (e.username_sgf) m.set(e.username_sgf.trim().toLowerCase(), e);
    }
    return m;
  }, [empQ.data]);

  const missingAccounts = useMemo(() => {
    const have = new Set((usersQ.data ?? []).map((u) => u.username.toLowerCase()));
    return (empQ.data ?? []).filter((e) => e.username_sgf && !have.has(e.username_sgf.trim().toLowerCase()));
  }, [usersQ.data, empQ.data]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-employees"] });
    qc.invalidateQueries({ queryKey: ["employees-all"] });
    qc.invalidateQueries({ queryKey: ["employees"] });
  }

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
      toast.success(label);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEmployeeAtivo(e: Employee) {
    const { error } = await supabase.from("employees").update({ ativo: !e.ativo }).eq("id", e.id);
    if (error) toast.error(error.message);
    else refresh();
  }

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="Contas" subtitle="Gestão de acessos" />
        <div className="p-6">
          <div className="flex items-center gap-2 rounded-lg border bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            <ShieldAlert className="h-4 w-4" />
            Área reservada a administradores.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-300">
      <PageHeader title="Gestor de loja" subtitle="Gestão central: contas e colaboradores" />
      <div className="p-4 md:p-6 space-y-4">

        <div className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}>
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>

        {tab === "colaboradores" && <AdminEmployees />}
        {tab === "atividade" && <ActivityLogSection />}

        {tab === "contas" && (<>

        <BackupPanel />

        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <UserPlus className="h-4 w-4" /> Criar conta
          </h3>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input value={newUser} onChange={(e) => setNewUser(e.target.value)} placeholder="Utilizador (ex: cagil)"
              className="rounded-md border bg-background px-3 py-2 text-sm" />
            <input value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="Password (6+ caracteres)"
              className="rounded-md border bg-background px-3 py-2 text-sm" />
            <button
              disabled={busy || !newUser.trim() || newPass.length < 6}
              onClick={() => run("Conta criada", async () => {
                await createFn({ data: { username: newUser, password: newPass } });
                setNewUser(""); setNewPass("");
              })}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              Criar
            </button>
          </div>
          {missingAccounts.length > 0 && (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
              Vendedores sem conta: {missingAccounts.map((e) => e.username_sgf).join(", ")}
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs">
                <th className="px-3 py-2 text-left">Utilizador</th>
                <th className="px-3 py-2 text-left">Vendedor</th>
                <th className="px-3 py-2 text-left">Último acesso</th>
                <th className="px-3 py-2 text-left">Estado</th>
                <th className="px-3 py-2 text-left">Permissões</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {usersQ.isLoading && (
                <tr><td colSpan={6} className="px-3 py-4"><Skeleton className="h-6 w-full" /></td></tr>
              )}
              {usersQ.isError && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-destructive text-xs">
                  {(usersQ.error as Error)?.message ?? "Erro a carregar contas"}
                </td></tr>
              )}
              {usersQ.data?.map((u) => {
                const emp = empByUsername.get(u.username.toLowerCase());
                const editing = editingId === u.id;
                return (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-accent/20 align-middle">
                    <td className="px-3 py-2 font-medium">
                      {editing ? (
                        <input value={editUsername} onChange={(e) => setEditUsername(e.target.value)}
                          className="w-36 rounded border bg-background px-2 py-1 text-xs" />
                      ) : u.username}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {emp ? (
                        <span className="inline-flex items-center gap-2">
                          {emp.nome}
                          <button onClick={() => toggleEmployeeAtivo(emp)}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${emp.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                            {emp.ativo ? "Ativo" : "Inativo"}
                          </button>
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString("pt-PT") : "Nunca"}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${u.disabled ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"}`}>
                        {u.disabled ? <ShieldOff className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                        {u.disabled ? "Bloqueada" : "Ativa"}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        disabled={busy}
                        onClick={() => run(u.isAdmin ? "Permissões removidas" : "Gestor / administrador",
                          () => roleFn({ data: { userId: u.id, admin: !u.isAdmin } }))}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${u.isAdmin ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}
                        title="Alternar permissões de administrador">
                        <Crown className="h-3 w-3" /> {u.isAdmin ? "Gestor" : "Colaborador"}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {editing ? (
                        <>
                          <button disabled={busy} onClick={() => run("Utilizador alterado", async () => {
                            await nameFn({ data: { userId: u.id, username: editUsername } });
                            setEditingId(null);
                          })} className="rounded-md p-1.5 text-success hover:bg-success/10" title="Guardar">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent">
                            <X className="h-4 w-4" />
                          </button>
                        </>
                      ) : pwId === u.id ? (
                        <span className="inline-flex items-center gap-1">
                          <input value={pwValue} onChange={(e) => setPwValue(e.target.value)} placeholder="Nova password"
                            className="w-36 rounded border bg-background px-2 py-1 text-xs" />
                          <button disabled={busy || pwValue.length < 6} onClick={() => run("Password alterada", async () => {
                            await passFn({ data: { userId: u.id, password: pwValue } });
                            setPwId(null); setPwValue("");
                          })} className="rounded-md p-1.5 text-success hover:bg-success/10 disabled:opacity-40">
                            <Check className="h-4 w-4" />
                          </button>
                          <button onClick={() => { setPwId(null); setPwValue(""); }} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent">
                            <X className="h-4 w-4" />
                          </button>
                        </span>
                      ) : (
                        <>
                          <button onClick={() => { setEditingId(u.id); setEditUsername(u.username); }}
                            className="rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent">Editar</button>
                          <button onClick={() => { setPwId(u.id); setPwValue(""); }}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent" title="Trocar password">
                            <KeyRound className="h-4 w-4" />
                          </button>
                          <button disabled={busy} onClick={() => run(u.disabled ? "Conta ativada" : "Conta bloqueada",
                            () => disableFn({ data: { userId: u.id, disabled: !u.disabled } }))}
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent" title={u.disabled ? "Ativar" : "Bloquear"}>
                            {u.disabled ? <ShieldCheck className="h-4 w-4" /> : <ShieldOff className="h-4 w-4" />}
                          </button>
                          <button onClick={async () => {
                            if (!(await confirm({
                              title: `Eliminar conta "${u.username}"?`,
                              description: "O acesso será removido permanentemente.",
                              confirmLabel: "Eliminar", destructive: true,
                            }))) return;
                            run("Conta eliminada", () => deleteFn({ data: { userId: u.id } }));
                          }} className="rounded-md p-1.5 text-destructive hover:bg-destructive/10" title="Eliminar">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-muted-foreground">
          O utilizador corresponde ao username SGF do vendedor. Bloquear uma conta impede o login sem apagar dados.
        </p>

        </>)}

      </div>
      {dialog}
    </div>
  );
}

type LogRow = {
  id: string; tabela: string; accao: string; registo_id: string | null;
  user_id: string | null; detalhe: any; created_at: string;
};

/** Histórico de alterações (auditoria) das vendas e registos. */
function ActivityLogSection() {
  const logQ = useQuery({
    queryKey: ["activity-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("id,tabela,accao,registo_id,user_id,detalhe,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  const rows = logQ.data ?? [];

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-bold uppercase tracking-wider">Histórico de atividade</span>
        <span className="text-[11px] text-muted-foreground">últimos 100 registos</span>
        <button
          onClick={() => exportCsv("historico-atividade", rows.map((r) => ({
            Data: new Date(r.created_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }),
            Tabela: r.tabela, Ação: r.accao, Registo: r.registo_id ?? "",
            Detalhe: r.detalhe ? JSON.stringify(r.detalhe) : "",
          })))}
          disabled={rows.length === 0}
          className="ml-auto inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold hover:bg-accent disabled:opacity-40"
        >
          <Download className="h-3 w-3" /> CSV
        </button>
      </div>
      {logQ.isLoading ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="p-4 text-center text-xs text-muted-foreground">Sem atividade registada.</p>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/80 text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-2 py-1.5 text-left">Quando</th>
                <th className="px-2 py-1.5 text-left">Tabela</th>
                <th className="px-2 py-1.5 text-left">Ação</th>
                <th className="px-2 py-1.5 text-left">Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="whitespace-nowrap px-2 py-1 tabular-nums text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}
                  </td>
                  <td className="px-2 py-1">{r.tabela}</td>
                  <td className="px-2 py-1 font-semibold">{r.accao}</td>
                  <td className="max-w-[420px] truncate px-2 py-1 text-muted-foreground">
                    {r.detalhe ? JSON.stringify(r.detalhe) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
