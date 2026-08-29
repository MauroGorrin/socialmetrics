import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { generateReportAction } from '@/app/[orgSlug]/reports/actions';
import { ClientOverviewCard } from '@/components/app/client-overview-card';
import { ComparisonBarChart } from '@/components/app/comparison-bar-chart';
import { DashboardControls } from '@/components/app/dashboard-controls';
import { HeadlineKpis } from '@/components/app/headline-kpis';
import { MultiTrendChart, TrendChart } from '@/components/app/trend-chart';
import { getCurrentUser } from '@/lib/auth';
import {
  addKpis,
  addOrganicKpis,
  aggregateKpis,
  aggregateOrganicKpis,
  currentMonth,
  emptyKpis,
  type Kpis,
  METRIC_LABELS,
  type MetricKey,
  metricSeries,
  monthLabel,
  monthsEndingAt,
  type ReportProfile,
  shortMonthLabel,
} from '@/lib/metrics';
import { getAccessibleOrg } from '@/server/queries/orgs';
import {
  clientMonthlySeries,
  clientOrganicMonthlySeries,
  listReports,
} from '@/server/queries/reports';

const GHOST_BTN =
  'rounded border border-[var(--border)] px-4 py-2 text-sm text-[var(--fg)] transition-opacity duration-150 hover:opacity-70';
const PRIMARY_BTN =
  'rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90';

const METRICS: Record<ReportProfile, { kpi: MetricKey[]; chart: MetricKey[]; card: MetricKey[]; spark: MetricKey }> = {
  ads: {
    kpi: ['impressions', 'clicks', 'ctr', 'spend', 'conversions', 'roas'],
    chart: ['impressions', 'clicks', 'spend', 'roas'],
    card: ['impressions', 'spend', 'ctr', 'roas'],
    spark: 'impressions',
  },
  organic: {
    kpi: ['followers_end', 'follower_growth', 'follower_growth_rate', 'reach', 'interactions', 'engagement_rate'],
    chart: ['followers_end', 'reach', 'interactions', 'engagement_rate'],
    card: ['followers_end', 'follower_growth', 'engagement_rate', 'reach'],
    spark: 'followers_end',
  },
  mixed: { kpi: [], chart: [], card: [], spark: 'impressions' },
};

/** The one or two metrics that matter most for each profile — featured on the panel. */
const HERO: Record<'ads' | 'organic', MetricKey[]> = {
  ads: ['roas', 'conversions'],
  organic: ['follower_growth', 'engagement_rate'],
};

const REPORT_STATUS: Record<string, string> = {
  draft: 'Borrador',
  generated: 'Generado',
  shared: 'Compartido',
  sent: 'Enviado',
};

const PERIOD_LABEL: Record<number, string> = {
  1: 'el mes',
  3: 'el trimestre',
  6: 'los últimos 6 meses',
  12: 'los últimos 12 meses',
};

