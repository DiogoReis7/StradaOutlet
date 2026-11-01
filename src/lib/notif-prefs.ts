export type NotifPrefs = {
  /** Alerta de detratores acima do limite */
  detratores: boolean;
  /** Usar notificações do sistema (além dos avisos dentro da app) */
  sistema: boolean;
};

export const NOTIF_DEFAULTS: NotifPrefs = {
  detratores: true,
  sistema: true,
};

function key(userId: string | null) {
  return userId ? `ls-notif-${userId}` : "ls-notif-shared";
}

export function readNotifPrefs(userId: string | null): NotifPrefs {
  if (typeof window === "undefined") return NOTIF_DEFAULTS;
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return NOTIF_DEFAULTS;
    return { ...NOTIF_DEFAULTS, ...(JSON.parse(raw) as Partial<NotifPrefs>) };
  } catch {
    return NOTIF_DEFAULTS;
  }
}

export function writeNotifPrefs(userId: string | null, prefs: NotifPrefs) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(userId), JSON.stringify(prefs));
  } catch {
    /* noop */
  }
}
