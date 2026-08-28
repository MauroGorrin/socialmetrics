import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import type { Client } from '@/server/db/schema';
import { clients } from '@/server/db/schema';

/**
 * Client writes. Every function is org-scoped: the `orgId` argument is part of
 * the WHERE clause on updates/deletes, so an id from another tenant simply
 * matches no row and the caller returns 404. Extended with the full CRUD +
 * pages in E1-T6.
 */

export type NewClient = {
  orgId: string;
  createdBy: string;
  name: string;
  platform: 'meta' | 'google_ads' | 'tiktok' | 'instagram';
};

export async function createClient(input: NewClient): Promise<Client> {
  const [row] = await db
    .insert(clients)
    .values({
      orgId: input.orgId,
      createdBy: input.createdBy,
      name: input.name,
      platform: input.platform,
    })
    .returning();
  return row;
}

/** Update a client's name. `null` when no row in this org matches the id. */
export async function updateClient(
  orgId: string,
  clientId: string,
  patch: { name: string },
): Promise<Client | null> {
  const [row] = await db
    .update(clients)
    .set({ name: patch.name, updatedAt: new Date() })
    .where(and(eq(clients.orgId, orgId), eq(clients.id, clientId), isNull(clients.deletedAt)))
    .returning();
  return row ?? null;
}

/** Soft-delete a client. `false` when no row in this org matches the id. */
export async function softDeleteClient(orgId: string, clientId: string): Promise<boolean> {
  const rows = await db
    .update(clients)
    .set({ deletedAt: new Date() })
    .where(and(eq(clients.orgId, orgId), eq(clients.id, clientId), isNull(clients.deletedAt)))
    .returning({ id: clients.id });
  return rows.length > 0;
}
