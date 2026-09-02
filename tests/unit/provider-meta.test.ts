import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import adAccounts from '../fixtures/meta-adaccounts.json';
import insights from '../fixtures/meta-insights.json';

vi.mock('server-only', () => ({}));

// integrationsConfig() needs the Meta creds present for exchange/refresh; the
// insights + accounts calls only use the token, but keep them set for all cases.
beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'x'.repeat(44);
  process.env.CRON_SECRET = 'c';
  process.env.OAUTH_REDIRECT_BASE_URL = 'https://app.test';
  process.env.META_APP_ID = 'app-1';
  process.env.META_APP_SECRET = 'secret-1';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(...responses: unknown[]) {
  const queue = [...responses];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => queue.shift() ?? { data: [] },
    })),
  );
}

const TOKENS = { accessToken: 'EAAB-long-lived' };

describe('metaProvider.fetchDailyInsights', () => {
  it('maps each day in `data` to a DailyInsightRow with numeric spend', async () => {
    stubFetch(insights);
    const { metaProvider } = await import('@/server/providers/meta');
    const rows = await metaProvider.fetchDailyInsights(TOKENS, '1112223334445', '2026-08-01', '2026-08-03');
    expect(rows).toHaveLength(3);
    expect(rows[0].date).toBe('2026-08-01');
    expect(rows[0].spend).toBe(85.5);
    expect(typeof rows[0].spend).toBe('number');
  });

  it('sums omni_purchase actions into conversions / conversion_value', async () => {
    stubFetch(insights);
    const { metaProvider } = await import('@/server/providers/meta');
    const rows = await metaProvider.fetchDailyInsights(TOKENS, '1', '2026-08-01', '2026-08-03');
    expect(rows[0].conversions).toBe(3);
    expect(rows[0].conversion_value).toBe(420);
    // day 3 has no actions → undefined, not 0
    expect(rows[2].conversions).toBeUndefined();
  });

  it('follows paging.next and concatenates pages', async () => {
    stubFetch(
      { data: [{ date_start: '2026-08-01', spend: '10' }], paging: { next: 'https://graph.facebook.com/next' } },
      { data: [{ date_start: '2026-08-02', spend: '20' }, { date_start: '2026-08-03', spend: '30' }], paging: {} },
    );
    const { metaProvider } = await import('@/server/providers/meta');
    const rows = await metaProvider.fetchDailyInsights(TOKENS, '1', '2026-08-01', '2026-08-03');
    expect(rows.map((r) => r.date)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
  });

  it('throws ProviderAuthError on an OAuthException (code 190)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Session expired', type: 'OAuthException', code: 190 } }),
      })),
    );
    const { metaProvider } = await import('@/server/providers/meta');
    const { ProviderAuthError } = await import('@/server/providers/types');
    await expect(metaProvider.fetchDailyInsights(TOKENS, '1', '2026-08-01', '2026-08-03')).rejects.toBeInstanceOf(
      ProviderAuthError,
    );
  });
});

describe('metaProvider.listAdAccounts', () => {
  it('maps the /me/adaccounts response to AdAccountRef[]', async () => {
    stubFetch(adAccounts);
    const { metaProvider } = await import('@/server/providers/meta');
    const accounts = await metaProvider.listAdAccounts(TOKENS);
    expect(accounts).toEqual([
      { id: '1112223334445', name: 'Acme Corp — Prospecting' },
      { id: '9998887776665', name: 'Acme Corp — Retargeting' },
    ]);
  });
});
