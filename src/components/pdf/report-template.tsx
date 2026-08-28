import {
  changeIsGood,
  formatMetric,
  METRIC_LABELS,
  type MetricKey,
  pctChange,
} from '@/lib/metrics';
import { REPORT_METRIC_ORDER, REPORT_TREND_METRICS, type ReportData } from '@/lib/report';

/**
 * Print-safe monthly report. The markup is built as a plain HTML string (no
 * chart library, no external CSS/fonts, no network) so it can feed Puppeteer
 * directly; the React wrapper renders the same string for the on-screen view.
 *
 * Ratio metrics (CTR, CPL, ROAS) arrive already computed in `data` — the
 * template never sums metrics.
 */

export const REPORT_CSS = `
  .report { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1E293B; font-size: 13px; }
  .report h1 { margin: 0 0 2px; font-size: 22px; color: #0F172A; }
  .report-sub { margin: 0 0 18px; color: #64748B; }
  .report-logo { max-height: 40px; margin-bottom: 8px; }

  .report-section { margin-bottom: 22px; page-break-inside: avoid; }
  .report-section h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; margin: 0 0 10px; color: #64748B; }

  .report-kpis { display: flex; flex-wrap: wrap; gap: 8px; }
  .report-kpi { border: 1px solid #E2E8F0; border-radius: 8px; padding: 10px 12px; min-width: 128px; flex: 1 0 128px; }
  .report-kpi-label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #64748B; }
  .report-kpi-value { display: block; font-size: 18px; font-weight: 700; color: #0F172A; margin: 2px 0; }
  .report-delta { font-size: 10px; font-weight: 600; }
  .report-delta-good { color: #16A34A; }
  .report-delta-bad { color: #DC2626; }
  .report-delta-flat { color: #94A3B8; }

  .report-trend-row { display: flex; align-items: center; gap: 12px; margin-bottom: 4px; }
  .report-trend-label { width: 96px; font-size: 11px; color: #64748B; }
  .report-trend-now { width: 88px; font-size: 11px; font-weight: 600; color: #0F172A; text-align: right; }
  .report-spark { display: block; }
  .report-spark-empty { color: #94A3B8; font-size: 11px; }
  .report-trend-months { display: flex; gap: 12px; margin-top: 4px; padding-left: 108px; font-size: 9px; color: #94A3B8; }
  .report-trend-months span { width: 40px; }

  .report-bars { display: block; margin-bottom: 10px; }

  .report-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .report-table th, .report-table td { border: 1px solid #E2E8F0; padding: 4px 6px; text-align: left; }
  .report-table th { background: #F8FAFC; }
  .report-table td.num, .report-table th.num { text-align: right; }

  .report-empty { color: #64748B; }
  .report-footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #64748B; }
`;

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** `▲ 18%` in the right colour, or a muted note when there is no baseline. */
function deltaBadge(key: MetricKey, cur: number, prev: number): string {
  const pct = pctChange(cur, prev);
  if (pct === null) {
    return `<span class="report-delta report-delta-flat" data-delta="none">nuevo</span>`;
  }
  const rounded = Math.round(pct);
  if (rounded === 0) {
    return `<span class="report-delta report-delta-flat" data-delta="flat">sin cambios</span>`;
  }
  const good = changeIsGood(key, cur, prev);
  const cls =
    good === null ? 'report-delta-flat' : good ? 'report-delta-good' : 'report-delta-bad';
  const arrow = rounded > 0 ? '▲' : '▼';
  return `<span class="report-delta ${cls}" data-delta="${rounded > 0 ? 'up' : 'down'}">${arrow} ${Math.abs(rounded)}%</span>`;
}

