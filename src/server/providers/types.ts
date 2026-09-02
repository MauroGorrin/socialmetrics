/**
 * The contract every ad-platform provider implements. A provider normalizes one
 * platform's API to `DailyInsightRow` (only the five additive base metrics) and
 * exposes the OAuth + ad-account steps the connect flow needs. No provider ever
 * returns a `ctr`/`cpl`/`roas` — those are derived downstream.
 */

export type Platform = 'meta' | 'google_ads';

export type OAuthTokens = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scope?: string;
};

export type AdAccountRef = { id: string; name: string };

export type DailyInsightRow = {
  /** `YYYY-MM-DD` */
  date: string;
  impressions?: number;
  clicks?: number;
  spend?: number;
  conversions?: number;
  conversion_value?: number;
};

export type AdInsightsProvider = {
  platform: Platform;
  /** Exchange an OAuth `code` for tokens (Meta also swaps for a long-lived token here). */
  exchangeCode(code: string): Promise<OAuthTokens>;
  /** Refresh/extend tokens. Meta: `fb_exchange_token`. Google: no-op (the lib refreshes per call). */
  refreshTokens(tokens: OAuthTokens): Promise<OAuthTokens>;
  listAdAccounts(tokens: OAuthTokens): Promise<AdAccountRef[]>;
  fetchDailyInsights(
    tokens: OAuthTokens,
    accountId: string,
    from: string,
    to: string,
  ): Promise<DailyInsightRow[]>;
};

/**
 * Thrown when a provider call fails because the grant itself is dead — expired,
 * revoked, or missing a scope. The sync engine maps this to
 * `platform_connection.status = 'needs_reconnect'`; every other error is
 * transient and becomes `status = 'error'`.
 */
export class ProviderAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProviderAuthError';
  }
}
