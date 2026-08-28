import { changeIsGood, type MetricKey, pctChange } from '@/lib/metrics';

/**
 * The month-over-month change for a metric: `▲ 18%` in green / red / grey,
 * with the colour keyed to whether the move is a good result for that metric
 * (a lower CPL is good; spend is neutral).
 */
export function MetricDelta({
  metricKey,
  current,
  previous,
}: {
  metricKey: MetricKey;
  current: number;
  previous: number;
}) {
  const pct = pctChange(current, previous);
  if (pct === null) {
    return <span className="text-xs font-medium text-[var(--fg-muted)]">nuevo</span>;
  }
  const rounded = Math.round(pct);
  if (rounded === 0) {
    return <span className="text-xs font-medium text-[var(--fg-muted)]">sin cambios</span>;
  }
  const good = changeIsGood(metricKey, current, previous);
  const color =
    good === null
      ? 'text-[var(--fg-muted)]'
      : good
        ? 'text-[var(--success)]'
        : 'text-[var(--destructive)]';
  return (
    <span className={`text-xs font-semibold ${color}`}>
      {rounded > 0 ? '▲' : '▼'} {Math.abs(rounded)}%
    </span>
  );
}
