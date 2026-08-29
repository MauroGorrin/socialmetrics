/**
 * Metric vocabulary and the roll-up math shared by the dashboard and the
 * report. The rule that matters: **ratio metrics (CTR, CPL, ROAS) are never
 * summed.** They are recomputed from the summed base metrics; a directly
 * entered ratio is only a fallback for when its base inputs are absent.
 */

/** Metrics that are additive over a period — safe to `sum()`. */
export const BASE_METRICS = [
  'impressions',
  'clicks',
  'spend',
  'conversions',
  'conversion_value',
] as const;

/** Metrics that are ratios — computed, never summed. */
export const RATIO_METRICS = ['ctr', 'cpl', 'roas'] as const;

/**
 * Organic (social-media-management) vocabulary. `reach`/`impressions`/… are
 * additive over a period; `followers_start` / `followers_end` are point-in-time
 * snapshots (never summed across months); the rest are derived.
 */
export const ORGANIC_POINT_METRICS = ['followers_start', 'followers_end'] as const;
export const ORGANIC_SUM_METRICS = [
  'reach',
  'impressions',
  'profile_visits',
  'link_clicks',
  'interactions',
  'posts_published',
  'stories_published',
  'video_views',
] as const;
export const ORGANIC_DERIVED_METRICS = [
  'follower_growth',
  'follower_growth_rate',
  'engagement_rate',
] as const;
export const ORGANIC_METRICS = [
  ...ORGANIC_POINT_METRICS,
  ...ORGANIC_SUM_METRICS,
  ...ORGANIC_DERIVED_METRICS,
] as const;

/**
 * Organic input fields, in the app's canonical entry order — shared by the
 * on-screen monthly grid and the Excel template so the two never drift apart.
 * `impressions` is shared with the ads vocabulary.
 */
export const ORGANIC_FIELD_ORDER: MetricKey[] = [
  'followers_start',
  'followers_end',
  'reach',
  'impressions',
  'interactions',
  'profile_visits',
  'link_clicks',
  'video_views',
  'posts_published',
  'stories_published',
];

/** Organic keys not already covered by the ads vocabulary (`impressions` is shared). */
const ORGANIC_ONLY_KEYS = [
  'followers_start',
  'followers_end',
  'reach',
  'profile_visits',
  'link_clicks',
  'interactions',
  'posts_published',
  'stories_published',
  'video_views',
  'follower_growth',
  'follower_growth_rate',
  'engagement_rate',
] as const;

export const ALL_METRICS = [...BASE_METRICS, ...RATIO_METRICS, ...ORGANIC_ONLY_KEYS] as const;

export type MetricKey = (typeof ALL_METRICS)[number];

export type Kpis = Record<MetricKey, number>;

export type ReportProfile = 'organic' | 'ads' | 'mixed';

export const METRIC_LABELS: Record<MetricKey, string> = {
  impressions: 'Impresiones',
  clicks: 'Clics',
  spend: 'Inversión',
  conversions: 'Conversiones',
  conversion_value: 'Valor de conversión',
  ctr: 'CTR',
  cpl: 'CPL',
  roas: 'ROAS',
  followers_start: 'Seguidores (inicio)',
  followers_end: 'Seguidores (cierre)',
  reach: 'Alcance',
  profile_visits: 'Visitas al perfil',
  link_clicks: 'Clics en el enlace',
  interactions: 'Interacciones',
  posts_published: 'Publicaciones',
  stories_published: 'Historias',
  video_views: 'Reproducciones de video',
  follower_growth: 'Crecimiento de seguidores',
  follower_growth_rate: 'Crecimiento (%)',
  engagement_rate: 'Tasa de interacción',
};

/** Rotating palette for comparing clients on a single chart. */
export const CLIENT_CHART_COLORS = [
  'var(--client-1)',
  'var(--client-2)',
  'var(--client-3)',
  'var(--client-4)',
  'var(--client-5)',
  'var(--client-6)',
  'var(--client-7)',
  'var(--client-8)',
];

/** The chart colour for each metric — CSS custom properties from globals.css. */
export const METRIC_CHART_COLOR: Record<MetricKey, string> = {
  impressions: 'var(--chart-impressions)',
  clicks: 'var(--chart-clicks)',
  spend: 'var(--chart-spend)',
  conversions: 'var(--chart-conversions)',
  conversion_value: 'var(--chart-conversion_value)',
  ctr: 'var(--chart-ctr)',
  cpl: 'var(--chart-cpl)',
  roas: 'var(--chart-roas)',
  followers_start: 'var(--chart-followers_end)',
  followers_end: 'var(--chart-followers_end)',
  reach: 'var(--chart-reach)',
  profile_visits: 'var(--chart-profile_visits)',
  link_clicks: 'var(--chart-link_clicks)',
  interactions: 'var(--chart-interactions)',
  posts_published: 'var(--chart-posts_published)',
  stories_published: 'var(--chart-stories_published)',
  video_views: 'var(--chart-video_views)',
  follower_growth: 'var(--chart-follower_growth)',
  follower_growth_rate: 'var(--chart-follower_growth)',
  engagement_rate: 'var(--chart-engagement_rate)',
};

