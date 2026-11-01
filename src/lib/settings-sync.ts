import { supabase } from "@/integrations/supabase/client";
import type { Appearance } from "@/lib/appearance";

/** Sincronização das preferências (aparência + painel) com a conta do utilizador. */

export const PREFS_EVENT = "ls-prefs-change";
export const APPEARANCE_EVENT = "ls-appearance-change";

let currentUserId: string | null = null;
let pending: { appearance?: unknown; prefs?: unknown } = {};
let timer: ReturnType<typeof setTimeout> | null = null;

export function setSyncUser(userId: string | null) {
  currentUserId = userId;
}

async function flush() {
  timer = null;
  const uid = currentUserId;
  const payload = pending;
  pending = {};
  if (!uid || Object.keys(payload).length === 0) return;
  try {
    await supabase.from("user_settings").upsert(
      { user_id: uid, ...payload } as never,
      { onConflict: "user_id" }
    );
  } catch {
    /* offline — fica só no dispositivo */
  }
}

function schedule(patch: { appearance?: unknown; prefs?: unknown }) {
  if (!currentUserId) return;
  pending = { ...pending, ...patch };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flush(), 800);
}

export function pushAppearance(appearance: Appearance) {
  schedule({ appearance });
}

export function pushPrefs(prefs: unknown) {
  schedule({ prefs });
}

export async function pullSettings(userId: string) {
  const { data } = await supabase
    .from("user_settings")
    .select("appearance,prefs")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}
