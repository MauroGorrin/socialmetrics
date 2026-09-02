import 'server-only';

/**
 * Runtime gate for the ad-platform sync feature. Every integration env var is
 * optional (src/lib/env.ts), so nothing here throws at boot — the feature is
 * simply absent when its credentials are not configured. Reads `process.env`
 * directly rather than the frozen `env` object so a test can vary the vars.
 */

export type MetaConfig = { appId: string; appSecret: string };
export type GoogleAdsConfig = { clientId: string; clientSecret: string; developerToken: string };
export type IntegrationsConfig = { meta: MetaConfig | null; googleAds: GoogleAdsConfig | null };

/** True only when all three cross-platform secrets the flow needs are present. */
function sharedReady(): boolean {
  return Boolean(
    process.env.TOKEN_ENCRYPTION_KEY &&
      process.env.CRON_SECRET &&
      process.env.OAUTH_REDIRECT_BASE_URL,
  );
}

export function integrationsConfig(): IntegrationsConfig {
  const shared = sharedReady();

  const meta: MetaConfig | null =
    shared && process.env.META_APP_ID && process.env.META_APP_SECRET
      ? { appId: process.env.META_APP_ID, appSecret: process.env.META_APP_SECRET }
      : null;

  const googleAds: GoogleAdsConfig | null =
    shared &&
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN
      ? {
          clientId: process.env.GOOGLE_ADS_CLIENT_ID,
          clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET,
          developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
        }
      : null;

  return { meta, googleAds };
}

/** The OAuth callback URL for a platform, built from `OAUTH_REDIRECT_BASE_URL`. */
export function redirectUri(platform: 'meta' | 'google_ads'): string {
  const base = (process.env.OAUTH_REDIRECT_BASE_URL ?? '').replace(/\/+$/, '');
  return `${base}/api/integrations/${platform}/callback`;
}