/** Ratios where a smaller number is the better result (only CPL). */
export const LOWER_IS_BETTER: Partial<Record<MetricKey, boolean>> = { cpl: true };

/** Metrics whose movement is neither good nor bad on its own. */
export const NEUTRAL_METRICS: Partial<Record<MetricKey, boolean>> = {
  spend: true,
  followers_start: true,
};

export function isBaseMetric(name: string): name is (typeof BASE_METRICS)[number] {
  return (BASE_METRICS as readonly string[]).includes(name);
}

export function isOrganicSumMetric(name: string): name is (typeof ORGANIC_SUM_METRICS)[number] {
  return (ORGANIC_SUM_METRICS as readonly string[]).includes(name);
}

export function isOrganicPointMetric(name: string): name is (typeof ORGANIC_POINT_METRICS)[number] {
  return (ORGANIC_POINT_METRICS as readonly string[]).includes(name);
}

/**
 * The metric keys a given profile's monthly entry covers — the on-screen
 * grid, the server action that reads its fields, and the Excel template all
 * share this so the field set can't drift between them.
 */
export function keysForProfile(profile: ReportProfile): MetricKey[] {
  if (profile === 'ads') return [...BASE_METRICS];
  if (profile === 'organic') return [...ORGANIC_FIELD_ORDER];
  // mixed: ads + organic, with the shared `impressions` counted once.
  return [...new Set<MetricKey>([...BASE_METRICS, ...ORGANIC_FIELD_ORDER])];
}

const ZERO_KPIS: Kpis = Object.fromEntries(ALL_METRICS.map((key) => [key, 0])) as Kpis;

export function emptyKpis(): Kpis {
  return { ...ZERO_KPIS };
}

/**
 * Combine summed base metrics (and, only as a fallback, the average of any
 * directly entered ratio values) into the full KPI set. Ratios come from the
 * base metrics whenever their inputs are present.
 */
export function computeKpis(
  sums: Partial<Record<MetricKey, number>>,
  ratioFallback: Partial<Record<MetricKey, number>> = {},
): Kpis {
  const impressions = sums.impressions ?? 0;
  const clicks = sums.clicks ?? 0;
  const spend = sums.spend ?? 0;
  const conversions = sums.conversions ?? 0;
  const conversionValue = sums.conversion_value ?? 0;

  return {
    ...ZERO_KPIS,
    impressions,
    clicks,
    spend,
    conversions,
    conversion_value: conversionValue,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : (ratioFallback.ctr ?? 0),
    cpl: conversions > 0 ? spend / conversions : (ratioFallback.cpl ?? 0),
    // ROAS needs both sides; with no conversion value we can't compute it, so
    // fall back to whatever ratio was entered directly.
    roas:
      spend > 0 && conversionValue > 0
        ? conversionValue / spend
        : (ratioFallback.roas ?? 0),
  };
}

/** Sum two KPI sets' base metrics and recompute the ratios from the result. */
export function addKpis(a: Kpis, b: Kpis): Kpis {
  return computeKpis({
    impressions: a.impressions + b.impressions,
    clicks: a.clicks + b.clicks,
    spend: a.spend + b.spend,
    conversions: a.conversions + b.conversions,
    conversion_value: a.conversion_value + b.conversion_value,
  });
}

/**
 * Assemble the organic KPI set from one month's raw figures. `followers_start` /
 * `followers_end` are taken as given; `follower_growth`, its rate and the
 * engagement rate are derived. Engagement rate is interactions ÷ reach (× 100),
 * falling back to interactions ÷ closing followers when reach is absent.
 */
export function computeOrganicKpis(values: Partial<Record<MetricKey, number>>): Kpis {
  const followersStart = values.followers_start ?? 0;
  const followersEnd = values.followers_end ?? 0;
  const reach = values.reach ?? 0;
  const interactions = values.interactions ?? 0;
  const growth = followersEnd - followersStart;

  return {
    ...ZERO_KPIS,
    followers_start: followersStart,
    followers_end: followersEnd,
    reach,
    impressions: values.impressions ?? 0,
    profile_visits: values.profile_visits ?? 0,
    link_clicks: values.link_clicks ?? 0,
    interactions,
    posts_published: values.posts_published ?? 0,
    stories_published: values.stories_published ?? 0,
    video_views: values.video_views ?? 0,
    follower_growth: growth,
    follower_growth_rate: followersStart > 0 ? (growth / followersStart) * 100 : 0,
    engagement_rate:
      reach > 0
        ? (interactions / reach) * 100
        : followersEnd > 0
          ? (interactions / followersEnd) * 100
          : 0,
  };
}

/**
 * Combine two clients' organic KPIs for the same month: additive metrics add,
 * follower counts add (total audience), and the rates are recomputed. To roll a
 * single client across months use {@link aggregateOrganicKpis} instead — there
 * follower counts are snapshots, not sums.
 */
