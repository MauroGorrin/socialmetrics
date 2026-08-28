import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import type { Client } from '@/server/db/schema';
import { clients } from '@/server/db/schema';

/**
 * Client reads. Every function takes `orgId` first and filters by it — the
 * caller obtains `orgId` from a guard, never from the URL. Extended with the
 * list/detail pages in E1-T6.
 */

/** Active (not soft-deleted) clients for an org, newest first. */
export async function listClients(orgId: string): Promise<Client[]> {
  return db
    .select()
    .from(clients)
    .where(and(eq(clients.orgId, orgId), isNull(clients.deletedAt)))
    .orderBy(clients.createdAt);
}

/** A single active client scoped to the org, or `null`. */
export async function getClient(orgId: string, clientId: string): Promise<Client | null> {
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.orgId, orgId), eq(clients.id, clientId), isNull(clients.deletedAt)))
    .limit(1);
  return row ?? null;
}
