import 'server-only';

import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { createAdminSupabase } from '@/lib/auth';
import {
  computeKpis,
  computeOrganicKpis,
  emptyKpis,
  isBaseMetric,
  type Kpis,
  type MetricKey,
  monthBounds,
  monthLabel,
  monthsEndingAt,
  previousMonth,
  type ReportProfile,
  shortMonthLabel,
} from '@/lib/metrics';
import type { OrganicReportData, ReportData, ReportPostRow } from '@/lib/report';
import { db } from '@/server/db';
import type { Report } from '@/server/db/schema';
import {
  clients,
  emailEvents,
  memberships,
  metrics,
  organizations,
  reportPosts,
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

export type ReportClientKpis = {
  clientId: string;
  clientName: string;
  clientPlatform: string;
  kpis: Kpis;
};

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
    .select({ id: clients.id, name: clients.name, platform: clients.platform })
    .from(clients)
    .where(
      clientIds.length > 0
        ? and(eq(clients.orgId, orgId), isNull(clients.deletedAt), inArray(clients.id, clientIds))
        : and(eq(clients.orgId, orgId), isNull(clients.deletedAt)),
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
    clientPlatform: client.platform,
    kpis: byClient.get(client.id) ?? computeKpis({}),
  }));
}

export type ClientMonthlySeries = {
  clientId: string;
  clientName: string;
  clientPlatform: string;
  clientProfile: ReportProfile;
  byMonth: Record<string, Kpis>;
};

