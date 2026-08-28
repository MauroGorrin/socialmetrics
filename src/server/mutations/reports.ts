import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  type ReportData,
  REPORT_METRICS,
  renderReportDocument,
} from '@/components/pdf/report-template';
import { createAdminSupabase } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { env } from '@/lib/env';
import { htmlToPdf } from '@/lib/pdf-generator';
import { db } from '@/server/db';
import { auditLogs, emailEvents, organizations, reports } from '@/server/db/schema';
import { getReport, reportMetricsByClient } from '@/server/queries/reports';

const SITE_URL = env.SESSION_URL ?? 'http://localhost:3000';

/**
 * Report generation: roll metrics up per client for the month, render the
 * print template to a self-contained HTML string, turn it into a PDF, and
 * upsert it at `reports/{orgId}/{reportId}.pdf`. Re-running for the same
 * (org, month) reuses the row and overwrites the file.
 */

const STORAGE_BUCKET = 'reports';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function buildReportData(
  branding: { orgName: string; logoDataUri: string | null; footer: string | null },
  periodMonth: string,
  clientMetrics: Awaited<ReturnType<typeof reportMetricsByClient>>,
): ReportData {
  return {
    orgName: branding.orgName,
    periodMonth,
    generatedAt: new Date().toISOString().slice(0, 10),
    logoUrl: branding.logoDataUri,
    footer: branding.footer,
    clients: clientMetrics.map((client) => ({
      name: client.clientName,
      values: Object.fromEntries(
        REPORT_METRICS.map((metric) => [metric.key, client.values[metric.key] ?? 0]),
      ) as ReportData['clients'][number]['values'],
    })),
  };
}

