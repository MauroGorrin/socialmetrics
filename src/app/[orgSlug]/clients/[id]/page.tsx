import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { deleteClientAction, updateClientAction } from '@/app/[orgSlug]/clients/actions';
import { ExportCsvButton } from '@/components/app/export-csv-button';
import { MetricDelta } from '@/components/app/metric-delta';
import { MetricToggleChart } from '@/components/app/metric-toggle-chart';
import { StatCard } from '@/components/app/stat-card';
import { getCurrentUser } from '@/lib/auth';
import {
  PLATFORM_LABELS,
  PLATFORM_OPTIONS,
  PROFILE_LABELS,
  REPORT_PROFILES,
} from '@/lib/client-profile';
import { pickChartChips, resolveChartMetric } from '@/lib/dashboard-view';
import {
  currentMonth,
  formatMetric,
  METRIC_LABELS,
  type MetricKey,
  metricSeries,
  monthLabel,
  monthsEndingAt,
  previousMonth,
  type ReportProfile,
} from '@/lib/metrics';
import { getClient } from '@/server/queries/clients';
import { getAccessibleOrg } from '@/server/queries/orgs';
import { organicKpisByMonth, orgKpisByMonth } from '@/server/queries/reports';

const FIELD =
  'rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base text-[var(--fg)] outline-none focus:border-[var(--primary)]';

