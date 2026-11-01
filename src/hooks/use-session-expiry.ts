import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const REMEMBER_KEY = "auth:remember";
const LAST_ACTIVE_KEY = "auth:last-active";

/** 30 dias com "manter-me conectado", 8 horas de inatividade sem. */
export const REMEMBER_MAX_MS = 30 * 24 * 60 * 60 * 1000;
export const IDLE_MAX_MS = 8 * 60 * 60 * 1000;

export function setRememberMe(remember: boolean) {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
    localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  } catch { /* ignore */ }
}

export function getRememberMe(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch {
    return true;
  }
}

export function touchSession() {
  try { localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())); } catch { /* ignore */ }
}

function isExpired(): boolean {
  try {
    const last = Number(localStorage.getItem(LAST_ACTIVE_KEY) ?? 0);
    if (!last) return false;
    const limit = getRememberMe() ? REMEMBER_MAX_MS : IDLE_MAX_MS;
    return Date.now() - last > limit;
  } catch {
    return false;
  }
}

/** Mantém a sessão viva enquanto há atividade e termina-a quando expira. */
export function useSessionExpiry(onExpire: () => void) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let lastWrite = 0;
    const activity = () => {
      const now = Date.now();
      if (now - lastWrite < 30_000) return;
      lastWrite = now;
      touchSession();
    };

    const check = async () => {
      if (!isExpired()) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      await supabase.auth.signOut();
      onExpire();
    };

    const events = ["pointerdown", "keydown", "focus"] as const;
    events.forEach((e) => window.addEventListener(e, activity, { passive: true }));
    activity();
    void check();
    const id = window.setInterval(() => { void check(); }, 60_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, activity));
      window.clearInterval(id);
    };
  }, [onExpire]);
}
