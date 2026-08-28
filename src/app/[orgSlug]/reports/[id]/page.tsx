import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { sendReportAction } from '@/app/[orgSlug]/reports/actions';
import { SendReportDialog } from '@/components/app/send-report-dialog';
import { type ReportData, REPORT_METRICS, ReportTemplate } from '@/components/pdf/report-template';
import { getCurrentUser } from '@/lib/auth';
import { getAccessibleOrg } from '@/server/queries/orgs';
import { getReport, reportMetricsByClient, signedReportPdfUrl } from '@/server/queries/reports';

export default async function ReportViewPage({
  params,
}: {
  params: { orgSlug: string; id: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/signin?redirect=/${params.orgSlug}/reports/${params.id}`);

  const access = await getAccessibleOrg(params.orgSlug, user.id);
  if (!access) notFound();

  const report = await getReport(access.org.id, params.id);
  if (!report) notFound();

  const clientMetrics = await reportMetricsByClient(
    access.org.id,
    report.clientIds ?? [],
    report.periodMonth,
  );

  const data: ReportData = {
    orgName: access.org.name,
    periodMonth: report.periodMonth,
    generatedAt: report.generatedAt
      ? report.generatedAt.toISOString().slice(0, 10)
      : 'sin generar',
    clients: clientMetrics.map((client) => ({
      name: client.clientName,
      values: Object.fromEntries(
        REPORT_METRICS.map((metric) => [metric.key, client.values[metric.key] ?? 0]),
      ) as ReportData['clients'][number]['values'],
    })),
  };

  const pdfUrl = report.pdfUrl ? await signedReportPdfUrl(report.pdfUrl) : null;
  const canSend =
    (access.role === 'owner' || access.role === 'admin') && Boolean(report.pdfUrl);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Link
          href={`/${params.orgSlug}/reports`}
          className="text-sm text-[var(--fg-muted)] underline"
        >
          ← Volver a reportes
        </Link>
        <div className="flex items-center gap-2">
          {canSend ? (
            <SendReportDialog
              orgSlug={params.orgSlug}
              reportId={report.id}
              action={sendReportAction}
            />
          ) : null}
          {pdfUrl ? (
            <a
              href={pdfUrl}
              className="rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg)] hover:opacity-70"
            >
              Descargar PDF
            </a>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white p-6 text-black">
        <ReportTemplate data={data} />
      </div>
    </section>
  );
}
