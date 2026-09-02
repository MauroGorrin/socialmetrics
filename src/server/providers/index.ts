import 'server-only';

import { googleAdsProvider } from '@/server/providers/google-ads';
import { metaProvider } from '@/server/providers/meta';
import type { AdInsightsProvider, Platform } from '@/server/providers/types';

/**
 * Provider factory — a switch, not a barrel. Maps a platform slug to its one
 * provider object.
 */
export function getProvider(platform: Platform): AdInsightsProvider {
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
