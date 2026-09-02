import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import type { PlatformConnection } from '@/server/db/schema';
import { platformConnections } from '@/server/db/schema';

/**
 * Reads for ad-platform connections. Every function takes `orgId` first and
 * filters by it — the caller gets `orgId` from a guard, never from the URL —
 * except {@link listConnected}, which is the one system-wide query in this
 * codebase (see its comment).
 */

/** Every connection for an org, ordered by platform. */
export async function listForOrg(orgId: string): Promise<PlatformConnection[]> {
  return db
    .select()
    .from(platformConnections)
    .where(eq(platformConnections.orgId, orgId))
    .orderBy(platformConnections.platform);
}

/** Every connection for one client, org-scoped. */
export async function getForClient(
  orgId: string,
  clientId: string,
): Promise<PlatformConnection[]> {
  return db
    .select()
    .from(platformConnections)
    .where(and(eq(platformConnections.orgId, orgId), eq(platformConnections.clientId, clientId)));
}

/** One connection by id, org-scoped. `null` when no row in this org matches. */
export async function getById(orgId: string, id: string): Promise<PlatformConnection | null> {
  const [row] = await db
    .select()
    .from(platformConnections)
    .where(and(eq(platformConnections.orgId, orgId), eq(platformConnections.id, id)))
    .limit(1);
  return row ?? null;
}

/**
 * SYSTEM-WIDE. Only `/api/cron/sync-ads` may call this — it takes no user input
 * and is reachable only behind the `CRON_SECRET` bearer check. Every other read
 * of this table is org-scoped.
 */
export async function listConnected(): Promise<PlatformConnection[]> {
  return db
    .select()
    .from(platformConnections)
    .where(eq(platformConnections.status, 'connected'));
}
