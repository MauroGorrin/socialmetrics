import Link from 'next/link';
import { MetricDelta } from '@/components/app/metric-delta';
import { Sparkline, type TrendPoint } from '@/components/app/trend-chart';
import { formatMetric, type Kpis, type MetricKey } from '@/lib/metrics';

const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta',
  google_ads: 'Google Ads',
  tiktok: 'TikTok',
  instagram: 'Instagram',
};

/** The four headline metrics on a client card. */
const CARD_METRICS: MetricKey[] = ['impressions', 'spend', 'ctr', 'roas'];
const SHORT_LABELS: Record<string, string> = {
  impressions: 'Impresiones',
  spend: 'Inversión',
  ctr: 'CTR',
  roas: 'ROAS',
};

type Props = {
  orgSlug: string;
  month: string;
  client: { id: string; name: string; platform: string };
  kpis: Kpis;
  previous: Kpis;
  hasData: boolean;
  /** Impressions across the dashboard's window, for the card sparkline. */
  series?: TrendPoint[];
};

/** One client's month at a glance: headline KPIs with deltas + next actions. */
export function ClientOverviewCard({
  orgSlug,
  month,
  client,
  kpis,
  previous,
  hasData,
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
            {CARD_METRICS.map((key) => (
              <div key={key}>
                <dt className="text-[11px] uppercase tracking-wide text-[var(--fg-muted)]">
                  {SHORT_LABELS[key]}
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
              <Sparkline data={series} metricKey="impressions" height={36} />
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-4 flex-1 text-sm text-[var(--fg-muted)]">
          Sin datos en este período.
        </p>
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
