import 'server-only';

import { and, eq } from 'drizzle-orm';
import {
  type ReportData,
  REPORT_METRICS,
  renderReportDocument,
} from '@/components/pdf/report-template';
import { createAdminSupabase } from '@/lib/auth';
import { htmlToPdf } from '@/lib/pdf-generator';
import { db } from '@/server/db';
import { auditLogs, reports } from '@/server/db/schema';
import { reportMetricsByClient } from '@/server/queries/reports';

/**
 * Report generation: roll metrics up per client for the month, render the
 * print template to a self-contained HTML string, turn it into a PDF, and
 * upsert it at `reports/{orgId}/{reportId}.pdf`. Re-running for the same
 * (org, month) reuses the row and overwrites the file.
 */

const STORAGE_BUCKET = 'reports';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

function buildReportData(
  orgName: string,
  periodMonth: string,
  clientMetrics: Awaited<ReturnType<typeof reportMetricsByClient>>,
): ReportData {
  return {
    orgName,
    periodMonth,
    generatedAt: new Date().toISOString().slice(0, 10),
    clients: clientMetrics.map((client) => ({
      name: client.clientName,
      values: Object.fromEntries(
        REPORT_METRICS.map((metric) => [metric.key, client.values[metric.key] ?? 0]),
      ) as ReportData['clients'][number]['values'],
    })),
  };
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
    const clientMetrics = await reportMetricsByClient(
      input.orgId,
      clientIds ?? [],
      input.periodMonth,
    );
    const html = renderReportDocument(
      buildReportData(input.orgName, input.periodMonth, clientMetrics),
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
    return { ok: false, error: 'No pudimos generar el reporte. Probá de nuevo.' };
  }
}
