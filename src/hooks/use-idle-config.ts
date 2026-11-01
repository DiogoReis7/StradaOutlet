import { useCallback, useEffect, useState } from "react";
import { DEFAULT_IDLE_CONFIG, type IdleConfig } from "@/lib/idle";

const KEY = "pds:idle-config";

function read(): IdleConfig {
  if (typeof window === "undefined") return DEFAULT_IDLE_CONFIG;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_IDLE_CONFIG, ...(JSON.parse(raw) as Partial<IdleConfig>) };
  } catch {}
  return DEFAULT_IDLE_CONFIG;
}

/** Limites de cálculo da ociosidade, ajustáveis e guardados no dispositivo. */
export function useIdleConfig() {
  const [config, setConfig] = useState<IdleConfig>(DEFAULT_IDLE_CONFIG);

  useEffect(() => {
    setConfig(read());
  }, []);

  const update = useCallback((patch: Partial<IdleConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(KEY);
    } catch {}
    setConfig(DEFAULT_IDLE_CONFIG);
  }, []);

  return { config, update, reset };
}
