import 'server-only';

import { and, eq } from 'drizzle-orm';
import { decryptToken, encryptToken } from '@/lib/crypto';
import { db } from '@/server/db';
import type { PlatformConnection } from '@/server/db/schema';
import { platformConnections } from '@/server/db/schema';

/**
 * Writes for ad-platform connections. Org-scoped like every other mutation —
 * `orgId` is in the WHERE clause, so an id from another tenant matches no row.
 * Tokens are encrypted here (via `encryptToken`) and decrypted only by
 * {@link decryptTokens}, which the sync engine calls.
 */

export type NewConnection = {
  orgId: string;
  clientId: string;
  platform: 'meta' | 'google_ads';
  connectedBy: string;
  accessToken: string;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  scope?: string | null;
};

/**
 * Store a freshly-exchanged OAuth grant as a `pending` connection (the ad
 * account is not chosen yet). Upserts on the `(client_id, platform)` unique
 * index, so re-connecting replaces the tokens.
 */
export async function createDraft(input: NewConnection): Promise<PlatformConnection> {
  const values = {
    orgId: input.orgId,
    clientId: input.clientId,
    platform: input.platform,
    connectedBy: input.connectedBy,
    accessTokenEncrypted: encryptToken(input.accessToken),
    refreshTokenEncrypted: input.refreshToken ? encryptToken(input.refreshToken) : null,
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    scope: input.scope ?? null,
    status: 'pending' as const,
    externalAccountId: null,
    externalAccountName: null,
    lastError: null,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(platformConnections)
    .values(values)
    .onConflictDoUpdate({
      target: [platformConnections.clientId, platformConnections.platform],
      set: values,
    })
    .returning();
  return row;
}

/** Bind the chosen ad account and flip to `connected`. `null` when no row matches. */
export async function finalize(
  orgId: string,
  id: string,
  account: { externalAccountId: string; externalAccountName: string },
): Promise<PlatformConnection | null> {
  const [row] = await db
    .update(platformConnections)
    .set({
      externalAccountId: account.externalAccountId,
      externalAccountName: account.externalAccountName,
      status: 'connected',
      lastError: null,
      updatedAt: new Date(),
    })
    .where(and(eq(platformConnections.orgId, orgId), eq(platformConnections.id, id)))
    .returning();
  return row ?? null;
}

/**
 * Record the outcome of a sync. Called from the sync engine, which already holds
 * a row it fetched org-scoped or via `listConnected` — so this keys on `id`
 * only and never widens access.
 */
export async function updateSyncState(
  id: string,
  patch: {
    status?: PlatformConnection['status'];
    lastError?: string | null;
    lastSyncedAt?: Date | null;
  },
): Promise<void> {
  await db
    .update(platformConnections)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(platformConnections.id, id));
}

/** Disconnect: `status='revoked'`, tokens nulled. Synced metric rows are kept. */
export async function remove(orgId: string, id: string): Promise<void> {
  await db
    .update(platformConnections)
    .set({
      status: 'revoked',
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(platformConnections.orgId, orgId), eq(platformConnections.id, id)));
}

/** Decrypt a connection's stored tokens. The only place tokens are decrypted alongside the sync engine. */
export function decryptTokens(conn: PlatformConnection): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  return {
    accessToken: conn.accessTokenEncrypted ? decryptToken(conn.accessTokenEncrypted) : null,
    refreshToken: conn.refreshTokenEncrypted ? decryptToken(conn.refreshTokenEncrypted) : null,
  };
}
