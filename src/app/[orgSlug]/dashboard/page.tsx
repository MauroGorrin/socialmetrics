import { notFound, redirect } from 'next/navigation';
import { createMetricAction } from '@/app/[orgSlug]/dashboard/actions';
import { KpiCards } from '@/components/app/kpi-cards';
import { MetricInputForm } from '@/components/app/metric-input-form';
import { MetricTable } from '@/components/app/metric-table';
import { getCurrentUser } from '@/lib/auth';
import { METRIC_NAMES } from '@/server/mutations/metrics';
import { listClients } from '@/server/queries/clients';
import { countMetrics, listMetrics, summariseMetrics } from '@/server/queries/metrics';
import { getAccessibleOrg } from '@/server/queries/orgs';

const METRIC_LABELS: Record<string, string> = {
  impressions: 'Impresiones',
  clicks: 'Clics',
  spend: 'Inversión',
  ctr: 'CTR',
  cpl: 'CPL',
  roas: 'ROAS',
  conversions: 'Conversiones',
  conversion_value: 'Valor de conversión',
};

const nf = new Intl.NumberFormat('es', { maximumFractionDigits: 2 });

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string };
  searchParams: { client?: string; page?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/signin?redirect=/${params.orgSlug}/dashboard`);

  const access = await getAccessibleOrg(params.orgSlug, user.id);
  if (!access) notFound();

  const orgId = access.org.id;
  const basePath = `/${params.orgSlug}/dashboard`;
  const activeClientId = typeof searchParams.client === 'string' ? searchParams.client : '';
  const page = Number.parseInt(searchParams.page ?? '1', 10) || 1;

  const [clients, total, summary, pageData] = await Promise.all([
    listClients(orgId),
    countMetrics(orgId),
    summariseMetrics(orgId, { clientId: activeClientId || undefined }),
    listMetrics(orgId, { page, clientId: activeClientId || undefined }),
  ]);

  const kpis = [
    { label: 'Impresiones', value: nf.format(summary.impressions) },
    { label: 'Clics', value: nf.format(summary.clicks) },
    { label: 'CTR', value: `${summary.ctr.toFixed(2)}%` },
    { label: 'ROAS', value: summary.roas.toFixed(2) },
  ];

  const metricOptions = METRIC_NAMES.map((name) => ({
    value: name,
    label: METRIC_LABELS[name] ?? name,
  }));

  const rows = pageData.rows.map((metric) => ({
    id: metric.id,
    clientName: metric.clientName,
    metricLabel: METRIC_LABELS[metric.metricName] ?? metric.metricName,
    value: nf.format(Number(metric.metricValue)),
    period: metric.period,
  }));

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--fg)]">Panel</h1>

      <KpiCards items={kpis} />

      {clients.length === 0 ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--fg-muted)]">
          Agrega un cliente antes de cargar métricas.
        </p>
      ) : (
        <MetricInputForm
          orgSlug={params.orgSlug}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          metricOptions={metricOptions}
          action={createMetricAction}
        />
      )}

      {total === 0 ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--fg-muted)]">
          No metrics yet
        </p>
      ) : (
        <MetricTable
          rows={rows}
          page={pageData.page}
          pageCount={pageData.pageCount}
          hasPrev={pageData.hasPrev}
          hasNext={pageData.hasNext}
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          activeClientId={activeClientId}
          basePath={basePath}
        />
      )}
    </section>
  );
}
