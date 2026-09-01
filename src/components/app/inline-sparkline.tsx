/**
 * A chrome-free area sparkline for inside a stat card. Server component — pure
 * SVG, no Recharts. Decorative: `aria-hidden`, the value lives in adjacent text.
 * Renders nothing when there is not enough signal to draw (empty or flat).
 */
export function InlineSparkline({
  values,
  width = 150,
  height = 32,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return null;

  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const points = values.map((v, i) => {
    const x = pad + (i * innerW) / (values.length - 1);
    const y = pad + innerH - ((v - min) / (max - min)) * innerH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const line = `M${points.join(' L')}`;
  const baseline = (height - pad).toFixed(1);
  const area = `${line} L${(width - pad).toFixed(1)},${baseline} L${pad.toFixed(1)},${baseline} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="block"
    >
      <path d={area} fill="var(--primary)" fillOpacity={0.12} />
      <path
        d={line}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
