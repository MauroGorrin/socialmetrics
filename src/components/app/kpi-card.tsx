import { MetricDelta } from '@/components/app/metric-delta';
import { formatMetric, METRIC_CHART_COLOR, METRIC_LABELS, type MetricKey } from '@/lib/metrics';

/** A single headline metric: colour dot, value for the month, and the change. */
export function KpiCard({
  metricKey,
  value,
  previous,
}: {
  metricKey: MetricKey;
  value: number;
  previous: number;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-1.5">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: METRIC_CHART_COLOR[metricKey] }}
        />
        <span className="text-[11px] uppercase tracking-wide text-[var(--fg-muted)]">
          {METRIC_LABELS[metricKey]}
        </span>
      </div>
      <p className="mt-1.5 text-2xl font-bold text-[var(--fg)]">{formatMetric(metricKey, value)}</p>
      <div className="mt-1">
        <MetricDelta metricKey={metricKey} current={value} previous={previous} />
      </div>
    </div>
  );
}
