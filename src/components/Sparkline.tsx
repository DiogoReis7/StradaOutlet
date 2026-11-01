export function Sparkline({
  values,
  color = "var(--neon-blue)",
  label,
}: {
  values: number[];
  color?: string;
  label: string;
}) {
  const safe = values.length > 1 ? values : [values[0] ?? 0, values[0] ?? 0];
  const min = Math.min(...safe);
  const max = Math.max(...safe);
  const range = max - min || 1;
  const points = safe
    .map((value, index) => `${(index / (safe.length - 1)) * 100},${28 - ((value - min) / range) * 22}`)
    .join(" ");

  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label={label} className="h-7 w-full overflow-visible">
      <path d="M 0 29 H 100" stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={100} cy={28 - ((safe[safe.length - 1] - min) / range) * 22} r="2.5" fill={color} />
    </svg>
  );
}
