import 'server-only';

import { googleAdsProvider } from '@/server/providers/google-ads';
import { metaProvider } from '@/server/providers/meta';
import type { AdInsightsProvider, DailyInsightRow, Platform } from '@/server/providers/types';

/**
 * Provider factory — a switch, not a barrel. Maps a platform slug to its one
 * provider object.
 *
 * `ADS_PROVIDER_STUB=1` swaps in a fixture-backed provider that never leaves the
 * machine — the e2e path. The variable is set only in the e2e environment and
 * must never be set on Vercel; the `VERCEL` guard makes that explicit.
 */
export function getProvider(platform: Platform): AdInsightsProvider {
  if (process.env.ADS_PROVIDER_STUB === '1' && process.env.VERCEL !== '1') {
    return stubProvider(platform);
  }
  switch (platform) {
    case 'meta':
      return metaProvider;
    case 'google_ads':
      return googleAdsProvider;
    default: {
      const exhaustive: never = platform;
      throw new Error(`Unknown ad platform: ${String(exhaustive)}`);
    }
  }
}

/** Test-only: a provider that returns fixed insight rows and never makes a network call. */
function stubProvider(platform: Platform): AdInsightsProvider {
  return {
    platform,
    async exchangeCode() {
      return {
        accessToken: 'stub-access-token',
        refreshToken: 'stub-refresh-token',
        expiresAt: new Date(Date.now() + 60 * 24 * 3_600_000),
        scope: 'stub',
      };
    },
    async refreshTokens(tokens) {
      return tokens;
    },
    async listAdAccounts() {
      return [{ id: 'stub-account-1', name: 'Cuenta de prueba' }];
    },
    async fetchDailyInsights(_tokens, _accountId, from, to): Promise<DailyInsightRow[]> {
      const mk = (date: string, spend: number): DailyInsightRow => ({
        date,
        impressions: spend * 25,
        clicks: spend,
        spend,
        conversions: Math.round(spend / 20),
        conversion_value: spend * 6,
      });
      return from === to ? [mk(from, 40)] : [mk(from, 40), mk(to, 55)];
    },
  };
}