/** The org's logo as an inline `data:` URI (no network call in the PDF), or null. */
async function logoDataUri(logoUrl: string | null): Promise<string | null> {
  if (!logoUrl) return null;
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? 'image/png';
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 2_000_000) return null;
    return `data:${contentType};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function generateReport(input: {
  orgId: string;
  orgName: string;
  actorId: string;
  periodMonth: string;
  clientIds: string[];
}): Promise<Result<{ reportId: string; pdfPath: string }>> {
  const clientIds = input.clientIds.length > 0 ? input.clientIds : null;

  const [existing] = await db
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.orgId, input.orgId), eq(reports.periodMonth, input.periodMonth)))
    .limit(1);

  let reportId = existing?.id;
  if (!reportId) {
    const [created] = await db
      .insert(reports)
      .values({ orgId: input.orgId, periodMonth: input.periodMonth, clientIds, status: 'draft' })
      .returning({ id: reports.id });
    reportId = created.id;
  }

  try {
    const [org] = await db
      .select({ logoUrl: organizations.logoUrl, footerText: organizations.footerText })
      .from(organizations)
      .where(eq(organizations.id, input.orgId))
      .limit(1);

    const clientMetrics = await reportMetricsByClient(
      input.orgId,
      clientIds ?? [],
      input.periodMonth,
    );
    const html = renderReportDocument(
      buildReportData(
        {
          orgName: input.orgName,
          logoDataUri: await logoDataUri(org?.logoUrl ?? null),
          footer: org?.footerText ?? null,
        },
        input.periodMonth,
        clientMetrics,
      ),
    );
    const pdf = await htmlToPdf(html);

    const admin = createAdminSupabase();
    const buckets = await admin.storage.listBuckets();
    if (!buckets.data?.some((bucket) => bucket.name === STORAGE_BUCKET)) {
      await admin.storage.createBucket(STORAGE_BUCKET, { public: false });
    }

    const pdfPath = `${input.orgId}/${reportId}.pdf`;
    const uploaded = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true });
    if (uploaded.error) {
      return { ok: false, error: 'No se pudo guardar el PDF del reporte.' };
    }

    await db
      .update(reports)
      .set({
        pdfUrl: pdfPath,
        clientIds,
        status: 'generated',
        generatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(reports.id, reportId));

    await db.insert(auditLogs).values({
      orgId: input.orgId,
      actorId: input.actorId,
      action: 'generate_report',
      targetId: reportId,
      metadata: { periodMonth: input.periodMonth },
    });

    return { ok: true, data: { reportId, pdfPath } };
  } catch (error) {
    console.error('[report] generation failed', error);
    return { ok: false, error: 'No pudimos generar el reporte. Vuelve a intentar.' };
  }
}

/**
 * Email a generated report as a PDF attachment to `recipients`, recording one
 * `email_event` row per recipient (joined to later webhook events by
 * `providerId`). The Resend call may fail (bad key, network) — the attempt is
 * still recorded and the caller gets a warning, not an error.
 */
export async function sendReport(input: {
  orgId: string;
  orgSlug: string;
  orgName: string;
  actorId: string;
  reportId: string;
  recipients: string[];
}): Promise<Result<{ providerId: string; recipients: number; warning?: string }>> {
  const report = await getReport(input.orgId, input.reportId);
  if (!report?.pdfUrl) {
    return { ok: false, error: 'Genera el reporte antes de enviarlo.' };
  }

  const admin = createAdminSupabase();
  const download = await admin.storage.from(STORAGE_BUCKET).download(report.pdfUrl);
  if (download.error || !download.data) {
    return { ok: false, error: 'No se encontró el PDF del reporte.' };
  }
  const pdf = Buffer.from(await download.data.arrayBuffer());

  const link = `${SITE_URL}/${input.orgSlug}/reports/${input.reportId}`;
  const subject = `Reporte ${report.periodMonth} · ${input.orgName}`;
  const result = await sendEmail({
    to: input.recipients,
    subject,
    html: `<p>Adjuntamos el reporte de <strong>${input.orgName}</strong> para ${report.periodMonth}.</p>
           <p><a href="${link}">Ver el reporte online</a></p>`,
    attachments: [{ filename: `reporte-${report.periodMonth}.pdf`, content: pdf }],
  });

  const providerId = result.ok && result.id ? result.id : randomUUID();

  await db.insert(emailEvents).values(
    input.recipients.map((recipient) => ({
      orgId: input.orgId,
      reportId: input.reportId,
      recipient,
      eventType: result.ok ? ('sent' as const) : ('send_failed' as const),
      providerId,
      metadata: {
        subject,
        attachmentBytes: pdf.length,
        ...(result.ok ? {} : { error: result.error }),
      },
    })),
  );

  await db
    .update(reports)
    .set({ status: 'sent', updatedAt: new Date() })
    .where(eq(reports.id, input.reportId));

  await db.insert(auditLogs).values({
    orgId: input.orgId,
    actorId: input.actorId,
    action: 'send_report',
    targetId: input.reportId,
    metadata: { recipients: input.recipients, providerId },
  });

  return {
    ok: true,
    data: {
      providerId,
      recipients: input.recipients.length,
      warning: result.ok ? undefined : 'El proveedor de email rechazó el envío; quedó registrado.',
    },
  };
}

const SHARE_TTL_MS = 48 * 60 * 60 * 1000;

/** Mint (or replace) a 48-hour public share token for a report. */
export async function createShareLink(input: {
  orgId: string;
  actorId: string;
  reportId: string;
}): Promise<Result<{ token: string; url: string }>> {
  const report = await getReport(input.orgId, input.reportId);
  if (!report) return { ok: false, error: 'El reporte no existe.' };

  const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, '');
  const now = new Date();

  await db
    .update(reports)
    .set({
      sharedToken: token,
      sharedAt: now,
      sharedExpiresAt: new Date(now.getTime() + SHARE_TTL_MS),
      status: 'shared',
      updatedAt: now,
    })
    .where(and(eq(reports.orgId, input.orgId), eq(reports.id, input.reportId)));

  await db.insert(auditLogs).values({
    orgId: input.orgId,
    actorId: input.actorId,
    action: 'share_report',
    targetId: input.reportId,
    metadata: { token },
  });

  return { ok: true, data: { token, url: `${SITE_URL}/public/reports/${token}` } };
}
