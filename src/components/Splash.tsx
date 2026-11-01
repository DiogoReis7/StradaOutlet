import { useEffect, useState } from "react";
import iconUrl from "../assets/icon-final2.png";

const SPLASH_MS = 1400;

export function Splash() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), SPLASH_MS - 350);
    const t2 = setTimeout(() => setVisible(false), SPLASH_MS);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#0b0f1c] transition-opacity duration-300"
      style={{ opacity: fading ? 0 : 1, pointerEvents: fading ? "none" : "auto" }}
    >
      <div className="relative">
        <div
          className="absolute inset-0 rounded-[28%] blur-2xl"
          style={{
            background:
              "radial-gradient(closest-side, rgba(0,194,255,0.35), rgba(255,122,0,0.18), transparent)",
            animation: "splash-pulse 1.4s ease-in-out infinite",
          }}
        />
        <img
          src={iconUrl}
          alt="Strada Outlet"
          width={120}
          height={120}
          className="relative h-28 w-28 rounded-[26%] shadow-2xl"
          style={{ animation: "splash-pop 0.6s cubic-bezier(0.2, 1.4, 0.4, 1) both" }}
        />
      </div>
      <p
        className="mt-6 text-[13px] font-semibold uppercase tracking-[0.5em] text-[#00c2ff]"
        style={{ textShadow: "0 0 14px rgba(0,194,255,0.9)" }}
      >
        Strada Outlet
      </p>
      <style>{`
        @keyframes splash-pop {
          from { transform: scale(0.6); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes splash-pulse {
          0%, 100% { opacity: 0.7; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.12); }
        }
      `}</style>
    </div>
  );
}
