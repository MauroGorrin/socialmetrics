import type { Kpis, MetricKey, ReportProfile } from '@/lib/metrics';

/**
 * The report view-model. Lives in `lib` so both the server query that builds it
 * and the (server-only-free) template component can share the type.
 *
 * A report covers one client (or, for the legacy rows, the whole org). Its
 * `profile` decides which sections render: `ads`, `organic`, or `mixed` (both).
 */

export type ReportClientRow = { name: string; kpis: Kpis; previous: Kpis };

export type ReportTrendPoint = { month: string; label: string; kpis: Kpis };

export type ReportPostRow = {
  url: string;
  format: string | null;
  reach: number;
  interactions: number;
  engagementRate: number;
};

/** The organic section's figures for the month. */
export type OrganicReportData = {
  totals: Kpis;
  previousTotals: Kpis;
  trend: ReportTrendPoint[];
  topPosts: ReportPostRow[];
};

export type ReportData = {
  orgName: string;
  /** The client this report is for; `null` for a legacy org-wide report. */
  clientName?: string | null;
  profile: ReportProfile;
  periodMonth: string;
  /** `agosto de 2026` — the month this report covers. */
  periodLabel: string;
  /** `julio de 2026` — the comparison month for the deltas. */
  previousLabel: string;
  generatedAt: string;
  /** Logo for a web view (URL) or the PDF (inlined `data:` URI). */
  logoUrl?: string | null;
  footer?: string | null;
  /** Ads figures. All zeros for a pure-organic report (its section is hidden). */
  totals: Kpis;
  previousTotals: Kpis;
  clients: ReportClientRow[];
  trend: ReportTrendPoint[];
  /** Present for `organic` and `mixed` reports. */
  organic?: OrganicReportData;
};

/** The order metrics appear in the ads KPI grid and the detail table. */
export const REPORT_METRIC_ORDER: MetricKey[] = [
  'impressions',
  'clicks',
  'ctr',
  'spend',
  'conversions',
  'cpl',
  'roas',
];

/** Metrics that get a trend sparkline in the ads section. */
export const REPORT_TREND_METRICS: MetricKey[] = ['impressions', 'clicks', 'spend', 'ctr'];

/** The order metrics appear in the organic KPI grid. */
export const ORGANIC_REPORT_ORDER: MetricKey[] = [
  'followers_end',
  'follower_growth',
  'follower_growth_rate',
  'reach',
  'interactions',
  'engagement_rate',
  'profile_visits',
  'link_clicks',
];

/** The "contenido publicado" row. */
export const ORGANIC_CONTENT_METRICS: MetricKey[] = [
  'posts_published',
  'stories_published',
  'video_views',
  'impressions',
];

/** Metrics that get a trend sparkline in the organic section. */
export const ORGANIC_TREND_METRICS: MetricKey[] = [
  'followers_end',
  'engagement_rate',
  'reach',
  'interactions',
];
