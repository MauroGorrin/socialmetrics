/**
 * Print-safe monthly report. The markup is built as a plain HTML string (no
 * chart library, no external CSS/fonts, no network) so it can feed Puppeteer
 * directly; the React wrapper renders the same string for the on-screen view.
 */

export const REPORT_METRICS = [
  { key: 'impressions', label: 'Impresiones' },
  { key: 'clicks', label: 'Clics' },
  { key: 'spend', label: 'Inversión' },
  { key: 'roas', label: 'ROAS' },
  { key: 'ctr', label: 'CTR' },
  { key: 'cpl', label: 'CPL' },
] as const;

export type ReportMetricKey = (typeof REPORT_METRICS)[number]['key'];

export type ReportClient = { name: string; values: Record<ReportMetricKey, number> };

export type ReportData = {
  orgName: string;
  periodMonth: string;
  generatedAt: string;
  clients: ReportClient[];
  /** Org logo for the public view. Omitted for the PDF (no network in print). */
  logoUrl?: string | null;
  /** Footer line for the public view (defaults to the org name). */
  footer?: string | null;
};

export const REPORT_CSS = `
  .report { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color: #1E293B; font-size: 13px; }
  .report h1 { margin: 0 0 4px; font-size: 22px; color: #0F172A; }
  .report-sub { margin: 0 0 16px; color: #64748B; }
  .report-kpis { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
  .report-kpi { border: 1px solid #E2E8F0; border-radius: 8px; padding: 8px 12px; min-width: 130px; }
  .report-kpi-label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #64748B; }
  .report-kpi-value { display: block; font-size: 16px; font-weight: 700; color: #0F172A; }
  .report-section { margin-bottom: 16px; page-break-inside: avoid; }
  .report-section h2 { font-size: 13px; margin: 0 0 6px; color: #0F172A; }
  .report-empty { color: #64748B; }
  .report-table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 11px; }
  .report-table th, .report-table td { border: 1px solid #E2E8F0; padding: 4px 6px; text-align: left; }
  .report-table th { background: #F8FAFC; }
  .report-logo { max-height: 40px; margin-bottom: 8px; }
  .report-footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #E2E8F0; font-size: 11px; color: #64748B; }
`;

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(value: number): string {
  return new Intl.NumberFormat('es', { maximumFractionDigits: 2 }).format(value);
}

function chartSvg(metric: ReportMetricKey, clients: ReportClient[]): string {
  const max = Math.max(1, ...clients.map((c) => c.values[metric]));
  const rowH = 26;
  const width = 460;
  const labelW = 130;
  const barMax = width - labelW - 60;

  const rows = clients
    .map((client, i) => {
      const value = client.values[metric];
      const barLen = Math.max(2, (value / max) * barMax);
      const y = i * rowH + 4;
      return `<text x="0" y="${y + 15}" font-size="11" fill="#64748B">${esc(client.name.slice(0, 20))}</text>
        <rect x="${labelW}" y="${y + 4}" width="${barLen}" height="14" rx="3" fill="#0F172A"></rect>
        <text x="${labelW + barLen + 6}" y="${y + 15}" font-size="11" fill="#1E293B">${fmt(value)}</text>`;
    })
    .join('');

  const height = clients.length * rowH + 8;
  return `<svg class="report-chart" data-metric="${metric}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${metric} por cliente">${rows}</svg>`;
}

/** The report body markup (KPIs, one chart per metric, a totals table). */
export function reportBodyHtml(data: ReportData): string {
  const totals = new Map<string, number>(
    REPORT_METRICS.map((m) => [m.key, data.clients.reduce((s, c) => s + c.values[m.key], 0)]),
  );

  const kpis = REPORT_METRICS.map(
    (m) =>
      `<div class="report-kpi" data-kpi="${m.key}"><span class="report-kpi-label">${m.label} (${m.key})</span><span class="report-kpi-value">${fmt(totals.get(m.key) ?? 0)}</span></div>`,
  ).join('');

  const sections = REPORT_METRICS.map((m) => {
    const chart = data.clients.length
      ? chartSvg(m.key, data.clients)
      : '<p class="report-empty">Sin datos para este período.</p>';
    return `<section class="report-section" data-section="${m.key}"><h2>${m.label} · ${m.key}</h2>${chart}</section>`;
  }).join('');

  const tableRows = data.clients
    .map(
      (c) =>
        `<tr><td>${esc(c.name)}</td>${REPORT_METRICS.map((m) => `<td>${fmt(c.values[m.key])}</td>`).join('')}</tr>`,
    )
    .join('');

  const logo = data.logoUrl
    ? `<img class="report-logo" src="${esc(data.logoUrl)}" alt="${esc(data.orgName)}" />`
    : '';
  const footer = `<footer class="report-footer">${esc(data.footer || data.orgName)}</footer>`;

  return `<article class="report">
    <header>${logo}<h1>${esc(data.orgName)}</h1><p class="report-sub">Reporte mensual · ${esc(data.periodMonth)} · generado ${esc(data.generatedAt)}</p></header>
    <section class="report-kpis">${kpis}</section>
    ${sections}
    <table class="report-table"><thead><tr><th>Cliente</th>${REPORT_METRICS.map((m) => `<th>${m.label}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table>
    ${footer}
  </article>`;
}

/** A full, self-contained HTML document — what Puppeteer prints. */
export function renderReportDocument(data: ReportData): string {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>body{margin:0}${REPORT_CSS}</style></head><body>${reportBodyHtml(data)}</body></html>`;
}

/** On-screen report view — renders the same markup as the PDF. */
export function ReportTemplate({ data }: { data: ReportData }) {
  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: server-built markup from escaped report data */}
      <style dangerouslySetInnerHTML={{ __html: REPORT_CSS }} />
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: server-built markup from escaped report data */}
      <div dangerouslySetInnerHTML={{ __html: reportBodyHtml(data) }} />
    </>
  );
}
