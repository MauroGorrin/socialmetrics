import 'server-only';

import { and, eq, gte, lt } from 'drizzle-orm';
import { firstOfMonth, type MetricKey, monthBounds } from '@/lib/metrics';
import { db } from '@/server/db';
import type { Metric } from '@/server/db/schema';
import { metrics } from '@/server/db/schema';

/**
 * Metric writes. Org-scoped like every other mutation — `orgId` is in the
 * WHERE clause (or the inserted row), so a metric or client id from another
 * tenant matches no row / is rejected by the caller's client check.
 */

export const METRIC_NAMES = [
  'impressions',
  'clicks',
  'spend',
  'ctr',
  'cpl',
  'roas',
  'conversions',
  'conversion_value',
] as const;

export type MetricName = (typeof METRIC_NAMES)[number];

export type NewMetric = {
  orgId: string;
  clientId: string;
  createdBy: string;
  metricName: MetricName;
  metricValue: number;
  /** ISO date, `YYYY-MM-DD`. */
  period: string;
};

export async function createMetric(input: NewMetric): Promise<Metric> {
  const [row] = await db
    .insert(metrics)
    .values({
      orgId: input.orgId,
      clientId: input.clientId,
      createdBy: input.createdBy,
      metricName: input.metricName,
      metricValue: input.metricValue.toFixed(2),
      period: input.period,
    })
    .returning();
  return row;
}

/**
 * Replace a client's whole month with the figures from the monthly entry grid.
 * Every existing metric row for that client + month (base or ratio, whatever
 * the day) is cleared first, then one row per provided base value is written at
 * the first of the month. The month always reflects exactly what the grid holds,
 * and stale directly-entered CTR/CPL/ROAS rows do not linger.
 */
export async function upsertMonthlyMetrics(input: {
  orgId: string;
  clientId: string;
  actorId: string;
  periodMonth: string;
  values: Partial<Record<MetricKey, number>>;
}): Promise<void> {
  const { from, to } = monthBounds(input.periodMonth);
  const period = firstOfMonth(input.periodMonth);

  const rows = (Object.entries(input.values) as Array<[MetricKey, number | undefined]>)
    .filter(([, value]) => value != null && Number.isFinite(value))
    .map(([metricName, value]) => ({
      orgId: input.orgId,
      clientId: input.clientId,
      createdBy: input.actorId,
      updatedBy: input.actorId,
      metricName,
      metricValue: (value as number).toFixed(2),
      period,
    }));

  await db.transaction(async (tx) => {
    await tx
      .delete(metrics)
      .where(
        and(
          eq(metrics.orgId, input.orgId),
          eq(metrics.clientId, input.clientId),
          gte(metrics.period, from),
          lt(metrics.period, to),
        ),
      );
    if (rows.length > 0) {
      await tx.insert(metrics).values(rows);
    }
  });
}

/** Delete a metric, returning the deleted row (for auditing), or `null`. */
export async function deleteMetric(orgId: string, metricId: string): Promise<Metric | null> {
  const [row] = await db
    .delete(metrics)
    .where(and(eq(metrics.orgId, orgId), eq(metrics.id, metricId)))
    .returning();
  return row ?? null;
}
