import type { Kpis, MetricKey } from '@/lib/metrics';

/**
 * The report view-model. Lives in `lib` so both the server query that builds it
 * and the (server-only-free) template component can share the type.
 */

export type ReportClientRow = { name: string; kpis: Kpis; previous: Kpis };

export type ReportTrendPoint = { month: string; label: string; kpis: Kpis };

export type ReportData = {
  orgName: string;
  periodMonth: string;
  /** `agosto de 2026` — the month this report covers. */
  periodLabel: string;
  /** `julio de 2026` — the comparison month for the deltas. */
  previousLabel: string;
  generatedAt: string;
  /** Logo for a web view (URL) or the PDF (inlined `data:` URI). */
  logoUrl?: string | null;
  footer?: string | null;
  totals: Kpis;
  previousTotals: Kpis;
  clients: ReportClientRow[];
  trend: ReportTrendPoint[];
};

/** The order metrics appear in the KPI grid and the detail table. */
export const REPORT_METRIC_ORDER: MetricKey[] = [
  'impressions',
  'clicks',
  'ctr',
  'spend',
  'conversions',
  'cpl',
  'roas',
];

/** Metrics that get a trend sparkline (the ones a client actually watches). */
export const REPORT_TREND_METRICS: MetricKey[] = ['impressions', 'clicks', 'spend', 'ctr'];
