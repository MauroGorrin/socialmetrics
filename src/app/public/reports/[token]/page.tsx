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
    <main className="min-h-[100dvh] bg-[var(--background)] py-8">
      <div className="mx-auto max-w-3xl px-4">
        {shared.org.logoUrl ? (
          <div className="mb-4 flex items-center">
            {/* biome-ignore lint/performance/noImgElement: the report shell must not pull next/image into the PDF route's graph */}
            <img
              src={shared.org.logoUrl}
              alt={shared.org.name}
              className="h-8 w-auto"
            />
          </div>
        ) : null}
        <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-white text-black shadow-[var(--shadow-lg)]">
          <div className="p-6 md:p-8">
            <ReportTemplate data={data} />
          </div>
        </div>
        {shared.org.footerText ? (
          <p className="mt-4 text-center text-xs text-[var(--text-tertiary)]">
            {shared.org.footerText}
          </p>
        ) : null}
      </div>
    </main>
  );
}