function sparkline(points: number[]): string {
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

function barChart(key: MetricKey, clients: ReportData['clients']): string {
  const max = Math.max(1, ...clients.map((c) => c.kpis[key]));
  const rowH = 22;
  const width = 460;
  const labelW = 120;
  const barMax = width - labelW - 80;

  const rows = clients
    .map((client, i) => {
      const value = client.kpis[key];
      const len = Math.max(2, (value / max) * barMax);
      const y = i * rowH;
      return `<text x="0" y="${y + 14}" font-size="10" fill="#64748B">${esc(client.name.slice(0, 22))}</text>
        <rect x="${labelW}" y="${y + 3}" width="${len.toFixed(1)}" height="12" rx="2" fill="#0F172A"></rect>
        <text x="${(labelW + len + 6).toFixed(1)}" y="${y + 13}" font-size="10" fill="#1E293B">${esc(formatMetric(key, value))}</text>`;
    })
    .join('');

  const height = clients.length * rowH + 4;
  return `<svg class="report-bars" data-metric="${key}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${key} por cliente">${rows}</svg>`;
}

/** The report body markup: KPI grid with deltas, a trend, an optional per-client
 *  breakdown, and a detail table. */
export function reportBodyHtml(data: ReportData): string {
  const kpis = REPORT_METRIC_ORDER.map((key) => {
    const value = data.totals[key];
    const badge = deltaBadge(key, value, data.previousTotals[key]);
    return `<div class="report-kpi" data-kpi="${key}">
      <span class="report-kpi-label">${METRIC_LABELS[key]}</span>
      <span class="report-kpi-value">${esc(formatMetric(key, value))}</span>
      ${badge}
    </div>`;
  }).join('');

  const trendRows = REPORT_TREND_METRICS.map((key) => {
    const series = data.trend.map((t) => t.kpis[key]);
    const now = series[series.length - 1] ?? 0;
    return `<div class="report-trend-row" data-trend="${key}">
      <span class="report-trend-label">${METRIC_LABELS[key]}</span>
      ${sparkline(series)}
      <span class="report-trend-now">${esc(formatMetric(key, now))}</span>
    </div>`;
  }).join('');
  const trendMonths = data.trend
    .map((t) => `<span>${esc(t.label)}</span>`)
    .join('');

  const multiClient = data.clients.length > 1;
  const byClientSection = multiClient
    ? `<section class="report-section" data-section="por-cliente">
        <h2>Por cliente</h2>
        ${REPORT_METRIC_ORDER.map(
          (key) =>
            `<div data-metric-block="${key}"><strong style="font-size:11px">${METRIC_LABELS[key]}</strong>${barChart(key, data.clients)}</div>`,
        ).join('')}
      </section>`
    : '';

  const tableHead = `<th>Cliente</th>${REPORT_METRIC_ORDER.map((k) => `<th class="num">${METRIC_LABELS[k]}</th>`).join('')}`;
  const tableRows = data.clients.length
    ? data.clients
        .map(
          (c) =>
            `<tr><td>${esc(c.name)}</td>${REPORT_METRIC_ORDER.map((k) => `<td class="num">${esc(formatMetric(k, c.kpis[k]))}</td>`).join('')}</tr>`,
        )
        .join('')
    : `<tr><td colspan="${REPORT_METRIC_ORDER.length + 1}" class="report-empty">Sin datos para este período.</td></tr>`;

  const logo = data.logoUrl
    ? `<img class="report-logo" src="${esc(data.logoUrl)}" alt="${esc(data.orgName)}" />`
    : '';
  const footer = `<footer class="report-footer">${esc(data.footer || data.orgName)}</footer>`;

  return `<article class="report">
    <header>${logo}<h1>${esc(data.orgName)}</h1><p class="report-sub">Reporte mensual · ${esc(data.periodLabel)} · comparado con ${esc(data.previousLabel)} · generado ${esc(data.generatedAt)}</p></header>

    <section class="report-section" data-section="kpis">
      <h2>Resumen del mes</h2>
      <div class="report-kpis">${kpis}</div>
    </section>

    <section class="report-section" data-section="tendencia">
      <h2>Tendencia · últimos ${data.trend.length} meses</h2>
      ${trendRows}
      <div class="report-trend-months">${trendMonths}</div>
    </section>

    ${byClientSection}

    <section class="report-section" data-section="detalle">
      <h2>Detalle por cliente</h2>
      <table class="report-table"><thead><tr>${tableHead}</tr></thead><tbody>${tableRows}</tbody></table>
    </section>

    ${footer}
  </article>`;
}

/** A full, self-contained HTML document — what Puppeteer prints. */
export function renderReportDocument(data: ReportData): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>body{margin:0;padding:16px}${REPORT_CSS}</style></head><body>${reportBodyHtml(data)}</body></html>`;
}

/** On-screen report view — renders the same markup as the PDF. */
export function ReportTemplate({ data }: { data: ReportData }) {
  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static stylesheet constant */}
      <style dangerouslySetInnerHTML={{ __html: REPORT_CSS }} />
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: server-built markup from escaped report data */}
      <div dangerouslySetInnerHTML={{ __html: reportBodyHtml(data) }} />
    </>
  );
}
