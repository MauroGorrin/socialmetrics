import Link from 'next/link';
import { MetricDelta } from '@/components/app/metric-delta';
import { Sparkline, type TrendPoint } from '@/components/app/trend-chart';
import { PLATFORM_LABELS } from '@/lib/client-profile';
import { formatMetric, type Kpis, METRIC_LABELS, type MetricKey } from '@/lib/metrics';

type Props = {
  orgSlug: string;
  month: string;
  client: { id: string; name: string; platform: string };
  kpis: Kpis;
  previous: Kpis;
  hasData: boolean;
  /** The four headline metrics to show — ads or organic, from the page. */
  cardMetrics: MetricKey[];
  /** The metric the card sparkline plots, over the dashboard's window. */
  sparklineMetric: MetricKey;
  series?: TrendPoint[];
};

/** One client's period at a glance: headline KPIs with deltas + next actions. */
export function ClientOverviewCard({
  orgSlug,
  month,
  client,
  kpis,
  previous,
  hasData,
  cardMetrics,
  sparklineMetric,
  series,
}: Props) {
  const detailHref = `/${orgSlug}/clients/${client.id}`;
  const loadHref = `/${orgSlug}/metrics?client=${client.id}&month=${month}`;

  return (
    <article className="flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={detailHref} className="font-semibold text-[var(--fg)] hover:underline">
            {client.name}
          </Link>
          <p className="text-xs text-[var(--fg-muted)]">
            {PLATFORM_LABELS[client.platform] ?? client.platform}
          </p>
        </div>
        <Link href={detailHref} className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]">
          Ver detalle →
        </Link>
      </div>

      {hasData ? (
        <>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
            {cardMetrics.map((key) => (
              <div key={key}>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--fg-muted)]">
                  {METRIC_LABELS[key]}
                </dt>
                <dd className="mt-0.5 flex items-baseline gap-2">
                  <span className="text-lg font-bold text-[var(--fg)]">
                    {formatMetric(key, kpis[key])}
                  </span>
                  <MetricDelta metricKey={key} current={kpis[key]} previous={previous[key]} />
                </dd>
              </div>
            ))}
          </dl>
          {series && series.length > 1 ? (
            <div className="mt-3">
              <Sparkline data={series} metricKey={sparklineMetric} height={36} />
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-4 flex-1 text-sm text-[var(--fg-muted)]">Sin datos en este período.</p>
      )}

      <div className="mt-5 flex gap-2">
        <Link
          href={loadHref}
          className={
            hasData
              ? 'rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg)] transition-opacity duration-150 hover:opacity-70'
              : 'rounded bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90'
          }
        >
          {hasData ? 'Editar datos' : 'Cargar datos'}
        </Link>
      </div>
    </article>
  );
}
