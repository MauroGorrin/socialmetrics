import { changeIsGood, type MetricKey, pctChange } from '@/lib/metrics';

/**
 * The period-over-period change for a metric as a pill badge: `▲ 18%` in a
 * green / red / grey pill, coloured by whether the move is a good result for
 * that metric (a lower CPL is good; spend is neutral). Renders "nuevo" when
 * there is no prior period.
 */

const PILL =
  'inline-flex items-center gap-0.5 rounded-[var(--radius-full)] px-1.5 py-0.5 font-mono text-[11px] font-semibold';
const NEUTRAL = 'bg-[var(--neutral-100)] text-[var(--text-secondary)]';

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
    return <span className={`${PILL} ${NEUTRAL}`}>nuevo</span>;
  }
  const rounded = Math.round(pct);
  if (rounded === 0) {
    return <span className={`${PILL} ${NEUTRAL}`}>sin cambios</span>;
  }
  const good = changeIsGood(metricKey, current, previous);
  const tone =
    good === null
      ? NEUTRAL
      : good
        ? 'bg-[var(--success-50)] text-[var(--success-700)]'
        : 'bg-[var(--error-50)] text-[var(--error-700)]';
  return (
    <span className={`${PILL} ${tone}`}>
      {rounded > 0 ? '▲' : '▼'} {Math.abs(rounded)}%
    </span>
  );
}
