import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { generateReportAction } from '@/app/[orgSlug]/reports/actions';
import { ClientOverviewCard } from '@/components/app/client-overview-card';
import { KpiCard } from '@/components/app/kpi-card';
import { RangePicker } from '@/components/app/range-picker';
import { TrendChart } from '@/components/app/trend-chart';
import { getCurrentUser } from '@/lib/auth';
import {
  addKpis,
  currentMonth,
  emptyKpis,
  type Kpis,
  METRIC_LABELS,
  type MetricKey,
  metricSeries,
  monthLabel,
  monthsEndingAt,
  previousMonth,
} from '@/lib/metrics';
import { getAccessibleOrg } from '@/server/queries/orgs';
import { clientMonthlySeries, listReports } from '@/server/queries/reports';

const CONTROL =
  'rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--fg)]';
const GHOST_BTN =
  'rounded border border-[var(--border)] px-4 py-2 text-sm text-[var(--fg)] transition-opacity duration-150 hover:opacity-70';
const PRIMARY_BTN =
  'rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90';

const KPI_METRICS: MetricKey[] = ['impressions', 'clicks', 'ctr', 'spend', 'conversions', 'roas'];
const CHART_METRICS: MetricKey[] = ['impressions', 'clicks', 'spend', 'ctr', 'conversions', 'roas'];

const REPORT_STATUS: Record<string, string> = {
  draft: 'Borrador',
  generated: 'Generado',
  shared: 'Compartido',
  sent: 'Enviado',
};

function hasData(kpis: Kpis): boolean {
  return kpis.impressions + kpis.clicks + kpis.spend + kpis.conversions + kpis.conversion_value > 0;
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string };
  searchParams: { month?: string; range?: string };
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
  const range = searchParams.range === '12' ? 12 : 6;
  const prevMonth = previousMonth(month);
  const months = monthsEndingAt(month, range);
  const canGenerate = access.role === 'owner' || access.role === 'admin';

  const [clientSeries, monthReports] = await Promise.all([
    clientMonthlySeries(orgId, months),
    listReports(orgId, { month }),
  ]);
  const report = monthReports[0] ?? null;

  const orgByMonth: Record<string, Kpis> = {};
  for (const m of months) {
    orgByMonth[m] = clientSeries.reduce((acc, cs) => addKpis(acc, cs.byMonth[m]), emptyKpis());
  }
  const totals = orgByMonth[month] ?? emptyKpis();
  const prevTotals = orgByMonth[prevMonth] ?? emptyKpis();
  const multiClient = clientSeries.length > 1;

  return (
    <section className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--fg)]">Panel</h1>
          <p className="text-sm text-[var(--fg-muted)]">{monthLabel(month)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangePicker value={range} />
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="range" value={range} />
            <input type="month" name="month" defaultValue={month} className={CONTROL} />
            <button type="submit" className={GHOST_BTN}>
              Ver
            </button>
          </form>
        </div>
      </div>

      {clientSeries.length === 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-10 text-center">
          <p className="text-sm text-[var(--fg-muted)]">
            Todavía no tienes clientes. Agrega el primero para empezar a cargar métricas y generar
            reportes.
          </p>
          <Link href={`/${params.orgSlug}/clients`} className={`${PRIMARY_BTN} mt-4 inline-block`}>
            Agregar cliente
          </Link>
        </div>
      ) : (
        <>
          {/* Report of the month */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-4">
            <div className="text-sm">
              <span className="font-medium text-[var(--fg)]">Reporte de {monthLabel(month)}</span>
              <span className="ml-2 text-[var(--fg-muted)]">
                {report ? (REPORT_STATUS[report.status] ?? report.status) : 'Sin generar'}
              </span>
            </div>
            <div className="flex gap-2">
              {report ? (
                <Link href={`/${params.orgSlug}/reports/${report.id}`} className={GHOST_BTN}>
                  Ver reporte
                </Link>
              ) : null}
              {canGenerate ? (
                <form action={generateReportAction}>
                  <input type="hidden" name="orgSlug" value={params.orgSlug} />
                  <input type="hidden" name="periodMonth" value={month} />
                  <button type="submit" className={report ? GHOST_BTN : PRIMARY_BTN}>
                    {report ? 'Regenerar' : 'Generar reporte'}
                  </button>
                </form>
              ) : null}
            </div>
          </div>

          {/* Headline KPIs for the month */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {KPI_METRICS.map((key) => (
              <KpiCard
                key={key}
                metricKey={key}
                value={totals[key]}
                previous={prevTotals[key]}
              />
            ))}
          </div>

          {/* Trend charts over the selected window */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
              Tendencia · últimos {range} meses
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {CHART_METRICS.map((key) => (
                <div
                  key={key}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
                >
                  <p className="mb-2 text-sm font-medium text-[var(--fg)]">{METRIC_LABELS[key]}</p>
                  <TrendChart data={metricSeries(orgByMonth, months, key)} metricKey={key} />
                </div>
              ))}
            </div>
          </div>

          {/* Per client */}
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
              Por cliente
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {clientSeries.map((cs) => (
                <ClientOverviewCard
                  key={cs.clientId}
                  orgSlug={params.orgSlug}
                  month={month}
                  client={{ id: cs.clientId, name: cs.clientName, platform: cs.clientPlatform }}
                  kpis={cs.byMonth[month] ?? emptyKpis()}
                  previous={cs.byMonth[prevMonth] ?? emptyKpis()}
                  series={metricSeries(cs.byMonth, months, 'impressions')}
                  hasData={hasData(cs.byMonth[month] ?? emptyKpis())}
                />
              ))}
            </div>
          </div>

          {multiClient ? (
            <p className="text-sm text-[var(--fg-muted)]">
              ¿Cargar el mes de varios clientes de una?{' '}
              <Link href={`/${params.orgSlug}/metrics`} className="text-[var(--fg)] underline">
                Ir a Métricas
              </Link>
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
