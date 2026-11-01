import { useEffect } from "react";
import { applyAppearance, readAppearance, writeAppearance, type Appearance } from "@/lib/appearance";
import { readPrefs, write as writePrefs, type UserPrefs } from "@/hooks/use-user-prefs";
import { APPEARANCE_EVENT, PREFS_EVENT, pullSettings, setSyncUser } from "@/lib/settings-sync";

/**
 * Liga as preferências de aparência e do painel à conta:
 * ao entrar, traz o que está guardado na conta; depois cada alteração é enviada.
 */
export function useSettingsSync(userId: string | null | undefined) {
  useEffect(() => {
    const uid = userId ?? null;
    setSyncUser(uid);
    if (!uid) return;
    let cancelled = false;

    (async () => {
      const remote = await pullSettings(uid);
      if (cancelled || !remote) {
        // Primeira vez nesta conta: guarda o que existe no dispositivo.
        if (!cancelled) {
          writeAppearance(readAppearance());
          writePrefs(uid, readPrefs(uid));
        }
        return;
      }
      const ap = remote.appearance as Partial<Appearance> | null;
      if (ap && Object.keys(ap).length > 0) {
        const merged = { ...readAppearance(), ...ap } as Appearance;
        writeAppearance(merged, false);
        applyAppearance(merged);
        window.dispatchEvent(new Event(APPEARANCE_EVENT));
      }
      const pf = remote.prefs as Partial<UserPrefs> | null;
      if (pf && Object.keys(pf).length > 0) {
        writePrefs(uid, { ...readPrefs(uid), ...pf } as UserPrefs, false);
        window.dispatchEvent(new Event(PREFS_EVENT));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);
}
