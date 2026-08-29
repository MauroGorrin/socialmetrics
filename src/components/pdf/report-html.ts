import {
  changeIsGood,
  formatMetric,
  METRIC_LABELS,
  type MetricKey,
  pctChange,
} from '@/lib/metrics';
import type { ReportTrendPoint } from '@/lib/report';

/**
 * Shared HTML-string helpers for the print-safe report. No chart library, no
 * external CSS/fonts, no network — the markup feeds Puppeteer directly and the
 * React wrapper renders the same string on screen.
 */

export const REPORT_CSS = `
  .report { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1E293B; font-size: 13px; }
  .report h1 { margin: 0 0 2px; font-size: 22px; color: #0F172A; }
  .report-sub { margin: 0 0 18px; color: #64748B; }
  .report-logo { max-height: 40px; margin-bottom: 8px; }

  .report-section { margin-bottom: 22px; page-break-inside: avoid; }
  .report-section h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; margin: 0 0 10px; color: #64748B; }
  .report-group-title { font-size: 13px; font-weight: 700; color: #0F172A; margin: 0 0 12px; padding-bottom: 4px; border-bottom: 2px solid #E2E8F0; }

  .report-kpis { display: flex; flex-wrap: wrap; gap: 8px; }
  .report-kpi { border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; min-width: 128px; flex: 1 0 128px; }
  .report-kpi-label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #64748B; }
  .report-kpi-value { display: block; font-size: 18px; font-weight: 700; color: #0F172A; margin: 2px 0; }
  .report-delta { font-size: 10px; font-weight: 600; }
  .report-delta-good { color: #16A34A; }
  .report-delta-bad { color: #DC2626; }
  .report-delta-flat { color: #94A3B8; }

  .report-hero { border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px 16px; margin-bottom: 10px; background: #F8FAFC; }
  .report-hero-num { font-size: 26px; font-weight: 700; color: #0F172A; }
  .report-hero-meta { font-size: 11px; color: #64748B; margin-top: 2px; }

  .report-trend-row { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
  .report-trend-label { width: 120px; font-size: 11px; color: #64748B; }
  .report-trend-now { width: 88px; font-size: 11px; font-weight: 600; color: #0F172A; text-align: right; }
  .report-spark { display: block; }
  .report-spark-empty { color: #94A3B8; font-size: 11px; }
  .report-trend-months { display: flex; gap: 12px; margin-top: 4px; padding-left: 132px; font-size: 9px; color: #94A3B8; }
  .report-trend-months span { width: 40px; }

  .report-bars { display: block; margin-bottom: 10px; }

  .report-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .report-table th, .report-table td { border: 1px solid #E2E8F0; padding: 4px 6px; text-align: left; }
  .report-table th { background: #F8FAFC; }
  .report-table td.num, .report-table th.num { text-align: right; }
  .report-post-url { color: #0F172A; word-break: break-all; }

  .report-empty { color: #64748B; }
  .report-footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #64748B; }
`;

export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `▲ 18%` in the right colour, or a muted note when there is no baseline. */
export function deltaBadge(key: MetricKey, cur: number, prev: number): string {
  const pct = pctChange(cur, prev);
  if (pct === null) {
    return `<span class="report-delta report-delta-flat" data-delta="none">nuevo</span>`;
  }
  const rounded = Math.round(pct);
  if (rounded === 0) {
    return `<span class="report-delta report-delta-flat" data-delta="flat">sin cambios</span>`;
  }
  const good = changeIsGood(key, cur, prev);
  const cls = good === null ? 'report-delta-flat' : good ? 'report-delta-good' : 'report-delta-bad';
  const arrow = rounded > 0 ? '▲' : '▼';
  return `<span class="report-delta ${cls}" data-delta="${rounded > 0 ? 'up' : 'down'}">${arrow} ${Math.abs(rounded)}%</span>`;
}

/** One KPI card: label, value, and a delta vs. the previous period. */
export function kpiCardHtml(key: MetricKey, value: number, previous: number): string {
  return `<div class="report-kpi" data-kpi="${key}">
    <span class="report-kpi-label">${METRIC_LABELS[key]}</span>
    <span class="report-kpi-value">${esc(formatMetric(key, value))}</span>
    ${deltaBadge(key, value, previous)}
  </div>`;
}

export function sparkline(points: number[]): string {
  if (points.every((p) => p === 0)) return '<span class="report-spark-empty">Sin datos</span>';
  const w = 240;
  const h = 30;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const n = points.length;
  const dx = n > 1 ? w / (n - 1) : 0;
  const coords = points.map((p, i) => {
    const x = i * dx;
    const y = h - 3 - ((p - min) / range) * (h - 6);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lastX = ((n - 1) * dx).toFixed(1);
  const lastY = (h - 3 - ((points[n - 1] - min) / range) * (h - 6)).toFixed(1);
  return `<svg class="report-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="tendencia">
    <polyline points="${coords.join(' ')}" fill="none" stroke="#0F172A" stroke-width="1.5" />
    <circle cx="${lastX}" cy="${lastY}" r="2.5" fill="#0F172A" />
  </svg>`;
}

/** A `label · sparkline · current value` row for a trend section. */
export function trendRowHtml(key: MetricKey, trend: ReportTrendPoint[]): string {
  const series = trend.map((t) => t.kpis[key]);
  const now = series[series.length - 1] ?? 0;
  return `<div class="report-trend-row" data-trend="${key}">
    <span class="report-trend-label">${METRIC_LABELS[key]}</span>
    ${sparkline(series)}
    <span class="report-trend-now">${esc(formatMetric(key, now))}</span>
  </div>`;
}

export function trendMonthsHtml(trend: ReportTrendPoint[]): string {
  return `<div class="report-trend-months">${trend
    .map((t) => `<span>${esc(t.label)}</span>`)
    .join('')}</div>`;
}
