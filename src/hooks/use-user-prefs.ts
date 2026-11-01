import { useEffect, useState, useCallback } from "react";
import type { ThemeId } from "@/lib/theme";

export type WeekBlockId = "pts" | "tma" | "idle" | "det";

export const WEEK_BLOCKS: { id: WeekBlockId; label: string }[] = [
  { id: "pts", label: "Pontos" },
  { id: "tma", label: "TMA (atendimento)" },
  { id: "idle", label: "Ociosidade média" },
  { id: "det", label: "Detratores" },
];

export type HomeCardId = "hoje" | "destaques";

export const HOME_CARDS: { id: HomeCardId; label: string; hint: string }[] = [
  { id: "hoje", label: "Resumo de hoje", hint: "Vendas, senhas e pontos do dia." },
  { id: "destaques", label: "Destaques", hint: "Melhores do dia, NPS e alertas." },
];

export type UserPrefs = {
  pinnedShortcuts: string[];
  defaultTheme?: ThemeId;
  weekBlocks: WeekBlockId[];
  weekTopN: number;
  weekShowBottom: boolean;
  homeCards: HomeCardId[];
};

const DEFAULTS: UserPrefs = {
  pinnedShortcuts: ["/pds", "/individual", "/nps"],
  weekBlocks: ["pts", "tma", "idle", "det"],
  weekTopN: 3,
  weekShowBottom: true,
  homeCards: ["hoje", "destaques"],
};

function key(userId: string | null) {
  return userId ? `ls-prefs-${userId}` : "ls-prefs-shared";
}

function read(userId: string | null): UserPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(key(userId));
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<UserPrefs>;
    return {
      pinnedShortcuts: parsed.pinnedShortcuts ?? DEFAULTS.pinnedShortcuts,
      defaultTheme: parsed.defaultTheme,
      weekBlocks: parsed.weekBlocks?.length ? parsed.weekBlocks : DEFAULTS.weekBlocks,
      weekTopN: parsed.weekTopN ?? DEFAULTS.weekTopN,
      weekShowBottom: parsed.weekShowBottom ?? DEFAULTS.weekShowBottom,
      homeCards: parsed.homeCards ?? DEFAULTS.homeCards,
    };
  } catch {
    return DEFAULTS;
  }
}

export function write(userId: string | null, prefs: UserPrefs, sync = true) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(userId), JSON.stringify(prefs));
  } catch {}
  if (sync && userId) void import("@/lib/settings-sync").then((m) => m.pushPrefs(prefs));
}

export const readPrefs = read;

export function useUserPrefs(userId: string | null) {
  const [prefs, setPrefs] = useState<UserPrefs>(() => read(userId));

  useEffect(() => {
    setPrefs(read(userId));
    const sync = () => setPrefs(read(userId));
    window.addEventListener("ls-prefs-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("ls-prefs-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, [userId]);

  const set = useCallback(
    (updater: (p: UserPrefs) => UserPrefs) => {
      setPrefs((prev) => {
        const next = updater(prev);
        write(userId, next);
        return next;
      });
    },
    [userId]
  );

  const togglePin = useCallback(
    (to: string) => {
      set((prev) => {
        const set = new Set(prev.pinnedShortcuts);
        if (set.has(to)) set.delete(to);
        else set.add(to);
        return { ...prev, pinnedShortcuts: Array.from(set) };
      });
    },
    [set]
  );

  const setDefaultTheme = useCallback(
    (theme: ThemeId | undefined) => {
      set((prev) => ({ ...prev, defaultTheme: theme }));
    },
    [set]
  );

  const toggleWeekBlock = useCallback(
    (id: WeekBlockId) => {
      set((prev) => {
        const has = prev.weekBlocks.includes(id);
        const next = has ? prev.weekBlocks.filter((b) => b !== id) : [...prev.weekBlocks, id];
        return { ...prev, weekBlocks: next };
      });
    },
    [set]
  );

  const setWeekTopN = useCallback((n: number) => set((p) => ({ ...p, weekTopN: n })), [set]);
  const setWeekShowBottom = useCallback((v: boolean) => set((p) => ({ ...p, weekShowBottom: v })), [set]);

  const toggleHomeCard = useCallback(
    (id: HomeCardId) => {
      set((prev) => {
        const has = prev.homeCards.includes(id);
        const next = has ? prev.homeCards.filter((c) => c !== id) : [...prev.homeCards, id];
        return { ...prev, homeCards: next };
      });
    },
    [set]
  );

  return { prefs, togglePin, setDefaultTheme, toggleWeekBlock, setWeekTopN, setWeekShowBottom, toggleHomeCard };
}

export function getStoredDefaultTheme(userId: string | null): ThemeId | undefined {
  return read(userId).defaultTheme;
}
