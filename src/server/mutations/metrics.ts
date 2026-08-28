import 'server-only';

import { and, eq } from 'drizzle-orm';
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

/** Delete a metric, returning the deleted row (for auditing), or `null`. */
export async function deleteMetric(orgId: string, metricId: string): Promise<Metric | null> {
  const [row] = await db
    .delete(metrics)
    .where(and(eq(metrics.orgId, orgId), eq(metrics.id, metricId)))
    .returning();
  return row ?? null;
}