function hasDataFor(profile: 'ads' | 'organic', kpis: Kpis): boolean {
  return profile === 'organic'
    ? kpis.followers_end + kpis.reach + kpis.interactions + kpis.impressions > 0
    : kpis.impressions + kpis.clicks + kpis.spend + kpis.conversions + kpis.conversion_value > 0;
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string };
  searchParams: { month?: string; period?: string; client?: string; profile?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/signin?redirect=/${params.orgSlug}/dashboard`);

  const access = await getAccessibleOrg(params.orgSlug, user.id);
  if (!access) notFound();

  const orgId = access.org.id;
  const month =
    typeof searchParams.month === 'string' && /^\d{4}-\d{2}$/.test(searchParams.month)
      ? searchParams.month
      : currentMonth();
  const period = [1, 3, 6, 12].includes(Number(searchParams.period))
    ? Number(searchParams.period)
    : 6;
  const clientFilter = typeof searchParams.client === 'string' ? searchParams.client : '';
  const profile: 'ads' | 'organic' = searchParams.profile === 'organic' ? 'organic' : 'ads';
  const canGenerate = access.role === 'owner' || access.role === 'admin';

  const fetchMonths = monthsEndingAt(month, Math.max(period * 2, 6));
  const trendMonths = monthsEndingAt(month, Math.max(period, 6));
  const doubleWindow = monthsEndingAt(month, period * 2);
  const prevWindow = doubleWindow.slice(0, period);
  const windowMonths = doubleWindow.slice(period);

  const [adsSeries, organicSeries, monthReports] = await Promise.all([
    clientMonthlySeries(orgId, fetchMonths),
    clientOrganicMonthlySeries(orgId, fetchMonths),
    listReports(orgId, { month }),
  ]);

  const showProfileToggle = adsSeries.length > 0 && organicSeries.length > 0;
  const allClients = profile === 'organic' ? organicSeries : adsSeries;
  const anyClients = adsSeries.length + organicSeries.length > 0;

  const m = METRICS[profile];
  const addFn = profile === 'organic' ? addOrganicKpis : addKpis;
  const aggFn = profile === 'organic' ? aggregateOrganicKpis : aggregateKpis;

  const report = clientFilter
    ? (monthReports.find((r) => r.clientId === clientFilter) ?? null)
    : null;

  const clients = clientFilter
    ? allClients.filter((c) => c.clientId === clientFilter)
    : allClients;
  const activeClientName =
    clientFilter && clients[0] ? clients[0].clientName : 'Todos los clientes';
  const singleClient = clients.length === 1;

  // Combined (or single-client) figures per month, then windowed.
  const byMonth: Record<string, Kpis> = {};
  for (const key of fetchMonths) {
    byMonth[key] = clients.reduce((acc, cs) => addFn(acc, cs.byMonth[key]), emptyKpis());
  }
  const totals = aggFn(byMonth, windowMonths);
  const prevTotals = aggFn(byMonth, prevWindow);
  const showComparison = !clientFilter && clients.length > 1;

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--fg)]">Panel</h1>
          <p className="text-sm text-[var(--fg-muted)]">
            {activeClientName} · {PERIOD_LABEL[period]} · hasta {monthLabel(month)}
          </p>
        </div>
        <DashboardControls
          clients={allClients.map((c) => ({ id: c.clientId, name: c.clientName }))}
          client={clientFilter}
          period={period}
          month={month}
          profile={profile}
          showProfileToggle={showProfileToggle}
        />
      </div>

      {!anyClients ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-10 text-center">
          <p className="text-sm text-[var(--fg-muted)]">
            Todavía no tienes clientes. Agrega el primero para empezar a cargar métricas y generar
            reportes.
          </p>
          <Link href={`/${params.orgSlug}/clients`} className={`${PRIMARY_BTN} mt-4 inline-block`}>
            Agregar cliente
          </Link>
        </div>
      ) : allClients.length === 0 ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--fg-muted)]">
          No tienes clientes de tipo {profile === 'organic' ? 'orgánico' : 'ads'}.
        </p>
      ) : (
        <>
          {/* Report of the month — per selected client */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
            <div className="text-sm">
              <span className="font-medium text-[var(--fg)]">
                Reporte de {monthLabel(month)}
                {clientFilter ? ` · ${activeClientName}` : ''}
              </span>
              <span className="ml-2 text-[var(--fg-muted)]">
                {clientFilter
                  ? report
                    ? (REPORT_STATUS[report.status] ?? report.status)
                    : 'Sin generar'
                  : `${monthReports.length} este mes`}
              </span>
            </div>
            <div className="flex gap-2">
              {clientFilter && report ? (
                <Link href={`/${params.orgSlug}/reports/${report.id}`} className={GHOST_BTN}>
                  Ver reporte
                </Link>
              ) : null}
              {canGenerate && clientFilter ? (
                <form action={generateReportAction}>
                  <input type="hidden" name="orgSlug" value={params.orgSlug} />
                  <input type="hidden" name="periodMonth" value={month} />
                  <input type="hidden" name="clientId" value={clientFilter} />
                  <button type="submit" className={report ? GHOST_BTN : PRIMARY_BTN}>
                    {report ? 'Regenerar' : 'Generar reporte'}
                  </button>
                </form>
              ) : (
                <Link href={`/${params.orgSlug}/reports`} className={GHOST_BTN}>
                  Ver reportes
                </Link>
              )}
            </div>
          </div>

          {/* Headline KPIs for the window */}
          <HeadlineKpis metricKeys={m.kpi} heroKeys={HERO[profile]} totals={totals} previous={prevTotals} />

          {/* Client comparison */}
          {showComparison ? (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
                Comparativa entre clientes · {PERIOD_LABEL[period]}
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {m.chart.map((key) => (
                  <div
                    key={key}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
                  >
                    <p className="mb-2 text-sm font-medium text-[var(--fg)]">{METRIC_LABELS[key]}</p>
                    <ComparisonBarChart
                      metricKey={key}
                      data={clients.map((cs) => ({
                        name: cs.clientName,
                        value: aggFn(cs.byMonth, windowMonths)[key],
                      }))}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Trends */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
              Tendencia · últimos {trendMonths.length} meses
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {m.chart.map((key) => (
                <div
                  key={key}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
                >
                  <p className="mb-2 text-sm font-medium text-[var(--fg)]">{METRIC_LABELS[key]}</p>
                  {clientFilter || singleClient ? (
                    <TrendChart
                      data={metricSeries(byMonth, trendMonths, key)}
                      metricKey={key}
                      height={150}
                    />
                  ) : (
                    <MultiTrendChart
                      metricKey={key}
                      labels={trendMonths.map(shortMonthLabel)}
                      series={clients.map((cs) => ({
                        name: cs.clientName,
                        values: trendMonths.map((mk) => cs.byMonth[mk]?.[key] ?? 0),
                      }))}
                      height={180}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Per client (only in the "all clients" view) */}
          {clientFilter ? (
            <Link
              href={`/${params.orgSlug}/clients/${clientFilter}`}
              className="inline-block text-sm text-[var(--fg)] underline"
            >
              Ver detalle de {activeClientName} →
            </Link>
          ) : (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
                Por cliente
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {clients.map((cs) => {
                  const cardKpis = aggFn(cs.byMonth, windowMonths);
                  return (
                    <ClientOverviewCard
                      key={cs.clientId}
                      orgSlug={params.orgSlug}
                      month={month}
                      client={{ id: cs.clientId, name: cs.clientName, platform: cs.clientPlatform }}
                      kpis={cardKpis}
                      previous={aggFn(cs.byMonth, prevWindow)}
                      cardMetrics={m.card}
                      sparklineMetric={m.spark}
                      series={metricSeries(cs.byMonth, trendMonths, m.spark)}
                      hasData={hasDataFor(profile, cardKpis)}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
