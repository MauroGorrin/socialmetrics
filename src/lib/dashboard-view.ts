import { METRIC_LABELS, type MetricKey, monthsEndingAt, type ReportProfile } from '@/lib/metrics';

/**
 * Pure selection logic for the dashboard: which metrics belong in which slot
 * for a given profile, how a URL param resolves to a charted metric, and how a
 * period + reference month expand into month windows. No React, no I/O — this
 * is the part worth unit-testing in isolation (`tests/unit/dashboard-view.test.ts`).
 */

export type Chip = { key: MetricKey; label: string };

/** Two lanes only — the dashboard coerces `mixed` to `ads`. */
type Lane = 'ads' | 'organic';

const CHART_CHIPS: Record<Lane, MetricKey[]> = {
  ads: ['impressions', 'clicks', 'spend', 'roas'],
  organic: ['followers_end', 'reach', 'interactions', 'engagement_rate'],
};

const STAT_CARDS: Record<Lane, MetricKey[]> = {
  ads: ['spend', 'cpl', 'conversion_value'],
  organic: ['followers_end', 'follower_growth', 'link_clicks'],
};

const GROUPED_CARD: Record<Lane, { feature: MetricKey; parts: MetricKey[] }> = {
  ads: { feature: 'roas', parts: ['impressions', 'clicks', 'ctr', 'conversions'] },
  organic: {
    feature: 'engagement_rate',
    parts: ['reach', 'interactions', 'profile_visits', 'follower_growth_rate'],
  },
};

function lane(profile: ReportProfile): Lane {
  return profile === 'organic' ? 'organic' : 'ads';
}

/** The metric-toggle chips for the hero chart, each labelled from METRIC_LABELS. */
export function pickChartChips(profile: ReportProfile): Chip[] {
  return CHART_CHIPS[lane(profile)].map((key) => ({ key, label: METRIC_LABELS[key] }));
}

/** Validate a `chart_metric` param against the profile's chips; fall back to the first. */
export function resolveChartMetric(param: string | undefined, profile: ReportProfile): MetricKey {
  const keys = CHART_CHIPS[lane(profile)];
  return keys.includes(param as MetricKey) ? (param as MetricKey) : keys[0];
}

/** The three compact stat cards for the hero row. */
export function pickStatCards(profile: ReportProfile): MetricKey[] {
  return STAT_CARDS[lane(profile)];
}

/** The wide grouped card: one featured metric + four sub-tiles. */
export function pickGroupedCard(profile: ReportProfile): { feature: MetricKey; parts: MetricKey[] } {
  return GROUPED_CARD[lane(profile)];
}

/**
 * Expand a period (1/3/6/12) and reference month into the three month windows
 * the dashboard needs: the current window, the equal-length prior window for
 * deltas, and the trend window (at least 6 months).
 */
export function rangeToMonths(
  period: number,
  refMonth: string,
): { window: string[]; previous: string[]; trend: string[] } {
  const doubleWindow = monthsEndingAt(refMonth, period * 2);
  return {
    previous: doubleWindow.slice(0, period),
    window: doubleWindow.slice(period),
    trend: monthsEndingAt(refMonth, Math.max(period, 6)),
  };
}
