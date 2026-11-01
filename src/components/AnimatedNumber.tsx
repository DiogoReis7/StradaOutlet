import { useEffect, useRef, useState } from "react";

export function AnimatedNumber({
  value,
  formatter = (n) => n.toLocaleString("pt-PT", { maximumFractionDigits: 2 }),
  duration = 650,
  className,
}: {
  value: number;
  formatter?: (value: number) => string;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === value) return;

    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (value - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, value]);

  return <span className={className}>{formatter(display)}</span>;
}
