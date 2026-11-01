import { Sun, Moon, MonitorSmartphone, Type, Contrast, Wind, Check } from "lucide-react";
import { useAppearance } from "@/hooks/use-appearance";
import { THEMES, type ThemeId } from "@/lib/theme";
import type { ColorMode, TextScale } from "@/lib/appearance";

const MODES: { id: ColorMode; label: string; icon: typeof Sun }[] = [
  { id: "light", label: "Claro", icon: Sun },
  { id: "dark", label: "Escuro", icon: Moon },
  { id: "system", label: "Sistema", icon: MonitorSmartphone },
];

const SCALES: { id: TextScale; label: string }[] = [
  { id: 100, label: "Normal" },
  { id: 110, label: "Médio" },
  { id: 120, label: "Grande" },
  { id: 130, label: "Máximo" },
];

function Toggle({
  checked, onChange, label, hint, icon: Icon,
}: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string; icon: typeof Sun }) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3">
      <span className="flex min-w-0 gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--neon-blue)]" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold">{label}</span>
          <span className="block text-xs text-muted-foreground">{hint}</span>
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-[var(--neon-blue)]"
        aria-label={label}
      />
    </label>
  );
}

export function AppearanceSettings() {
  const { appearance, setMode, setDarkTheme, setTextScale, setHighContrast, setReduceMotion } = useAppearance();
  const darkThemes = THEMES.filter((t) => t.id !== "light");

  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-card p-3">
        <div className="mb-2 text-sm font-semibold">Modo de cor</div>
        <div className="grid grid-cols-3 gap-2">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = appearance.mode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                aria-pressed={active}
                className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-3 text-xs font-semibold transition ${
                  active ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4" />
                {m.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          &quot;Sistema&quot; segue automaticamente o modo claro/escuro do telemóvel ou computador.
        </p>
      </div>

      {appearance.mode !== "light" && (
        <div className="rounded-lg border bg-card p-3">
          <div className="mb-2 text-sm font-semibold">Tema escuro preferido</div>
          <div className="flex flex-wrap gap-2">
            {darkThemes.map((t) => (
              <button
                key={t.id}
                onClick={() => setDarkTheme(t.id as ThemeId)}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  appearance.darkTheme === t.id ? "border-primary bg-primary/10" : "hover:bg-muted"
                }`}
              >
                <span className="flex h-4 w-8 overflow-hidden rounded">
                  {t.swatch.map((c, i) => (
                    <span key={i} className="flex-1" style={{ background: c }} />
                  ))}
                </span>
                {t.label}
                {appearance.darkTheme === t.id && <Check className="h-3.5 w-3.5 text-primary" />}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Type className="h-4 w-4 text-[var(--neon-blue)]" /> Tamanho do texto
        </div>
        <div className="grid grid-cols-4 gap-2">
          {SCALES.map((s) => (
            <button
              key={s.id}
              onClick={() => setTextScale(s.id)}
              aria-pressed={appearance.textScale === s.id}
              className={`rounded-lg border py-2 text-xs font-semibold transition ${
                appearance.textScale === s.id ? "border-primary bg-primary/10" : "text-muted-foreground hover:bg-muted"
              }`}
              style={{ fontSize: `${10 + (s.id - 100) / 5}px` }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <Toggle
        icon={Contrast}
        checked={appearance.highContrast}
        onChange={setHighContrast}
        label="Alto contraste"
        hint="Texto e limites mais marcados, menos transparências e brilhos."
      />
      <Toggle
        icon={Wind}
        checked={appearance.reduceMotion}
        onChange={setReduceMotion}
        label="Reduzir animações"
        hint="Desliga movimentos e transições para uma leitura mais calma."
      />
    </div>
  );
}

/** Botão rápido claro/escuro para a barra da app. */
export function ColorModeButton({ compact = false }: { compact?: boolean }) {
  const { appearance, toggleMode } = useAppearance();
  const isLight = appearance.mode === "light";
  return (
    <button
      onClick={toggleMode}
      className="flex items-center gap-2 rounded-md border bg-background/60 px-2 py-1.5 text-xs hover:bg-accent focus-neon"
      aria-label={isLight ? "Mudar para modo escuro" : "Mudar para modo claro"}
      title={isLight ? "Modo escuro" : "Modo claro"}
    >
      {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      {!compact && <span className="truncate">{isLight ? "Escuro" : "Claro"}</span>}
    </button>
  );
}
