import { useEffect, useState } from "react";

const COLORS = ["var(--neon-blue)", "var(--neon-yellow)", "var(--neon-green)", "var(--neon-pink)", "var(--neon-orange)"];

export function Confetti({ active }: { active: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), 1800);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[200] overflow-hidden" aria-hidden="true">
      {Array.from({ length: 34 }, (_, index) => (
        <span
          key={index}
          className="confetti-piece"
          style={{
            left: `${(index * 29) % 100}%`,
            background: COLORS[index % COLORS.length],
            animationDelay: `${(index % 7) * 55}ms`,
            transform: `rotate(${index * 31}deg)`,
          }}
        />
      ))}
    </div>
  );
}
