import 'server-only';

import { and, eq, isNull } from 'drizzle-orm';
import type { Platform } from '@/lib/client-profile';
import type { ReportProfile } from '@/lib/metrics';
import { db } from '@/server/db';
import type { Client } from '@/server/db/schema';
import { clients } from '@/server/db/schema';

/**
 * Client writes. Every function is org-scoped: the `orgId` argument is part of
 * the WHERE clause on updates/deletes, so an id from another tenant simply
 * matches no row and the caller returns 404.
 */

export type { Platform };

export type NewClient = {
  orgId: string;
  createdBy: string;
  name: string;
  /** Optional — a client is created with just a name + profile. */
  platform?: Platform | null;
  reportProfile?: ReportProfile;
};

export type ClientPatch = {
  name?: string;
  platform?: Platform | null;
  platformAccountId?: string | null;
  reportProfile?: ReportProfile;
};

export async function createClient(input: NewClient): Promise<Client> {
  const [row] = await db
    .insert(clients)
    .values({
      orgId: input.orgId,
      createdBy: input.createdBy,
      name: input.name,
      platform: input.platform ?? null,
      reportProfile: input.reportProfile ?? 'ads',
    })
    .returning();
  return row;
}

/** Update a client's editable fields. `null` when no row in this org matches. */
export async function updateClient(
  orgId: string,
  clientId: string,
  patch: ClientPatch,
): Promise<Client | null> {
  const set: Partial<typeof clients.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.platform !== undefined) set.platform = patch.platform;
  if (patch.platformAccountId !== undefined) set.platformAccountId = patch.platformAccountId;
  if (patch.reportProfile !== undefined) set.reportProfile = patch.reportProfile;

  const [row] = await db
    .update(clients)
    .set(set)
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
