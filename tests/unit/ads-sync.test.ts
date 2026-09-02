import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const fetchDailyInsights = vi.fn();
const upsertSyncedMetrics = vi.fn(async () => {});
const updateSyncState = vi.fn(async () => {});
const decryptTokens = vi.fn(() => ({ accessToken: 'a', refreshToken: 'r' }));

vi.mock('@/server/providers', () => ({
  getProvider: () => ({ platform: 'meta', fetchDailyInsights }),
}));
vi.mock('@/server/mutations/metrics', () => ({ upsertSyncedMetrics }));
vi.mock('@/server/mutations/platform-connections', () => ({ decryptTokens, updateSyncState }));

function conn(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1',
    orgId: 'org-1',
    clientId: 'client-1',
    connectedBy: 'user-1',
    platform: 'meta',
    externalAccountId: '123',
    tokenExpiresAt: null,
    accessTokenEncrypted: 'enc',
    refreshTokenEncrypted: 'enc',
    ...overrides,
  } as never;
}

beforeEach(() => {
  fetchDailyInsights.mockReset();
  upsertSyncedMetrics.mockClear();
  updateSyncState.mockClear();
  decryptTokens.mockReturnValue({ accessToken: 'a', refreshToken: 'r' });
});
afterEach(() => vi.useRealTimers());

describe('syncConnection', () => {
  it('writes rows via upsertSyncedMetrics then marks the connection connected', async () => {
    fetchDailyInsights.mockResolvedValueOnce([
      { date: '2026-08-01', spend: 1 },
      { date: '2026-08-02', spend: 2 },
      { date: '2026-08-03', spend: 3 },
    ]);
    const { syncConnection } = await import('@/server/sync/ads-sync');
    const res = await syncConnection(conn(), { from: '2026-08-01', to: '2026-08-31' });
    expect(res.syncedRows).toBe(3);
    expect(upsertSyncedMetrics).toHaveBeenCalledTimes(1);
    expect(upsertSyncedMetrics.mock.calls[0][0]).toMatchObject({
      source: 'meta',
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(updateSyncState).toHaveBeenLastCalledWith('conn-1', expect.objectContaining({ status: 'connected' }));
  });

  it('maps ProviderAuthError to needs_reconnect and re-throws', async () => {
    const { ProviderAuthError } = await import('@/server/providers/types');
    fetchDailyInsights.mockRejectedValueOnce(new ProviderAuthError('token dead'));
    const { syncConnection } = await import('@/server/sync/ads-sync');
    await expect(syncConnection(conn(), { from: '2026-08-01', to: '2026-08-31' })).rejects.toBeInstanceOf(
      ProviderAuthError,
    );
    expect(updateSyncState).toHaveBeenLastCalledWith(
      'conn-1',
      expect.objectContaining({ status: 'needs_reconnect' }),
    );
  });

  it('maps a generic Error to status=error and re-throws', async () => {
    fetchDailyInsights.mockRejectedValueOnce(new Error('rate limited'));
    const { syncConnection } = await import('@/server/sync/ads-sync');
    await expect(syncConnection(conn(), { from: '2026-08-01', to: '2026-08-31' })).rejects.toThrow('rate limited');
    expect(updateSyncState).toHaveBeenLastCalledWith(
      'conn-1',
      expect.objectContaining({ status: 'error' }),
    );
  });

  it('short-circuits an expired Meta token without calling the provider', async () => {
    const { syncConnection } = await import('@/server/sync/ads-sync');
    await syncConnection(conn({ tokenExpiresAt: new Date(Date.now() - 1000) }), {
      from: '2026-08-01',
      to: '2026-08-31',
    });
    expect(fetchDailyInsights).not.toHaveBeenCalled();
    expect(updateSyncState).toHaveBeenLastCalledWith(
      'conn-1',
      expect.objectContaining({ status: 'needs_reconnect' }),
    );
  });
});

describe('backfillConnection', () => {
  it('requests a window starting the first day of the month 11 months back', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));
    fetchDailyInsights.mockResolvedValueOnce([]);
    const { backfillConnection } = await import('@/server/sync/ads-sync');
    await backfillConnection(conn());
    expect(upsertSyncedMetrics.mock.calls[0][0]).toMatchObject({ from: '2025-10-01' });
  });
});
