import { useEffect, useState } from "react";
import { todayParts } from "@/components/MonthDayPicker";

const KEY = "pds:selected-date";

type DateParts = { year: number; month: number; day: number };

function read(): DateParts {
  if (typeof window === "undefined") {
    const t = todayParts();
    return { year: t.year, month: t.month, day: t.day };
  }
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as DateParts;
      if (p && p.year && p.month && p.day) return p;
    }
  } catch {}
  const t = todayParts();
  return { year: t.year, month: t.month, day: t.day };
}

/** Shared selected date across PDS / Individual. Persisted in localStorage. */
export function useSharedDate(): [DateParts, (next: DateParts) => void] {
  const [date, setDate] = useState<DateParts>(read);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === KEY && e.newValue) {
        try {
          setDate(JSON.parse(e.newValue));
        } catch {}
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function update(next: DateParts) {
    setDate(next);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }

  return [date, update];
}
