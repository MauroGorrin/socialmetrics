import 'server-only';

import { and, desc, eq, gte, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import { createAdminSupabase } from '@/lib/auth';
import {
  computeKpis,
  isBaseMetric,
  type Kpis,
  type MetricKey,
  monthLabel,
  monthsEndingAt,
  previousMonth,
  shortMonthLabel,
} from '@/lib/metrics';
import type { ReportData } from '@/lib/report';
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

/** First day of `periodMonth` (`YYYY-MM`) and of the following month, as ISO dates. */
export function monthBounds(periodMonth: string): { from: string; to: string } {
  const [year, month] = periodMonth.split('-').map(Number);
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** Split summed-vs-averaged aggregate rows into the two buckets `computeKpis` wants. */
function splitAggregates(
  rows: Array<{ key: string; name: string; sum: string | null; avg: string | null }>,
): Map<string, Kpis> {
  const base = new Map<string, Partial<Record<MetricKey, number>>>();
  const ratio = new Map<string, Partial<Record<MetricKey, number>>>();
  const keys = new Set<string>();

  for (const row of rows) {
    keys.add(row.key);
    if (isBaseMetric(row.name)) {
      const bucket = base.get(row.key) ?? {};
      bucket[row.name] = Number(row.sum ?? 0);
      base.set(row.key, bucket);
    } else {
      const bucket = ratio.get(row.key) ?? {};
      bucket[row.name as MetricKey] = Number(row.avg ?? 0);
      ratio.set(row.key, bucket);
    }
  }

  const out = new Map<string, Kpis>();
  for (const key of keys) {
    out.set(key, computeKpis(base.get(key) ?? {}, ratio.get(key) ?? {}));
  }
  return out;
}

export type ReportClientKpis = { clientId: string; clientName: string; kpis: Kpis };

/**
 * KPIs per client for one month. Base metrics are summed, ratio metrics
 * (ctr/cpl/roas) are recomputed from those sums — never added. `clientIds`
 * empty → every active client. Clients with no data still appear (all zeros).
 */
export async function clientKpisForMonth(
  orgId: string,
  clientIds: string[],
  periodMonth: string,
): Promise<ReportClientKpis[]> {
  const activeClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(
      clientIds.length > 0
        ? and(eq(clients.orgId, orgId), inArray(clients.id, clientIds))
        : eq(clients.orgId, orgId),
    )
    .orderBy(clients.name);

  if (activeClients.length === 0) return [];

  const { from, to } = monthBounds(periodMonth);
  const rows = await db
    .select({
      key: metrics.clientId,
      name: metrics.metricName,
      sum: sql<string>`sum(${metrics.metricValue})`,
      avg: sql<string>`avg(${metrics.metricValue})`,
    })
    .from(metrics)
    .where(
      and(
        eq(metrics.orgId, orgId),
        gte(metrics.period, from),
        lt(metrics.period, to),
        inArray(
          metrics.clientId,
          activeClients.map((c) => c.id),
        ),
      ),
    )
    .groupBy(metrics.clientId, metrics.metricName);

  const byClient = splitAggregates(rows);
  return activeClients.map((client) => ({
    clientId: client.id,
    clientName: client.name,
    kpis: byClient.get(client.id) ?? computeKpis({}),
  }));
}

/** Combined org KPIs for each of the given months (`YYYY-MM`), keyed by month. */
export async function orgKpisByMonth(
  orgId: string,
  clientIds: string[],
  months: string[],
): Promise<Record<string, Kpis>> {
  if (months.length === 0) return {};
  const from = monthBounds(months[0]).from;
  const to = monthBounds(months[months.length - 1]).to;

  const rows = await db
    .select({
      key: sql<string>`to_char(${metrics.period}, 'YYYY-MM')`,
      name: metrics.metricName,
      sum: sql<string>`sum(${metrics.metricValue})`,
      avg: sql<string>`avg(${metrics.metricValue})`,
    })
    .from(metrics)
    .where(
      and(
        eq(metrics.orgId, orgId),
        gte(metrics.period, from),
        lt(metrics.period, to),
        clientIds.length > 0 ? inArray(metrics.clientId, clientIds) : undefined,
      ),
    )
    .groupBy(sql`to_char(${metrics.period}, 'YYYY-MM')`, metrics.metricName);

  const byMonth = splitAggregates(rows);
  const out: Record<string, Kpis> = {};
  for (const month of months) {
    out[month] = byMonth.get(month) ?? computeKpis({});
  }
  return out;
}

const TREND_MONTHS = 6;

/**
 * Everything the report template needs for one `(org, month)`: this month's
 * KPIs per client, the previous month for deltas, and a 6-month trend of the
 * org totals. Callers pass the branding (a data URI for the PDF, a URL for the
 * web views) and the footer line.
 */
export async function getReportData(input: {
  orgId: string;
  orgName: string;
  clientIds: string[];
  periodMonth: string;
  generatedAt: string;
  logoUrl?: string | null;
  footer?: string | null;
}): Promise<ReportData> {
  const prevMonth = previousMonth(input.periodMonth);
  const trendMonths = monthsEndingAt(input.periodMonth, TREND_MONTHS);

  const [current, previous, monthly] = await Promise.all([
    clientKpisForMonth(input.orgId, input.clientIds, input.periodMonth),
    clientKpisForMonth(input.orgId, input.clientIds, prevMonth),
    orgKpisByMonth(input.orgId, input.clientIds, trendMonths),
  ]);

  const prevByClient = new Map(previous.map((c) => [c.clientId, c.kpis]));
  const clientRows = current.map((c) => ({
    name: c.clientName,
    kpis: c.kpis,
    previous: prevByClient.get(c.clientId) ?? computeKpis({}),
  }));

  return {
    orgName: input.orgName,
    periodMonth: input.periodMonth,
    periodLabel: monthLabel(input.periodMonth),
    previousLabel: monthLabel(prevMonth),
    generatedAt: input.generatedAt,
    logoUrl: input.logoUrl ?? null,
    footer: input.footer ?? null,
    totals: monthly[input.periodMonth] ?? computeKpis({}),
    previousTotals: monthly[prevMonth] ?? computeKpis({}),
    clients: clientRows,
    trend: trendMonths.map((month) => ({
      month,
      label: shortMonthLabel(month),
      kpis: monthly[month] ?? computeKpis({}),
    })),
  };
}
