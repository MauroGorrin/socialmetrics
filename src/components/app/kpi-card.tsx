import { MetricDelta } from '@/components/app/metric-delta';
import { formatMetric, METRIC_CHART_COLOR, METRIC_LABELS, type MetricKey } from '@/lib/metrics';

/** A single headline metric: colour dot, value for the month, and the change. */
export function KpiCard({
  metricKey,
  value,
  previous,
  featured = false,
}: {
  metricKey: MetricKey;
  value: number;
  previous: number;
  /** The one or two metrics that matter most for this profile — larger card, accent border. */
  featured?: boolean;
}) {
  return (
    <div
      className={
        featured
          ? 'rounded-lg border-2 border-[var(--primary)] bg-[var(--surface)] p-5'
          : 'rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4'
      }
    >
      <div className="flex items-center gap-1.5">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: METRIC_CHART_COLOR[metricKey] }}
        />
        <span className="text-[11px] uppercase tracking-wide text-[var(--fg-muted)]">
          {METRIC_LABELS[metricKey]}
        </span>
      </div>
      <p
        className={`mt-1.5 font-bold text-[var(--fg)] ${featured ? 'text-3xl' : 'text-2xl'}`}
      >
        {formatMetric(metricKey, value)}
      </p>
      <div className="mt-1">
        <MetricDelta metricKey={metricKey} current={value} previous={previous} />
      </div>
    </div>
  );
}
