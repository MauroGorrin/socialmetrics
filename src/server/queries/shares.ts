import 'server-only';

import { and, eq, gt } from 'drizzle-orm';
import { db } from '@/server/db';
import type { Organization, Report } from '@/server/db/schema';
import { organizations, reports } from '@/server/db/schema';

/**
 * Public share-token lookup. The only report read that runs without a session,
 * so it deliberately reveals nothing: an unknown token, one from another org,
 * or an expired one all resolve to `null` (→ 404).
 */

export type SharedReport = { report: Report; org: Organization };

export async function getReportByShareToken(token: string): Promise<SharedReport | null> {
  if (!token) return null;

  const [row] = await db
    .select({ report: reports, org: organizations })
    .from(reports)
    .innerJoin(organizations, eq(organizations.id, reports.orgId))
    .where(
      and(
        eq(reports.sharedToken, token),
        gt(reports.sharedExpiresAt, new Date()),
      ),
    )
    .limit(1);

  return row ?? null;
}
