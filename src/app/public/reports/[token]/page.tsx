import { notFound } from 'next/navigation';
import { type ReportData, REPORT_METRICS, ReportTemplate } from '@/components/pdf/report-template';
import { reportMetricsByClient } from '@/server/queries/reports';
import { getReportByShareToken } from '@/server/queries/shares';

/**
 * Public report view. No session required — the share token is the credential.
 * An unknown token, a token from another org, or an expired one all 404
 * (see `getReportByShareToken`).
 */
export default async function PublicReportPage({ params }: { params: { token: string } }) {
  const shared = await getReportByShareToken(params.token);
  if (!shared) notFound();

  const clientMetrics = await reportMetricsByClient(
    shared.org.id,
    shared.report.clientIds ?? [],
    shared.report.periodMonth,
  );

  const data: ReportData = {
    orgName: shared.org.name,
    periodMonth: shared.report.periodMonth,
    generatedAt: shared.report.generatedAt
      ? shared.report.generatedAt.toISOString().slice(0, 10)
      : '—',
    logoUrl: shared.org.logoUrl,
    footer: `${shared.org.name} · Reporte compartido`,
    clients: clientMetrics.map((client) => ({
      name: client.clientName,
      values: Object.fromEntries(
        REPORT_METRICS.map((metric) => [metric.key, client.values[metric.key] ?? 0]),
      ) as ReportData['clients'][number]['values'],
    })),
  };

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-8">
      <div className="rounded-lg border border-[var(--border)] bg-white p-6 text-black">
        <ReportTemplate data={data} />
      </div>
    </main>
  );
}
