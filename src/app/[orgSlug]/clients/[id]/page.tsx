import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { deleteClientAction, updateClientAction } from '@/app/[orgSlug]/clients/actions';
import { ExportCsvButton } from '@/components/app/export-csv-button';
import { KpiCard } from '@/components/app/kpi-card';
import { TrendChart } from '@/components/app/trend-chart';
import { getCurrentUser } from '@/lib/auth';
import {
  currentMonth,
  formatMetric,
  METRIC_LABELS,
  type MetricKey,
  metricSeries,
  monthLabel,
  monthsEndingAt,
  previousMonth,
} from '@/lib/metrics';
import { getClient } from '@/server/queries/clients';
import { getAccessibleOrg } from '@/server/queries/orgs';
import { orgKpisByMonth } from '@/server/queries/reports';

const FIELD =
  'rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base text-[var(--fg)] outline-none focus:border-[var(--fg-muted)]';

const PLATFORM_OPTIONS = [
  { value: 'meta', label: 'Meta' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
];
const PLATFORM_LABELS = Object.fromEntries(PLATFORM_OPTIONS.map((o) => [o.value, o.label]));

const KPI_METRICS: MetricKey[] = ['impressions', 'clicks', 'ctr', 'spend', 'conversions', 'roas'];
const CHART_METRICS: MetricKey[] = ['impressions', 'clicks', 'spend', 'ctr', 'conversions', 'roas'];
const TABLE_METRICS: MetricKey[] = ['impressions', 'clicks', 'ctr', 'spend', 'cpl', 'roas'];
const HISTORY_MONTHS = 12;

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string; id: string };
  searchParams: { saved?: string; error?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/signin?redirect=/${params.orgSlug}/clients/${params.id}`);

  const access = await getAccessibleOrg(params.orgSlug, user.id);
  if (!access) notFound();

  const client = await getClient(access.org.id, params.id);
  if (!client) notFound();

  const month = currentMonth();
  const prevMonth = previousMonth(month);
  const months = monthsEndingAt(month, HISTORY_MONTHS);
  const byMonth = await orgKpisByMonth(access.org.id, [client.id], months);

  const tableRows = [...months].reverse().map((m) => ({ month: m, kpis: byMonth[m] }));
  const anyData = tableRows.some(
    (r) =>
      r.kpis.impressions +
        r.kpis.clicks +
        r.kpis.spend +
        r.kpis.conversions +
        r.kpis.conversion_value >
      0,
  );

  const csvRows = tableRows.map((r) => ({
    Mes: r.month,
    ...Object.fromEntries(TABLE_METRICS.map((key) => [METRIC_LABELS[key], r.kpis[key]])),
  }));

  return (
    <section className="mx-auto max-w-4xl space-y-8">
      <div>
        <Link
          href={`/${params.orgSlug}/clients`}
          className="text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
        >
          ← Volver a clientes
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[var(--fg)]">{client.name}</h1>
            <p className="text-sm text-[var(--fg-muted)]">
              {PLATFORM_LABELS[client.platform] ?? client.platform}
            </p>
          </div>
          <Link
            href={`/${params.orgSlug}/metrics?client=${client.id}&month=${month}`}
            className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90"
          >
            Cargar métricas
          </Link>
        </div>
      </div>

      {searchParams.saved ? (
        <p className="rounded border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--fg)]">
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {KPI_METRICS.map((key) => (
              <KpiCard
                key={key}
                metricKey={key}
                value={byMonth[month]?.[key] ?? 0}
                previous={byMonth[prevMonth]?.[key] ?? 0}
              />
            ))}
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
              Tendencia · últimos {HISTORY_MONTHS} meses
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              {CHART_METRICS.map((key) => (
                <div
                  key={key}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
                >
                  <p className="mb-2 text-sm font-medium text-[var(--fg)]">{METRIC_LABELS[key]}</p>
                  <TrendChart data={metricSeries(byMonth, months, key)} metricKey={key} height={150} />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
                Detalle por mes
              </h2>
              <ExportCsvButton
                rows={csvRows}
                filename={`${client.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-metricas.csv`}
              />
            </div>
            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] text-[var(--fg-muted)]">
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
                        <td key={key} className="px-4 py-2 text-right text-[var(--fg)]">
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
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--fg-muted)]">
          Sin métricas cargadas para este cliente todavía.
        </p>
      )}

      {/* Client data */}
      <div className="space-y-4 border-t border-[var(--border)] pt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
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
            className="self-start rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90"
          >
            Guardar cambios
          </button>
        </form>

        <form action={deleteClientAction} className="border-t border-[var(--border)] pt-4">
          <input type="hidden" name="orgSlug" value={params.orgSlug} />
          <input type="hidden" name="clientId" value={client.id} />
          <button
            type="submit"
            className="rounded border border-[var(--destructive)] px-4 py-2 text-sm font-medium text-[var(--destructive)] transition-opacity duration-150 hover:opacity-70"
          >
            Eliminar cliente
          </button>
        </form>
      </div>
    </section>
  );
}
