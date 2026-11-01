/**
 * Gestor de loja: não conta para atendimento, ociosidade, telemarketing nem PDS.
 * Continua a existir como colaborador (avisos, reuniões, admin).
 */
const MANAGER_USERNAMES = new Set(["bmemartins"]);
const MANAGER_NAMES = new Set(["bruno martins"]);

function norm(v: string | null | undefined) {
  return (v ?? "")
    .toLocaleLowerCase("pt-PT")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

export function isManagerEmployee(
  e: { nome?: string | null; username_sgf?: string | null; nome_sgf?: string | null } | null | undefined,
) {
  if (!e) return false;
  if (MANAGER_USERNAMES.has(norm(e.username_sgf))) return true;
  if (MANAGER_NAMES.has(norm(e.nome))) return true;
  if (MANAGER_NAMES.has(norm(e.nome_sgf))) return true;
  return false;
}

/** Remove o gestor de loja de listas operacionais. */
export function withoutManagers<T extends { nome?: string | null; username_sgf?: string | null; nome_sgf?: string | null }>(
  list: T[],
): T[] {
  return list.filter((e) => !isManagerEmployee(e));
}