/** The month grid for every active client, keyed and aggregated by `build`. */
async function clientSeries(
  orgId: string,
  months: string[],
  profiles: ReportProfile[],
  build: (rows: Array<{ key: string; name: string; sum: string; avg: string }>) => Map<string, Kpis>,
  empty: () => Kpis,
): Promise<ClientMonthlySeries[]> {
  const activeClients = await db
    .select({
      id: clients.id,
      name: clients.name,
      platform: clients.platform,
      profile: clients.reportProfile,
    })
    .from(clients)
    .where(
      and(
        eq(clients.orgId, orgId),
        isNull(clients.deletedAt),
        inArray(clients.reportProfile, profiles),
      ),
    )
    .orderBy(clients.name);

  const base = (client: (typeof activeClients)[number], byMonth: Record<string, Kpis>) => ({
    clientId: client.id,
    clientName: client.name,
    clientPlatform: client.platform,
    clientProfile: client.profile as ReportProfile,
    byMonth,
  });

  if (activeClients.length === 0 || months.length === 0) {
    return activeClients.map((client) => base(client, {}));
  }

  const from = monthBounds(months[0]).from;
  const to = monthBounds(months[months.length - 1]).to;
  const rows = await db
    .select({
      clientId: metrics.clientId,
      month: sql<string>`to_char(${metrics.period}, 'YYYY-MM')`,
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
    .groupBy(metrics.clientId, sql`to_char(${metrics.period}, 'YYYY-MM')`, metrics.metricName);

  const combined = build(
    rows.map((row) => ({
      key: `${row.clientId}|${row.month}`,
      name: row.name,
      sum: row.sum,
      avg: row.avg,
    })),
  );

  return activeClients.map((client) => {
    const byMonth: Record<string, Kpis> = {};
    for (const month of months) {
      byMonth[month] = combined.get(`${client.id}|${month}`) ?? empty();
    }
    return base(client, byMonth);
  });
}

/**
 * Every ads / mixed client's KPIs for each of the given months — one query for
 * the dashboard's per-client charts. Clients with no data still appear.
 */
export function clientMonthlySeries(
  orgId: string,
  months: string[],
): Promise<ClientMonthlySeries[]> {
  return clientSeries(orgId, months, ['ads', 'mixed'], splitAggregates, () => computeKpis({}));
}

/** The organic equivalent — every organic / mixed client's organic KPIs. */
export function clientOrganicMonthlySeries(
  orgId: string,
  months: string[],
): Promise<ClientMonthlySeries[]> {
  return clientSeries(orgId, months, ['organic', 'mixed'], splitOrganicAggregates, emptyKpis);
}

/** Bucket sum rows by `clientId|month` key into organic KPI sets. */
function splitOrganicAggregates(
  rows: Array<{ key: string; name: string; sum: string }>,
): Map<string, Kpis> {
  const raw = new Map<string, Partial<Record<MetricKey, number>>>();
  for (const row of rows) {
    const bucket = raw.get(row.key) ?? {};
    bucket[row.name as MetricKey] = Number(row.sum ?? 0);
    raw.set(row.key, bucket);
  }
  const out = new Map<string, Kpis>();
  for (const [key, values] of raw) out.set(key, computeOrganicKpis(values));
  return out;
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

/** Organic KPIs per month for one client (`YYYY-MM` → Kpis), for the trend. */
export async function organicKpisByMonth(
  orgId: string,
  clientId: string,
  months: string[],
): Promise<Record<string, Kpis>> {
  const out: Record<string, Kpis> = {};
  for (const month of months) out[month] = emptyKpis();
  if (months.length === 0) return out;

  const from = monthBounds(months[0]).from;
  const to = monthBounds(months[months.length - 1]).to;
  const rows = await db
    .select({
      month: sql<string>`to_char(${metrics.period}, 'YYYY-MM')`,
      name: metrics.metricName,
      sum: sql<string>`sum(${metrics.metricValue})`,
    })
    .from(metrics)
    .where(
      and(
        eq(metrics.orgId, orgId),
        eq(metrics.clientId, clientId),
        gte(metrics.period, from),
        lt(metrics.period, to),
      ),
    )
    .groupBy(sql`to_char(${metrics.period}, 'YYYY-MM')`, metrics.metricName);

  const raw: Record<string, Partial<Record<MetricKey, number>>> = {};
  for (const row of rows) {
    const bucket = raw[row.month] ?? {};
    bucket[row.name as MetricKey] = Number(row.sum ?? 0);
    raw[row.month] = bucket;
  }
  for (const month of months) {
    out[month] = computeOrganicKpis(raw[month] ?? {});
  }
  return out;
}

/** The month's top posts for a client, most interactions first (up to `limit`). */
export async function topPostsForMonth(
  orgId: string,
  clientId: string,
  periodMonth: string,
  limit = 3,
): Promise<ReportPostRow[]> {
  const { from, to } = monthBounds(periodMonth);
  const rows = await db
    .select()
    .from(reportPosts)
    .where(
      and(
        eq(reportPosts.orgId, orgId),
        eq(reportPosts.clientId, clientId),
        gte(reportPosts.period, from),
        lt(reportPosts.period, to),
      ),
    )
    .orderBy(desc(sql`coalesce(${reportPosts.interactions}, 0)`), asc(reportPosts.createdAt))
    .limit(limit);

  return rows.map((row) => {
    const reach = row.reach == null ? 0 : Number(row.reach);
    const interactions = row.interactions == null ? 0 : Number(row.interactions);
    return {
      url: row.url,
      format: row.format,
      reach,
      interactions,
      engagementRate: reach > 0 ? (interactions / reach) * 100 : 0,
    };
  });
}

/** The organic view-model for one client and month. */
async function getOrganicReportData(
  orgId: string,
  clientId: string,
  periodMonth: string,
  prevMonth: string,
  trendMonths: string[],
): Promise<OrganicReportData> {
  const [byMonth, posts] = await Promise.all([
    organicKpisByMonth(orgId, clientId, [...new Set([...trendMonths, prevMonth, periodMonth])]),
    topPostsForMonth(orgId, clientId, periodMonth),
  ]);

  return {
    totals: byMonth[periodMonth] ?? emptyKpis(),
    previousTotals: byMonth[prevMonth] ?? emptyKpis(),
    trend: trendMonths.map((month) => ({
      month,
      label: shortMonthLabel(month),
      kpis: byMonth[month] ?? emptyKpis(),
    })),
    topPosts: posts,
  };
}

/**
 * Everything the report template needs for one report. A report covers a single
 * client (`clientId`) with a `profile` that decides which sections render; the
 * legacy org-wide report passes `clientId: null` and always renders as ads.
 * Callers pass the branding (a data URI for the PDF, a URL for the web views).
 */
export async function getReportData(input: {
  orgId: string;
  orgName: string;
  clientId: string | null;
  profile: ReportProfile;
  periodMonth: string;
  generatedAt: string;
  logoUrl?: string | null;
  footer?: string | null;
}): Promise<ReportData> {
  const prevMonth = previousMonth(input.periodMonth);
  const trendMonths = monthsEndingAt(input.periodMonth, TREND_MONTHS);
  const clientIds = input.clientId ? [input.clientId] : [];
  const wantsAds = input.profile === 'ads' || input.profile === 'mixed' || !input.clientId;
  const wantsOrganic =
    Boolean(input.clientId) && (input.profile === 'organic' || input.profile === 'mixed');

  const [clientRow, current, previous, monthly, organic] = await Promise.all([
    input.clientId
      ? db
          .select({ name: clients.name })
          .from(clients)
          .where(and(eq(clients.orgId, input.orgId), eq(clients.id, input.clientId)))
          .limit(1)
      : Promise.resolve([] as Array<{ name: string }>),
    wantsAds
      ? clientKpisForMonth(input.orgId, clientIds, input.periodMonth)
      : Promise.resolve([]),
    wantsAds ? clientKpisForMonth(input.orgId, clientIds, prevMonth) : Promise.resolve([]),
    wantsAds
      ? orgKpisByMonth(input.orgId, clientIds, trendMonths)
      : Promise.resolve({} as Record<string, Kpis>),
    wantsOrganic && input.clientId
      ? getOrganicReportData(
          input.orgId,
          input.clientId,
          input.periodMonth,
          prevMonth,
          trendMonths,
        )
      : Promise.resolve(undefined),
  ]);

  const prevByClient = new Map(previous.map((c) => [c.clientId, c.kpis]));
  const clientRows = current.map((c) => ({
    name: c.clientName,
    kpis: c.kpis,
    previous: prevByClient.get(c.clientId) ?? computeKpis({}),
  }));
  const clientName = input.clientId
    ? (clientRow[0]?.name ?? current[0]?.clientName ?? null)
    : null;

  return {
    orgName: input.orgName,
    clientName,
    profile: input.profile,
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
    organic,
  };
}
