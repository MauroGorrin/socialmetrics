import { beforeEach, describe, expect, it, vi } from 'vitest';
import insights from '../fixtures/google-ads-insights.json';

vi.mock('server-only', () => ({}));

// Control the google-ads-api client: Customer().query() returns our fixture (or
// throws), and listAccessibleCustomers() returns a one-line literal.
const queryMock = vi.fn();
const listAccessibleCustomersMock = vi.fn(async () => ({
  resource_names: ['customers/1234567890'],
}));

vi.mock('google-ads-api', () => ({
  GoogleAdsApi: class {
    listAccessibleCustomers = listAccessibleCustomersMock;
    Customer() {
      return { query: queryMock };
    }
  },
}));

beforeEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = 'x'.repeat(44);
  process.env.CRON_SECRET = 'c';
  process.env.OAUTH_REDIRECT_BASE_URL = 'https://app.test';
  process.env.GOOGLE_ADS_CLIENT_ID = 'gid';
  process.env.GOOGLE_ADS_CLIENT_SECRET = 'gsecret';
  process.env.GOOGLE_ADS_DEVELOPER_TOKEN = 'devtok';
  queryMock.mockReset();
});

const TOKENS = { accessToken: 'ya29.access', refreshToken: '1//refresh' };

describe('googleAdsProvider.fetchDailyInsights', () => {
  it('maps cost_micros to spend in currency units', async () => {
    queryMock.mockResolvedValueOnce(insights);
    const { googleAdsProvider } = await import('@/server/providers/google-ads');
    const rows = await googleAdsProvider.fetchDailyInsights(TOKENS, '1234567890', '2026-08-01', '2026-08-03');
    expect(rows[0].spend).toBe(12.5);
  });

  it('returns one DailyInsightRow per fixture row with date from segments.date', async () => {
    queryMock.mockResolvedValueOnce(insights);
    const { googleAdsProvider } = await import('@/server/providers/google-ads');
    const rows = await googleAdsProvider.fetchDailyInsights(TOKENS, '1', '2026-08-01', '2026-08-03');
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.date)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
    expect(rows[0].conversions).toBe(4);
    expect(rows[0].conversion_value).toBe(512.4);
  });

  it('throws ProviderAuthError when the client raises invalid_grant', async () => {
    queryMock.mockRejectedValueOnce(new Error('invalid_grant: token has been expired or revoked'));
    const { googleAdsProvider } = await import('@/server/providers/google-ads');
    const { ProviderAuthError } = await import('@/server/providers/types');
    await expect(
      googleAdsProvider.fetchDailyInsights(TOKENS, '1', '2026-08-01', '2026-08-03'),
    ).rejects.toBeInstanceOf(ProviderAuthError);
  });
});

describe('googleAdsProvider.listAdAccounts', () => {
  it('maps resource_names to AdAccountRef[]', async () => {
    const { googleAdsProvider } = await import('@/server/providers/google-ads');
    expect(await googleAdsProvider.listAdAccounts(TOKENS)).toEqual([
      { id: '1234567890', name: '1234567890' },
    ]);
  });
});

describe('getProvider factory', () => {
  it('returns the provider whose .platform matches the argument', async () => {
    const { getProvider } = await import('@/server/providers');
    expect(getProvider('meta').platform).toBe('meta');
    expect(getProvider('google_ads').platform).toBe('google_ads');
  });
});
