import { notFound } from 'next/navigation';
import { ReportTemplate } from '@/components/pdf/report-template';
import type { ReportProfile } from '@/lib/metrics';
import { getReportData } from '@/server/queries/reports';
import { getReportByShareToken } from '@/server/queries/shares';

/**
 * Public report view. No session required — the share token is the credential.
 * An unknown token, a token from another org, or an expired one all 404
 * (see `getReportByShareToken`).
 */
export default async function PublicReportPage({ params }: { params: { token: string } }) {
  const shared = await getReportByShareToken(params.token);
  if (!shared) notFound();

  const data = await getReportData({
    orgId: shared.org.id,
    orgName: shared.org.name,
    clientId: shared.report.clientId ?? null,
    profile: (shared.report.profile as ReportProfile) ?? 'ads',
    periodMonth: shared.report.periodMonth,
    generatedAt: shared.report.generatedAt
      ? shared.report.generatedAt.toISOString().slice(0, 10)
      : '—',
    logoUrl: shared.org.logoUrl,
    footer: shared.org.footerText ?? `${shared.org.name} · Reporte compartido`,
  });

  return (
    <main className="mx-auto max-w-3xl p-4 md:p-8">
      <div className="rounded-lg border border-[var(--border)] bg-white p-6 text-black">
        <ReportTemplate data={data} />
      </div>
    </main>
  );
}
