import 'server-only';

import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import {
  BASE_METRICS,
  type MetricKey,
  monthBounds,
  ORGANIC_POINT_METRICS,
  ORGANIC_SUM_METRICS,
} from '@/lib/metrics';
import { db } from '@/server/db';
import type { ReportPost } from '@/server/db/schema';
import { metrics, reportPosts } from '@/server/db/schema';

/**
 * Metric reads. Every function takes `orgId` first and filters by it; the
 * caller resolves `orgId` through the tenant guard, never from the URL.
 */

/** Every metric name the entry grid may pre-fill (ads + organic, never a ratio). */
const ENTRY_METRIC_NAMES: string[] = [
  ...BASE_METRICS,
  ...ORGANIC_POINT_METRICS,
  ...ORGANIC_SUM_METRICS,
];

/**
 * The month's total per entry metric for one client — what the monthly grid
 * pre-fills. Sums every row in the month so a client that had day-by-day
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
        inArray(metrics.metricName, ENTRY_METRIC_NAMES),
        gte(metrics.period, from),
        lt(metrics.period, to),
      ),
    )
    .groupBy(metrics.metricName);

  return Object.fromEntries(rows.map((row) => [row.name, Number(row.total ?? 0)])) as Partial<
    Record<MetricKey, number>
  >;
}

/** The month's best-posts list for a client, in entry order. */
export async function monthlyPosts(
  orgId: string,
  clientId: string,
  periodMonth: string,
): Promise<ReportPost[]> {
  const { from, to } = monthBounds(periodMonth);
  return db
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
    .orderBy(asc(reportPosts.createdAt));
}
