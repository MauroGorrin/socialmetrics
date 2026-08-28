import 'server-only';

import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { createAdminSupabase } from '@/lib/auth';
import { db } from '@/server/db';
import type { Report } from '@/server/db/schema';
import {
  clients,
  emailEvents,
  memberships,
  metrics,
  organizations,
  reports,
  users,
} from '@/server/db/schema';

const STORAGE_BUCKET = 'reports';

/**
 * Report reads plus the per-client metric roll-up a report is built from.
 * Every function is org-scoped.
 */

/** An org's reports, newest first. Optionally filtered to one `YYYY-MM` month. */
export async function listReports(
  orgId: string,
  options: { month?: string } = {},
): Promise<Report[]> {
  const where = options.month
    ? and(eq(reports.orgId, orgId), eq(reports.periodMonth, options.month))
    : eq(reports.orgId, orgId);

  return db.select().from(reports).where(where).orderBy(desc(reports.createdAt));
}

/** The distinct months an org has reports for, newest first — month-filter options. */
export async function reportMonths(orgId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ periodMonth: reports.periodMonth })
    .from(reports)
    .where(eq(reports.orgId, orgId))
    .orderBy(desc(reports.periodMonth));
  return rows.map((row) => row.periodMonth);
}

export async function getReport(orgId: string, reportId: string): Promise<Report | null> {
  const [row] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.orgId, orgId), eq(reports.id, reportId)))
    .limit(1);
  return row ?? null;
}

/** A report the user may access (member of its org), with the org slug. `null` otherwise. */
export async function getAccessibleReport(
  reportId: string,
  userId: string,
): Promise<{ report: Report; orgSlug: string } | null> {
  const [row] = await db
    .select({ report: reports, orgSlug: organizations.slug })
    .from(reports)
    .innerJoin(organizations, eq(organizations.id, reports.orgId))
    .innerJoin(
      memberships,
      and(
        eq(memberships.orgId, reports.orgId),
        eq(memberships.userId, userId),
        isNotNull(memberships.acceptedAt),
      ),
    )
    .where(eq(reports.id, reportId))
    .limit(1);
  return row ? { report: row.report, orgSlug: row.orgSlug } : null;
}

/**
 * A short-lived signed URL for a stored report PDF, or `null`. Pass
 * `downloadName` to make the link force a download with that filename.
 */
export async function signedReportPdfUrl(
  pdfPath: string,
  downloadName?: string,
): Promise<string | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(pdfPath, 600, downloadName ? { download: downloadName } : undefined);
  return data?.signedUrl ?? null;
}

/** The org (+ owner + report) a Resend `email_id` belongs to, from its send record. */
export async function emailSendContext(
  providerId: string,
): Promise<{ orgId: string; ownerId: string; reportId: string | null } | null> {
  const [row] = await db
    .select({
      orgId: emailEvents.orgId,
      ownerId: organizations.ownerId,
      reportId: emailEvents.reportId,
    })
    .from(emailEvents)
    .innerJoin(organizations, eq(organizations.id, emailEvents.orgId))
    .where(
      and(
        eq(emailEvents.providerId, providerId),
        inArray(emailEvents.eventType, ['sent', 'send_failed']),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** The user whose email is `email` (a recipient who is also a member), or null. */
export async function userIdForEmail(email: string): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return row?.id ?? null;
}

export type ReportClientMetrics = {
  clientId: string;
  clientName: string;
  values: Record<string, number>;
};

/** First day of `periodMonth` (`YYYY-MM`) and of the following month, as ISO dates. */
export function monthBounds(periodMonth: string): { from: string; to: string } {
  const [year, month] = periodMonth.split('-').map(Number);
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/**
 * Sum each metric per client for the given month. `clientIds` empty → every
 * active client in the org. Clients with no metrics still appear (all zeros).
 */
export async function reportMetricsByClient(
  orgId: string,
  clientIds: string[],
  periodMonth: string,
): Promise<ReportClientMetrics[]> {
  const activeClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(
      clientIds.length > 0
        ? and(eq(clients.orgId, orgId), inArray(clients.id, clientIds))
        : eq(clients.orgId, orgId),
    )
    .orderBy(clients.name);

  const { from, to } = monthBounds(periodMonth);

  const rows = await db
    .select({
      clientId: metrics.clientId,
      name: metrics.metricName,
      total: sql<string>`sum(${metrics.metricValue})`,
    })
    .from(metrics)
    .where(
      and(
        eq(metrics.orgId, orgId),
        gte(metrics.period, from),
        lt(metrics.period, to),
        activeClients.length > 0
          ? inArray(
              metrics.clientId,
              activeClients.map((c) => c.id),
            )
          : sql`false`,
      ),
    )
    .groupBy(metrics.clientId, metrics.metricName);

  const byClient = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const bucket = byClient.get(row.clientId) ?? {};
    bucket[row.name] = Number(row.total ?? 0);
    byClient.set(row.clientId, bucket);
  }

  return activeClients.map((client) => ({
    clientId: client.id,
    clientName: client.name,
    values: byClient.get(client.id) ?? {},
  }));
}
