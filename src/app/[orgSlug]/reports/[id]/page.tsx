import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createShareAction, sendReportAction } from '@/app/[orgSlug]/reports/actions';
import { CopyLinkButton } from '@/app/[orgSlug]/reports/[id]/copy-link-button';
import { SendReportDialog } from '@/components/app/send-report-dialog';
import { ReportTemplate } from '@/components/pdf/report-template';
import { getCurrentUser } from '@/lib/auth';
import { env } from '@/lib/env';
import type { ReportProfile } from '@/lib/metrics';
import { getAccessibleOrg } from '@/server/queries/orgs';
import { getReport, getReportData, signedReportPdfUrl } from '@/server/queries/reports';

const SITE_URL = env.SESSION_URL ?? 'http://localhost:3000';

export default async function ReportViewPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string; id: string };
  searchParams: { shared?: string; error?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/signin?redirect=/${params.orgSlug}/reports/${params.id}`);

  const access = await getAccessibleOrg(params.orgSlug, user.id);
  if (!access) notFound();

  const report = await getReport(access.org.id, params.id);
  if (!report) notFound();

  const data = await getReportData({
    orgId: access.org.id,
    orgName: access.org.name,
    clientId: report.clientId ?? null,
    profile: (report.profile as ReportProfile) ?? 'ads',
    periodMonth: report.periodMonth,
    generatedAt: report.generatedAt
      ? report.generatedAt.toISOString().slice(0, 10)
      : 'sin generar',
    logoUrl: access.org.logoUrl,
    footer: access.org.footerText ?? access.org.name,
  });

  const pdfUrl = report.pdfUrl ? await signedReportPdfUrl(report.pdfUrl) : null;
  const canManage = access.role === 'owner' || access.role === 'admin';
  const canSend = canManage && Boolean(report.pdfUrl);

  const liveShare =
    report.sharedToken && report.sharedExpiresAt && report.sharedExpiresAt > new Date()
      ? report.sharedToken
      : null;
  const activeToken = searchParams.shared ?? liveShare;
  const shareUrl = activeToken ? `${SITE_URL}/public/reports/${activeToken}` : null;

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
          {canManage ? (
            <form action={createShareAction}>
              <input type="hidden" name="orgSlug" value={params.orgSlug} />
              <input type="hidden" name="reportId" value={report.id} />
              <button
                type="submit"
                className="rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg)] hover:opacity-70"
              >
                {activeToken ? 'Regenerar link' : 'Compartir'}
              </button>
            </form>
          ) : null}
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

      {searchParams.error === 'share' ? (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          No se pudo generar el link para compartir.
        </p>
      ) : null}

      {shareUrl ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
          <span className="text-[var(--fg-muted)]">Link público (48 h):</span>
          <a href={shareUrl} className="break-all text-[var(--fg)] underline">
            {shareUrl}
          </a>
          <CopyLinkButton text={shareUrl} />
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white p-6 text-black">
        <ReportTemplate data={data} />
      </div>
    </section>
  );
}
