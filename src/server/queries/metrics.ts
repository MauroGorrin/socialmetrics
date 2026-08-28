import 'server-only';

import { and, count, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { BASE_METRICS, type MetricKey, monthBounds } from '@/lib/metrics';
import { db } from '@/server/db';
import type { Metric } from '@/server/db/schema';
import { clients, metrics } from '@/server/db/schema';

/**
 * Metric reads. Every function takes `orgId` first and filters by it; the
 * caller resolves `orgId` through the tenant guard, never from the URL.
 */

/** Rows per page in the dashboard metric table. */
export const METRICS_PAGE_SIZE = 100;

export type MetricListRow = Metric & { clientName: string };

export type MetricPage = {
  rows: MetricListRow[];
  total: number;
  page: number;
  pageCount: number;
  hasPrev: boolean;
  hasNext: boolean;
};

type ListOptions = { page?: number; clientId?: string };

function scope(orgId: string, clientId?: string) {
  return clientId
    ? and(eq(metrics.orgId, orgId), eq(metrics.clientId, clientId))
    : eq(metrics.orgId, orgId);
}

/** One page of an org's metrics, newest period first, with the client name joined. */
export async function listMetrics(orgId: string, options: ListOptions = {}): Promise<MetricPage> {
  const where = scope(orgId, options.clientId);

  const [{ total }] = await db.select({ total: count() }).from(metrics).where(where);

  const pageCount = Math.max(1, Math.ceil(total / METRICS_PAGE_SIZE));
  const page = Math.min(Math.max(1, options.page ?? 1), pageCount);

  const rows = await db
    .select({ metric: metrics, clientName: clients.name })
    .from(metrics)
    .innerJoin(clients, eq(clients.id, metrics.clientId))
    .where(where)
    .orderBy(desc(metrics.period), desc(metrics.createdAt))
    .limit(METRICS_PAGE_SIZE)
    .offset((page - 1) * METRICS_PAGE_SIZE);

  return {
    rows: rows.map((r) => ({ ...r.metric, clientName: r.clientName })),
    total,
    page,
    pageCount,
    hasPrev: page > 1,
    hasNext: page < pageCount,
  };
}

/**
 * The month's total per base metric for one client — what the monthly entry
 * grid pre-fills. Sums every row in the month so a client that had day-by-day
 * entries still shows a correct starting figure.
 */
export async function monthlyMetricValues(
  orgId: string,
  clientId: string,
  periodMonth: string,
): Promise<Partial<Record<MetricKey, number>>> {
  const { from, to } = monthBounds(periodMonth);
  const rows = await db
    .select({
      name: metrics.metricName,
      total: sql<string>`sum(${metrics.metricValue})`,
    })
    .from(metrics)
    .where(
      and(
        eq(metrics.orgId, orgId),
        eq(metrics.clientId, clientId),
        inArray(metrics.metricName, [...BASE_METRICS]),
        gte(metrics.period, from),
        lt(metrics.period, to),
      ),
    )
    .groupBy(metrics.metricName);

  return Object.fromEntries(
    rows.map((row) => [row.name, Number(row.total ?? 0)]),
  ) as Partial<Record<MetricKey, number>>;
}

/** How many metrics the org has in total (ignoring any client filter). */
export async function countMetrics(orgId: string): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(metrics)
    .where(eq(metrics.orgId, orgId));
  return total;
}

export type MetricSummary = {
  impressions: number;
  clicks: number;
  spend: number;
  conversionValue: number;
  ctr: number;
  roas: number;
};

/** Aggregate KPI totals for the org (optionally scoped to one client). */
export async function summariseMetrics(
  orgId: string,
  options: { clientId?: string } = {},
): Promise<MetricSummary> {
  const rows = await db
    .select({
      name: metrics.metricName,
      total: sql<string>`sum(${metrics.metricValue})`,
    })
    .from(metrics)
    .where(scope(orgId, options.clientId))
    .groupBy(metrics.metricName);

  const byName = new Map(rows.map((r) => [r.name, Number(r.total ?? 0)]));
  const impressions = byName.get('impressions') ?? 0;
  const clicks = byName.get('clicks') ?? 0;
  const spend = byName.get('spend') ?? 0;
  const conversionValue = byName.get('conversion_value') ?? 0;

  return {
    impressions,
    clicks,
    spend,
    conversionValue,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    roas: spend > 0 ? conversionValue / spend : 0,
  };
}
