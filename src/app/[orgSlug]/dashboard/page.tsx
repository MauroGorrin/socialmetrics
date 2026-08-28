import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { generateReportAction } from '@/app/[orgSlug]/reports/actions';
import { ClientOverviewCard } from '@/components/app/client-overview-card';
import { MetricDelta } from '@/components/app/metric-delta';
import { getCurrentUser } from '@/lib/auth';
import {
  addKpis,
  currentMonth,
  emptyKpis,
  formatMetric,
  type Kpis,
  type MetricKey,
  monthLabel,
  previousMonth,
} from '@/lib/metrics';
import { listClients } from '@/server/queries/clients';
import { getAccessibleOrg } from '@/server/queries/orgs';
import { clientKpisForMonth, listReports } from '@/server/queries/reports';

const CONTROL =
  'rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--fg)]';
const GHOST_BTN =
  'rounded border border-[var(--border)] px-4 py-2 text-sm text-[var(--fg)] transition-opacity duration-150 hover:opacity-70';
const PRIMARY_BTN =
  'rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90';

const STRIP_METRICS: MetricKey[] = ['impressions', 'clicks', 'spend', 'ctr', 'roas'];
const STRIP_LABELS: Record<string, string> = {
  impressions: 'Impresiones',
  clicks: 'Clics',
  spend: 'Inversión',
  ctr: 'CTR',
  roas: 'ROAS',
};

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
  searchParams: { month?: string };
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
  const prevMonth = previousMonth(month);
  const canGenerate = access.role === 'owner' || access.role === 'admin';

  const [clients, current, previous, monthReports] = await Promise.all([
    listClients(orgId),
    clientKpisForMonth(orgId, [], month),
    clientKpisForMonth(orgId, [], prevMonth),
    listReports(orgId, { month }),
  ]);

  const report = monthReports[0] ?? null;
  const prevByClient = new Map(previous.map((c) => [c.clientId, c.kpis]));

  const totals = current.reduce((acc, c) => addKpis(acc, c.kpis), emptyKpis());
  const prevTotals = previous.reduce((acc, c) => addKpis(acc, c.kpis), emptyKpis());
  const anyData = current.some((c) => hasData(c.kpis));

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--fg)]">Panel</h1>
          <p className="text-sm text-[var(--fg-muted)]">{monthLabel(month)}</p>
        </div>
        <div className="flex items-end gap-2">
          <form method="get" className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-[var(--fg-muted)]">
              Mes
              <input type="month" name="month" defaultValue={month} className={CONTROL} />
            </label>
            <button type="submit" className={GHOST_BTN}>
              Ver
            </button>
          </form>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
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

          {/* Org totals — only meaningful with more than one client */}
          {clients.length > 1 && anyData ? (
            <dl className="grid grid-cols-2 gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 sm:grid-cols-3 md:grid-cols-5">
              {STRIP_METRICS.map((key) => (
                <div key={key}>
                  <dt className="text-[11px] uppercase tracking-wide text-[var(--fg-muted)]">
                    {STRIP_LABELS[key]}
                  </dt>
                  <dd className="mt-0.5 flex items-baseline gap-2">
                    <span className="text-lg font-bold text-[var(--fg)]">
                      {formatMetric(key, totals[key])}
                    </span>
                    <MetricDelta metricKey={key} current={totals[key]} previous={prevTotals[key]} />
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {/* One card per client */}
          <div className="grid gap-4 sm:grid-cols-2">
            {current.map((c) => {
              const client = clients.find((x) => x.id === c.clientId);
              if (!client) return null;
              return (
                <ClientOverviewCard
                  key={c.clientId}
                  orgSlug={params.orgSlug}
                  month={month}
                  client={{ id: client.id, name: client.name, platform: client.platform }}
                  kpis={c.kpis}
                  previous={prevByClient.get(c.clientId) ?? emptyKpis()}
                  hasData={hasData(c.kpis)}
                />
              );
            })}
          </div>

          <p className="text-sm text-[var(--fg-muted)]">
            ¿Cargar el mes de varios clientes de una?{' '}
            <Link href={`/${params.orgSlug}/metrics`} className="text-[var(--fg)] underline">
              Ir a Métricas
            </Link>
          </p>
        </>
      )}
    </section>
  );
}
