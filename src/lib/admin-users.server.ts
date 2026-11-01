// Server-only helpers for admin user management.
import type { SupabaseClient } from "@supabase/supabase-js";

export const USER_EMAIL_DOMAIN = "stradaoutlet.local";

export function usernameToEmail(username: string): string {
  const v = username.trim().toLowerCase();
  if (!v) throw new Error("Utilizador inválido");
  if (v.includes("@")) return v;
  if (!/^[a-z0-9._-]+$/.test(v)) throw new Error("Utilizador só pode ter letras, números, . _ -");
  return `${v}@${USER_EMAIL_DOMAIN}`;
}

export function emailToUsername(email: string | undefined | null): string {
  if (!email) return "";
  return email.split("@")[0] ?? "";
}

export async function assertAdmin(supabase: SupabaseClient<any>, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error("Não foi possível validar permissões");
  if (!data) throw new Error("Sem permissões de administrador");
}

export type AdminUser = {
  id: string;
  email: string;
  username: string;
  disabled: boolean;
  lastSignInAt: string | null;
  createdAt: string;
  isAdmin: boolean;
};

export async function listAuthUsers(): Promise<AdminUser[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id,role").eq("role", "admin");
  const admins = new Set((roles ?? []).map((r: { user_id: string }) => r.user_id));
  const out: AdminUser[] = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    for (const u of data.users) {
      const bannedUntil = (u as unknown as { banned_until?: string | null }).banned_until ?? null;
      out.push({
        id: u.id,
        email: u.email ?? "",
        username: emailToUsername(u.email),
        disabled: !!bannedUntil && new Date(bannedUntil).getTime() > Date.now(),
        lastSignInAt: u.last_sign_in_at ?? null,
        createdAt: u.created_at,
        isAdmin: admins.has(u.id),
      });
    }
    if (data.users.length < 200) break;
  }
  out.sort((a, b) => a.username.localeCompare(b.username));
  return out;
}
