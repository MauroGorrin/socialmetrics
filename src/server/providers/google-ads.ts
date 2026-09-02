import 'server-only';

import { GoogleAdsApi } from 'google-ads-api';
import { integrationsConfig } from '@/lib/integrations';
import {
  type AdAccountRef,
  type AdInsightsProvider,
  type DailyInsightRow,
  type OAuthTokens,
  ProviderAuthError,
} from '@/server/providers/types';

/**
 * Google Ads API provider. The `google-ads-api` library owns OAuth token
 * refresh (per request, from the stored refresh token), the developer-token /
 * login-customer-id headers, and GAQL `searchStream`. We only do the initial
 * code→token exchange (raw `fetch`) and normalize the query rows.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

function google() {
  const cfg = integrationsConfig().googleAds;
  if (!cfg) throw new Error('Google Ads integration is not configured');
  return cfg;
}

function client(): GoogleAdsApi {
  const { clientId, clientSecret, developerToken } = google();
  return new GoogleAdsApi({
    client_id: clientId,
    client_secret: clientSecret,
    developer_token: developerToken,
  });
}

function isAuthError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  return (
    msg.includes('invalid_grant') ||
    msg.includes('unauthenticated') ||
    msg.includes('permission_denied') ||
    msg.includes('user_permission_denied')
  );
}

function num(...candidates: unknown[]): number | undefined {
  for (const c of candidates) {
    if (c != null && Number.isFinite(Number(c))) return Number(c);
  }
  return undefined;
}

export const googleAdsProvider: AdInsightsProvider = {
  platform: 'google_ads',

  async exchangeCode(code): Promise<OAuthTokens> {
    const { clientId, clientSecret } = google();
    const body = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: (process.env.OAUTH_REDIRECT_BASE_URL ?? '').replace(/\/+$/, '') +
        '/api/integrations/google_ads/callback',
      grant_type: 'authorization_code',
    });
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    const json = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
    };
    if (json.error || !json.access_token) {
      if (json.error === 'invalid_grant') throw new ProviderAuthError('Google refused the grant');
      throw new Error(`Google token exchange failed: ${json.error ?? res.status}`);
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : undefined,
      scope: json.scope,
    };
  },

  // The library refreshes the access token per request from the refresh token.
  async refreshTokens(tokens) {
    return tokens;
  },

  async listAdAccounts(tokens): Promise<AdAccountRef[]> {
    if (!tokens.refreshToken) throw new ProviderAuthError('No Google refresh token stored');
    let res: { resource_names?: string[]; resourceNames?: string[] };
    try {
      res = await client().listAccessibleCustomers(tokens.refreshToken);
    } catch (err) {
      if (isAuthError(err)) throw new ProviderAuthError(String(err));
      throw err;
    }
    const names = res.resource_names ?? res.resourceNames ?? [];
    return names.map((rn) => {
      const id = rn.replace(/^customers\//, '');
      return { id, name: id };
    });
  },

  async fetchDailyInsights(tokens, accountId, from, to): Promise<DailyInsightRow[]> {
    if (!tokens.refreshToken) throw new ProviderAuthError('No Google refresh token stored');
    const customer = client().Customer({
      customer_id: accountId,
      refresh_token: tokens.refreshToken,
      login_customer_id: accountId,
    });
    const gaql =
      'SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, ' +
      'metrics.conversions, metrics.conversions_value, segments.date ' +
      `FROM customer WHERE segments.date BETWEEN '${from}' AND '${to}'`;

    let rows: Array<{
      metrics?: Record<string, unknown>;
      segments?: Record<string, unknown>;
    }>;
    try {
      rows = await customer.query(gaql);
    } catch (err) {
      if (isAuthError(err)) throw new ProviderAuthError(String(err));
      throw err;
    }

    return rows.map((row) => {
      const m = row.metrics ?? {};
      const s = row.segments ?? {};
      const costMicros = num(m.cost_micros, m.costMicros);
      return {
        date: String(s.date ?? ''),
        impressions: num(m.impressions),
        clicks: num(m.clicks),
        spend: costMicros != null ? costMicros / 1_000_000 : undefined,
        conversions: num(m.conversions),
        conversion_value: num(m.conversions_value, m.conversionsValue),
      };
    });
  },
};
