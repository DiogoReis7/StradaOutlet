import { useEffect, useState } from "react";
import { Palette, Check, Pin, PinOff, Sun, Moon, Monitor } from "lucide-react";
import { THEMES, type ThemeId } from "@/lib/theme";
import { useUserPrefs } from "@/hooks/use-user-prefs";
import { useAppearance } from "@/hooks/use-appearance";
import type { ColorMode } from "@/lib/appearance";

/** Aplica, uma vez, o tema predefinido do utilizador (guardado na conta)
 *  à aparência atual — assim o "pin" sincroniza entre dispositivos. */
export function useThemeBoot(userId?: string | null) {
  const { prefs } = useUserPrefs(userId ?? null);
  const { setDarkTheme } = useAppearance();
  useEffect(() => {
    if (prefs.defaultTheme) setDarkTheme(prefs.defaultTheme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, prefs.defaultTheme]);
}

const MODES: { id: ColorMode; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Claro", icon: Sun },
  { id: "dark", label: "Escuro", icon: Moon },
  { id: "system", label: "Sistema", icon: Monitor },
];

/** Controlo único: cor do tema + modo claro/escuro/sistema. Substitui os
 *  2 botões separados que existiam antes (tema vs. claro/escuro), que por
 *  vezes se anulavam um ao outro. */
export function ThemeSwitcher({ compact = false, userId }: { compact?: boolean; userId?: string | null }) {
  const [open, setOpen] = useState(false);
  const { appearance, setMode, setDarkTheme } = useAppearance();
  const { prefs, setDefaultTheme } = useUserPrefs(userId ?? null);

  function pick(id: ThemeId) {
    setDarkTheme(id);
  }

  function saveAsDefault(id: ThemeId) {
    setDefaultTheme(id);
    setDarkTheme(id);
  }

  const isDefault = (id: ThemeId) => prefs.defaultTheme === id;
  const swatchThemes = THEMES.filter((t) => t.id !== "light");

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border bg-background/60 px-2 py-1.5 text-xs hover:bg-accent"
        aria-label="Aparência"
        title="Aparência"
      >
        <Palette className="h-4 w-4" />
        {!compact && <span className="truncate">Aparência</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 bottom-full mb-2 z-50 w-64 rounded-lg border bg-popover p-1.5 shadow-xl">
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Modo</div>
            <div className="mb-1 flex gap-1 px-1">
              {MODES.map((m) => {
                const Icon = m.icon;
                const active = appearance.mode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[10px] font-semibold ${active ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground"}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {m.label}
                  </button>
                );
              })}
            </div>
            <div className="my-1 border-t" />
            <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Cor do tema</div>
            {swatchThemes.map((t) => (
              <div key={t.id} className="flex items-center gap-1">
                <button
                  onClick={() => pick(t.id)}
                  className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                >
                  <div className="flex h-5 w-5 shrink-0 overflow-hidden rounded">
                    {t.swatch.map((c, i) => (
                      <div key={i} className="flex-1" style={{ background: c }} />
                    ))}
                  </div>
                  <span className="flex-1 truncate">
                    {t.label}
                    {t.lightCompatible && <span className="ml-1 text-[9px] text-muted-foreground">(claro + escuro)</span>}
                  </span>
                  {appearance.darkTheme === t.id && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
                <button
                  onClick={() => saveAsDefault(t.id)}
                  className={`rounded-md p-1.5 ${isDefault(t.id) ? "text-[var(--neon-yellow)]" : "text-muted-foreground hover:text-foreground"}`}
                  title={isDefault(t.id) ? "Tema predefinido" : "Definir como predefinido"}
                >
                  {isDefault(t.id) ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
