import { formatMetric } from '@/lib/metrics';
import {
  ORGANIC_CONTENT_METRICS,
  ORGANIC_REPORT_ORDER,
  ORGANIC_TREND_METRICS,
  type ReportData,
} from '@/lib/report';
import {
  esc,
  kpiCardHtml,
  trendMonthsHtml,
  trendRowHtml,
} from '@/components/pdf/report-html';

/**
 * The organic (social-media-management) section: community-growth hero, an
 * engagement KPI grid, the month's published content, the best posts, and a
 * trend. Rendered on its own for an `organic` report and above the ads section
 * for a `mixed` one.
 */

const FORMAT_LABELS: Record<string, string> = {
  reel: 'Reel',
  carousel: 'Carrusel',
  image: 'Imagen',
  story: 'Historia',
  video: 'Video',
};

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

export function organicBodyHtml(data: ReportData): string {
  const o = data.organic;
  if (!o) return '';

  const growth = o.totals.follower_growth;
  const sign = growth > 0 ? '+' : '';
  const hero = `<section class="report-section" data-section="organico-resumen">
    <h2>Crecimiento de la comunidad</h2>
    <div class="report-hero">
      <div class="report-hero-num">${sign}${esc(formatMetric('follower_growth', growth))} seguidores</div>
      <div class="report-hero-meta">
        ${esc(formatMetric('followers_start', o.totals.followers_start))} → ${esc(formatMetric('followers_end', o.totals.followers_end))}
        · ${esc(formatMetric('follower_growth_rate', o.totals.follower_growth_rate))}
      </div>
    </div>
    <div class="report-kpis">
      ${ORGANIC_REPORT_ORDER.map((key) =>
        kpiCardHtml(key, o.totals[key], o.previousTotals[key]),
      ).join('')}
    </div>
  </section>`;

  const contenido = `<section class="report-section" data-section="organico-contenido">
    <h2>Contenido publicado</h2>
    <div class="report-kpis">
      ${ORGANIC_CONTENT_METRICS.map((key) =>
        kpiCardHtml(key, o.totals[key], o.previousTotals[key]),
      ).join('')}
    </div>
  </section>`;

  const posts = o.topPosts.length
    ? `<section class="report-section" data-section="organico-posts">
        <h2>Mejores publicaciones</h2>
        <table class="report-table">
          <thead><tr>
            <th>Publicación</th><th>Formato</th>
            <th class="num">Alcance</th><th class="num">Interacciones</th><th class="num">Interacción</th>
          </tr></thead>
          <tbody>
            ${o.topPosts
              .map(
                (post) => `<tr>
                  <td class="report-post-url">${esc(shortUrl(post.url))}</td>
                  <td>${esc(post.format ? (FORMAT_LABELS[post.format] ?? post.format) : '—')}</td>
                  <td class="num">${esc(formatMetric('reach', post.reach))}</td>
                  <td class="num">${esc(formatMetric('interactions', post.interactions))}</td>
                  <td class="num">${esc(formatMetric('engagement_rate', post.engagementRate))}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </section>`
    : '';

  const tendencia = `<section class="report-section" data-section="organico-tendencia">
    <h2>Tendencia · últimos ${o.trend.length} meses</h2>
    ${ORGANIC_TREND_METRICS.map((key) => trendRowHtml(key, o.trend)).join('')}
    ${trendMonthsHtml(o.trend)}
  </section>`;

  const groupTitle =
    data.profile === 'mixed'
      ? '<p class="report-group-title">Gestión de redes</p>'
      : '';

  return groupTitle + hero + contenido + posts + tendencia;
}
