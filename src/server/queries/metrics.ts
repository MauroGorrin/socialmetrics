import 'server-only';

import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { BASE_METRICS, type MetricKey, monthBounds } from '@/lib/metrics';
import { db } from '@/server/db';
import { metrics } from '@/server/db/schema';

/**
 * Metric reads. Every function takes `orgId` first and filters by it; the
 * caller resolves `orgId` through the tenant guard, never from the URL.
 */

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

  return Object.fromEntries(rows.map((row) => [row.name, Number(row.total ?? 0)])) as Partial<
    Record<MetricKey, number>
  >;
}