export function addOrganicKpis(a: Kpis, b: Kpis): Kpis {
  const values: Partial<Record<MetricKey, number>> = {
    followers_start: a.followers_start + b.followers_start,
    followers_end: a.followers_end + b.followers_end,
  };
  for (const key of ORGANIC_SUM_METRICS) {
    values[key] = a[key] + b[key];
  }
  return computeOrganicKpis(values);
}

/**
 * Roll one series of monthly organic KPIs into a single figure for the window:
 * additive metrics are summed, `followers_start` comes from the earliest month
 * with data and `followers_end` from the latest, and the rates are recomputed.
 */
export function aggregateOrganicKpis(byMonth: Record<string, Kpis>, months: string[]): Kpis {
  if (months.length === 0) return emptyKpis();

  const values: Partial<Record<MetricKey, number>> = {};
  for (const key of ORGANIC_SUM_METRICS) {
    values[key] = months.reduce((acc, month) => acc + (byMonth[month]?.[key] ?? 0), 0);
  }
  // A month with no data reads as 0 for every field — skip those when picking
  // the opening / closing follower snapshots.
  values.followers_start =
    months.map((month) => byMonth[month]?.followers_start ?? 0).find((value) => value > 0) ?? 0;
  values.followers_end =
    [...months]
      .reverse()
      .map((month) => byMonth[month]?.followers_end ?? 0)
      .find((value) => value > 0) ?? 0;

  return computeOrganicKpis(values);
}

/** Percentage change from `prev` to `cur`; `null` when there is no baseline. */
export function pctChange(cur: number, prev: number): number | null {
  if (!Number.isFinite(prev) || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

/**
 * Is a move from `prev` to `cur` a good result for this metric?
 * `null` for neutral metrics (spend) or when there is no baseline / no change.
 */
export function changeIsGood(key: MetricKey, cur: number, prev: number): boolean | null {
  if (NEUTRAL_METRICS[key]) return null;
  const pct = pctChange(cur, prev);
  if (pct === null || Math.round(pct) === 0) return null;
  const wentUp = cur > prev;
  return LOWER_IS_BETTER[key] ? !wentUp : wentUp;
}

const NUM = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });
const NUM2 = new Intl.NumberFormat('es', { maximumFractionDigits: 2 });

/** Human-readable value for a metric: `%` for CTR, `x` for ROAS, else a number. */
export function formatMetric(key: MetricKey, value: number): string {
  switch (key) {
    case 'ctr':
    case 'engagement_rate':
    case 'follower_growth_rate':
      return `${NUM2.format(value)}%`;
    case 'roas':
      return `${NUM2.format(value)}x`;
    case 'spend':
    case 'cpl':
    case 'conversion_value':
      return NUM2.format(value);
    default:
      return NUM.format(value);
  }
}

/** First day of `periodMonth` (`YYYY-MM`) and of the next month, as ISO dates. */
export function monthBounds(periodMonth: string): { from: string; to: string } {
  const [year, month] = periodMonth.split('-').map(Number);
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/** `2026-08` → `2026-08-01`. */
export function firstOfMonth(periodMonth: string): string {
  return `${periodMonth}-01`;
}

/** The current month as `YYYY-MM`. */
export function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

/** `2026-08` → `2026-07`. */
export function previousMonth(periodMonth: string): string {
  const [year, month] = periodMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

/** `2026-08` → `2026-09`. */
export function nextMonth(periodMonth: string): string {
  const [year, month] = periodMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
}

/** The `count` months ending at `endMonth` inclusive, oldest first. */
export function monthsEndingAt(endMonth: string, count: number): string[] {
  const [year, month] = endMonth.split('-').map(Number);
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(Date.UTC(year, month - 1, 1));
    date.setUTCMonth(date.getUTCMonth() - i);
    months.push(date.toISOString().slice(0, 7));
  }
  return months;
}

/** `2026-08` → `agosto de 2026`. */
export function monthLabel(periodMonth: string): string {
  const [year, month] = periodMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    date,
  );
}

/** `2026-08` → `ago`. */
export function shortMonthLabel(periodMonth: string): string {
  const [year, month] = periodMonth.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat('es', { month: 'short', timeZone: 'UTC' }).format(date);
}

/** Combine a per-month KPI map into one figure for the whole window. */
export function aggregateKpis(byMonth: Record<string, Kpis>, months: string[]): Kpis {
  return months.reduce((acc, month) => addKpis(acc, byMonth[month] ?? emptyKpis()), emptyKpis());
}

/** One metric's value across the given months, ready for a chart. */
export function metricSeries(
  monthly: Record<string, Kpis>,
  months: string[],
  metricKey: MetricKey,
): Array<{ label: string; value: number }> {
  return months.map((month) => ({
    label: shortMonthLabel(month),
    value: monthly[month]?.[metricKey] ?? 0,
  }));
}
