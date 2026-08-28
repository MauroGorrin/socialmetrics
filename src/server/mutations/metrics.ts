import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { metrics } from '@/server/db/schema';

/**
 * Metric writes. Org-scoped like every other mutation — `orgId` is in the
 * WHERE clause, so a metric id from another tenant matches no row. Extended
 * with input/edit in E2-T1.
 */

/** Delete a metric. `false` when no row in this org matches the id. */
export async function deleteMetric(orgId: string, metricId: string): Promise<boolean> {
  const rows = await db
    .delete(metrics)
    .where(and(eq(metrics.orgId, orgId), eq(metrics.id, metricId)))
    .returning({ id: metrics.id });
  return rows.length > 0;
}
