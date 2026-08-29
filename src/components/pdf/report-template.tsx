import { formatMetric, METRIC_LABELS, type MetricKey } from '@/lib/metrics';
import { REPORT_METRIC_ORDER, REPORT_TREND_METRICS, type ReportData } from '@/lib/report';
import {
  esc,
  kpiCardHtml,
  REPORT_CSS,
  trendMonthsHtml,
  trendRowHtml,
} from '@/components/pdf/report-html';
import { organicBodyHtml } from '@/components/pdf/report-organic';

/**
 * Print-safe monthly report. The markup is a plain HTML string (no chart
 * library, no external CSS/fonts, no network) so it can feed Puppeteer
 * directly; the React wrapper renders the same string for the on-screen view.
 *
 * A report's `profile` picks the sections: `ads` (the KPI grid / trend /
 * detail below), `organic` (see report-organic.ts), or `mixed` (both).
 * Ratio metrics arrive already computed — the template never sums metrics.
 */

export { REPORT_CSS };

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

/** The ads section: KPI grid with deltas, a trend, an optional per-client
 *  breakdown (legacy org-wide reports only), and a detail table. */
function adsBodyHtml(data: ReportData): string {
  const kpis = REPORT_METRIC_ORDER.map((key) =>
    kpiCardHtml(key, data.totals[key], data.previousTotals[key]),
  ).join('');

  const trendRows = REPORT_TREND_METRICS.map((key) => trendRowHtml(key, data.trend)).join('');

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

  const groupTitle =
    data.profile === 'mixed' ? '<p class="report-group-title">Gestión de pauta</p>' : '';

  return `${groupTitle}
    <section class="report-section" data-section="kpis">
      <h2>Resumen del mes</h2>
      <div class="report-kpis">${kpis}</div>
    </section>

    <section class="report-section" data-section="tendencia">
      <h2>Tendencia · últimos ${data.trend.length} meses</h2>
      ${trendRows}
      ${trendMonthsHtml(data.trend)}
    </section>

    ${byClientSection}

    <section class="report-section" data-section="detalle">
      <h2>Detalle por cliente</h2>
      <table class="report-table"><thead><tr>${tableHead}</tr></thead><tbody>${tableRows}</tbody></table>
    </section>`;
}

/** The full report body: header, the profile's section(s), and the footer. */
export function reportBodyHtml(data: ReportData): string {
  const wantsAds = data.profile === 'ads' || data.profile === 'mixed';
  const wantsOrganic = (data.profile === 'organic' || data.profile === 'mixed') && Boolean(data.organic);

  const logo = data.logoUrl
    ? `<img class="report-logo" src="${esc(data.logoUrl)}" alt="${esc(data.orgName)}" />`
    : '';
  const forWhom = data.clientName ? ` · ${esc(data.clientName)}` : '';
  const footer = `<footer class="report-footer">${esc(data.footer || data.orgName)}</footer>`;

  return `<article class="report">
    <header>${logo}<h1>${esc(data.orgName)}</h1><p class="report-sub">Reporte mensual${forWhom} · ${esc(data.periodLabel)} · comparado con ${esc(data.previousLabel)} · generado ${esc(data.generatedAt)}</p></header>

    ${wantsOrganic ? organicBodyHtml(data) : ''}
    ${wantsAds ? adsBodyHtml(data) : ''}

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
