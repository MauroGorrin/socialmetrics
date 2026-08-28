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

export const ALL_METRICS = [...BASE_METRICS, ...RATIO_METRICS] as const;

export type MetricKey = (typeof ALL_METRICS)[number];

export type Kpis = Record<MetricKey, number>;

export const METRIC_LABELS: Record<MetricKey, string> = {
  impressions: 'Impresiones',
  clicks: 'Clics',
  spend: 'Inversión',
  conversions: 'Conversiones',
  conversion_value: 'Valor de conversión',
  ctr: 'CTR',
  cpl: 'CPL',
  roas: 'ROAS',
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
};

/** Ratios where a smaller number is the better result (only CPL). */
export const LOWER_IS_BETTER: Partial<Record<MetricKey, boolean>> = { cpl: true };

/** Metrics whose movement is neither good nor bad on its own. */
export const NEUTRAL_METRICS: Partial<Record<MetricKey, boolean>> = { spend: true };

export function isBaseMetric(name: string): name is (typeof BASE_METRICS)[number] {
  return (BASE_METRICS as readonly string[]).includes(name);
}

const ZERO_KPIS: Kpis = {
  impressions: 0,
  clicks: 0,
  spend: 0,
  conversions: 0,
  conversion_value: 0,
  ctr: 0,
  cpl: 0,
  roas: 0,
};

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
