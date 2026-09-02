import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `src/lib/integrations.ts` is server-only; stub the guard for Vitest.
vi.mock('server-only', () => ({}));

const KEYS = [
  'TOKEN_ENCRYPTION_KEY',
  'CRON_SECRET',
  'OAUTH_REDIRECT_BASE_URL',
  'META_APP_ID',
  'META_APP_SECRET',
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function setShared() {
  process.env.TOKEN_ENCRYPTION_KEY = 'x'.repeat(44);
  process.env.CRON_SECRET = 'cron-secret';
  process.env.OAUTH_REDIRECT_BASE_URL = 'https://example.test';
}

describe('integrationsConfig', () => {
  it('returns both null when no OAuth vars are set', async () => {
    const { integrationsConfig } = await import('@/lib/integrations');
    expect(integrationsConfig()).toEqual({ meta: null, googleAds: null });
  });

  it('returns a non-null meta and null googleAds when only Meta + shared are set', async () => {
    setShared();
    process.env.META_APP_ID = 'app-123';
    process.env.META_APP_SECRET = 'secret-abc';
    const { integrationsConfig } = await import('@/lib/integrations');
    const cfg = integrationsConfig();
    expect(cfg.meta).toEqual({ appId: 'app-123', appSecret: 'secret-abc' });
    expect(cfg.googleAds).toBeNull();
  });

  it('returns null meta when the Meta vars are set but a shared secret is missing', async () => {
    setShared();
    delete process.env.TOKEN_ENCRYPTION_KEY;
    process.env.META_APP_ID = 'app-123';
    process.env.META_APP_SECRET = 'secret-abc';
    const { integrationsConfig } = await import('@/lib/integrations');
    expect(integrationsConfig().meta).toBeNull();
  });

  it('builds the callback URL from OAUTH_REDIRECT_BASE_URL', async () => {
    process.env.OAUTH_REDIRECT_BASE_URL = 'https://example.test/';
    const { redirectUri } = await import('@/lib/integrations');
    expect(redirectUri('meta')).toBe('https://example.test/api/integrations/meta/callback');
    expect(redirectUri('google_ads')).toBe(
      'https://example.test/api/integrations/google_ads/callback',
    );
  });
});
