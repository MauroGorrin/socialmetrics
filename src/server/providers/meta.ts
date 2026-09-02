import 'server-only';

import { integrationsConfig, redirectUri } from '@/lib/integrations';
import {
  type AdAccountRef,
  type AdInsightsProvider,
  type DailyInsightRow,
  ProviderAuthError,
} from '@/server/providers/types';

/**
 * Meta Marketing API provider — raw `fetch` against the Graph API. The version
 * is a single module constant; bump it here and nowhere else (see blueprint §20.3).
 */
const V = 'v25.0';
const GRAPH = `https://graph.facebook.com/${V}`;

/** The Meta `action_type`s that count as a conversion (deduped purchase). */
const CONVERSION_ACTION_TYPES = new Set(['omni_purchase', 'purchase']);

type GraphError = { message: string; type?: string; code?: number };

function meta() {
  const cfg = integrationsConfig().meta;
  if (!cfg) throw new Error('Meta integration is not configured');
  return cfg;
}

async function graphGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = (await res.json().catch(() => ({}))) as { error?: GraphError } & T;
  if (json.error) {
    const { code, type, message } = json.error;
    if (code === 190 || type === 'OAuthException') throw new ProviderAuthError(message);
    throw new Error(`Meta API error: ${message}`);
  }
  if (!res.ok) throw new Error(`Meta API returned ${res.status}`);
  return json;
}

function sumActions(
  actions: Array<{ action_type: string; value: string }> | undefined,
): number | undefined {
  if (!actions) return undefined;
  let total = 0;
  let matched = false;
  for (const a of actions) {
    if (CONVERSION_ACTION_TYPES.has(a.action_type)) {
      total += Number(a.value) || 0;
      matched = true;
    }
  }
  return matched ? total : undefined;
}

export const metaProvider: AdInsightsProvider = {
  platform: 'meta',

  async exchangeCode(code) {
    const { appId, appSecret } = meta();
    const short = await graphGet<{ access_token: string }>(
      `${GRAPH}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}` +
        `&redirect_uri=${encodeURIComponent(redirectUri('meta'))}&code=${encodeURIComponent(code)}`,
    );
    return this.refreshTokens({ accessToken: short.access_token });
  },

  async refreshTokens(tokens) {
    const { appId, appSecret } = meta();
    const long = await graphGet<{ access_token: string; expires_in?: number }>(
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}` +
        `&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(tokens.accessToken)}`,
    );
    return {
      accessToken: long.access_token,
      expiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : undefined,
      scope: 'ads_read',
    };
  },

  async listAdAccounts(tokens): Promise<AdAccountRef[]> {
    const json = await graphGet<{
      data: Array<{ id: string; name: string; account_id: string }>;
    }>(`${GRAPH}/me/adaccounts?fields=id,name,account_id&access_token=${tokens.accessToken}`);
    return json.data.map((a) => ({ id: a.account_id ?? a.id.replace(/^act_/, ''), name: a.name }));
  },

  async fetchDailyInsights(tokens, accountId, from, to): Promise<DailyInsightRow[]> {
    const timeRange = encodeURIComponent(JSON.stringify({ since: from, until: to }));
    let url =
      `${GRAPH}/act_${accountId}/insights?fields=impressions,clicks,spend,actions,action_values` +
      `&time_increment=1&time_range=${timeRange}&limit=500&access_token=${tokens.accessToken}`;

    const rows: DailyInsightRow[] = [];
    while (url) {
      const page = await graphGet<{
        data: Array<{
          date_start: string;
          impressions?: string;
          clicks?: string;
          spend?: string;
          actions?: Array<{ action_type: string; value: string }>;
          action_values?: Array<{ action_type: string; value: string }>;
        }>;
        paging?: { next?: string };
      }>(url);

      for (const d of page.data) {
        rows.push({
          date: d.date_start,
          impressions: d.impressions != null ? Number(d.impressions) : undefined,
          clicks: d.clicks != null ? Number(d.clicks) : undefined,
          spend: d.spend != null ? Number(d.spend) : undefined,
          conversions: sumActions(d.actions),
          conversion_value: sumActions(d.action_values),
        });
      }
      url = page.paging?.next ?? '';
    }
    return rows;
  },
};
