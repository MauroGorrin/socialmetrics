import 'server-only';

import { firstOfMonth, monthsAgo, today } from '@/lib/metrics';
import { decryptTokens, updateSyncState } from '@/server/mutations/platform-connections';
import { upsertSyncedMetrics } from '@/server/mutations/metrics';
import { getProvider } from '@/server/providers';
import { ProviderAuthError } from '@/server/providers/types';
import type { PlatformConnection } from '@/server/db/schema';

/**
 * The sync engine. `syncConnection` pulls one platform's daily insights for a
 * date window and rewrites that window's `source=<platform>` metric rows. It
 * records the outcome on the connection and **re-throws** any error so the
 * caller (the cron loop, or `syncNowAction`) sees it.
 */

export async function syncConnection(
  conn: PlatformConnection,
  range: { from: string; to: string },
): Promise<{ syncedRows: number }> {
  if (conn.platform !== 'meta' && conn.platform !== 'google_ads') {
    throw new Error(`Unknown platform on connection ${conn.id}`);
  }

  const { accessToken, refreshToken } = decryptTokens(conn);
  if (!accessToken) {
    await updateSyncState(conn.id, {
      status: 'needs_reconnect',
      lastError: 'stored token is missing or unreadable',
    });
    return { syncedRows: 0 };
  }

  if (conn.platform === 'meta' && conn.tokenExpiresAt && conn.tokenExpiresAt.getTime() < Date.now()) {
    await updateSyncState(conn.id, {
      status: 'needs_reconnect',
      lastError: 'Meta long-lived token expired',
    });
    return { syncedRows: 0 };
  }

  const provider = getProvider(conn.platform);
  try {
    const rows = await provider.fetchDailyInsights(
      { accessToken, refreshToken: refreshToken ?? undefined },
      conn.externalAccountId ?? '',
      range.from,
      range.to,
    );
    await upsertSyncedMetrics({
      orgId: conn.orgId,
      clientId: conn.clientId,
      connectedBy: conn.connectedBy,
      source: conn.platform,
      from: range.from,
      to: range.to,
      rows,
    });
    await updateSyncState(conn.id, {
      status: 'connected',
      lastError: null,
      lastSyncedAt: new Date(),
    });
    return { syncedRows: rows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await updateSyncState(conn.id, {
      status: err instanceof ProviderAuthError ? 'needs_reconnect' : 'error',
      lastError: message,
    });
    throw err;
  }
}

/** One-shot 12-month backfill (current month + 11 prior), run when a client connects. */
export async function backfillConnection(conn: PlatformConnection): Promise<{ syncedRows: number }> {
  return syncConnection(conn, { from: firstOfMonth(monthsAgo(11)), to: today() });
}