const METRICS_BY_PROFILE: Record<'ads' | 'organic', { kpi: MetricKey[]; table: MetricKey[] }> = {
  ads: {
    kpi: ['impressions', 'clicks', 'ctr', 'spend', 'conversions', 'roas'],
    table: ['impressions', 'clicks', 'ctr', 'spend', 'cpl', 'roas'],
  },
  organic: {
    kpi: ['followers_end', 'follower_growth', 'follower_growth_rate', 'reach', 'interactions', 'engagement_rate'],
    table: ['followers_end', 'follower_growth', 'reach', 'interactions', 'engagement_rate'],
  },
};
const HISTORY_MONTHS = 12;

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string; id: string };
  searchParams: { saved?: string; error?: string; chart_metric?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/signin?redirect=/${params.orgSlug}/clients/${params.id}`);

  const access = await getAccessibleOrg(params.orgSlug, user.id);
  if (!access) notFound();

  const client = await getClient(access.org.id, params.id);
  if (!client) notFound();

  const profile: 'ads' | 'organic' =
    (client.reportProfile as ReportProfile) === 'organic' ? 'organic' : 'ads';
  const { kpi: KPI_METRICS, table: TABLE_METRICS } = METRICS_BY_PROFILE[profile];

  const month = currentMonth();
  const prevMonth = previousMonth(month);
  const months = monthsEndingAt(month, HISTORY_MONTHS);
  const byMonth =
    profile === 'organic'
      ? await organicKpisByMonth(access.org.id, client.id, months)
      : await orgKpisByMonth(access.org.id, [client.id], months);

  const tableRows = [...months].reverse().map((m) => ({ month: m, kpis: byMonth[m] }));
  const anyData = tableRows.some((r) =>
    profile === 'organic'
      ? r.kpis.followers_end + r.kpis.reach + r.kpis.interactions + r.kpis.impressions > 0
      : r.kpis.impressions + r.kpis.clicks + r.kpis.spend + r.kpis.conversions + r.kpis.conversion_value > 0,
  );

  const csvRows = tableRows.map((r) => ({
    Mes: r.month,
    ...Object.fromEntries(TABLE_METRICS.map((key) => [METRIC_LABELS[key], r.kpis[key]])),
  }));

  const chartChips = pickChartChips(profile);
  const chartMetric = resolveChartMetric(searchParams.chart_metric, profile);
  const cur = (key: MetricKey) => byMonth[month]?.[key] ?? 0;
  const prev = (key: MetricKey) => byMonth[prevMonth]?.[key] ?? 0;

  return (
    <section className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link
          href={`/${params.orgSlug}/clients`}
          className="text-sm text-[var(--text-secondary)] hover:text-[var(--fg)]"
        >
          ← Volver a clientes
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--fg)]">{client.name}</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              {PLATFORM_LABELS[client.platform] ?? client.platform} ·{' '}
              {PROFILE_LABELS[client.reportProfile as keyof typeof PROFILE_LABELS] ??
                client.reportProfile}
            </p>
          </div>
          <Link
            href={`/${params.orgSlug}/metrics?client=${client.id}&month=${month}`}
            className="rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90"
          >
            Cargar métricas
          </Link>
        </div>
      </div>

      {searchParams.saved ? (
        <p className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--fg)]">
          Cambios guardados.
        </p>
      ) : null}
      {searchParams.error === 'save' ? (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          Revisa los datos e inténtalo de nuevo.
        </p>
      ) : null}
      {searchParams.error === 'forbidden' ? (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          No tienes permiso para editar clientes.
        </p>
      ) : null}

      {anyData ? (
        <>
          <div className="flex flex-wrap items-stretch gap-4">
            {KPI_METRICS.map((key) => (
              <StatCard
                key={key}
                label={METRIC_LABELS[key]}
                value={formatMetric(key, cur(key))}
                delta={<MetricDelta metricKey={key} current={cur(key)} previous={prev(key)} />}
                series={metricSeries(byMonth, months, key).map((p) => p.value)}
              />
            ))}
          </div>

          <MetricToggleChart
            chips={chartChips}
            active={chartMetric}
            data={metricSeries(byMonth, months, chartMetric)}
            headline={{
              value: formatMetric(chartMetric, cur(chartMetric)),
              delta: (
                <MetricDelta
                  metricKey={chartMetric}
                  current={cur(chartMetric)}
                  previous={prev(chartMetric)}
                />
              ),
            }}
          />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                Detalle por mes
              </h2>
              <ExportCsvButton
                rows={csvRows}
                filename={`${client.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-metricas.csv`}
              />
            </div>
            <div className="overflow-x-auto rounded-[var(--radius-xl)] border border-[var(--border)] shadow-[var(--shadow-sm)]">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] text-[var(--text-secondary)]">
                  <tr>
                    <th className="px-4 py-2 font-medium">Mes</th>
                    {TABLE_METRICS.map((key) => (
                      <th key={key} className="px-4 py-2 text-right font-medium">
                        {METRIC_LABELS[key]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {tableRows.map((row) => (
                    <tr key={row.month}>
                      <td className="whitespace-nowrap px-4 py-2 text-[var(--fg)]">
                        {monthLabel(row.month)}
                      </td>
                      {TABLE_METRICS.map((key) => (
                        <td
                          key={key}
                          className="px-4 py-2 text-right font-mono text-[var(--fg)]"
                        >
                          {formatMetric(key, row.kpis[key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <p className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--text-secondary)]">
          Sin métricas cargadas para este cliente todavía.
        </p>
      )}

      {/* Client data */}
      <div className="space-y-4 border-t border-[var(--border)] pt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          Datos del cliente
        </h2>

        <form action={updateClientAction} className="flex max-w-xl flex-col gap-4">
          <input type="hidden" name="orgSlug" value={params.orgSlug} />
          <input type="hidden" name="clientId" value={client.id} />

          <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
            Nombre
            <input name="name" type="text" required defaultValue={client.name} className={FIELD} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
            Tipo de gestión
            <select name="reportProfile" defaultValue={client.reportProfile} className={FIELD}>
              {REPORT_PROFILES.map((value) => (
                <option key={value} value={value}>
                  {PROFILE_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
            Plataforma
            <select name="platform" defaultValue={client.platform} className={FIELD}>
              {PLATFORM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
            ID de cuenta (opcional)
            <input
              name="platformAccountId"
              type="text"
              defaultValue={client.platformAccountId ?? ''}
              className={FIELD}
            />
          </label>

          <button
            type="submit"
            className="self-start rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90"
          >
            Guardar cambios
          </button>
        </form>

        <form action={deleteClientAction} className="border-t border-[var(--border)] pt-4">
          <input type="hidden" name="orgSlug" value={params.orgSlug} />
          <input type="hidden" name="clientId" value={client.id} />
          <button
            type="submit"
            className="rounded-[var(--radius-md)] border border-[var(--destructive)] px-4 py-2 text-sm font-medium text-[var(--destructive)] transition-opacity duration-150 hover:opacity-70"
          >
            Eliminar cliente
          </button>
        </form>
      </div>
    </section>
  );
}
