import { DashboardSummary } from '@/components/app/dashboard-summary';
import { KpiCard } from '@/components/app/kpi-card';
import type { Kpis, MetricKey } from '@/lib/metrics';

/**
 * The dashboard's headline numbers: a plain-language summary of the one or
 * two metrics that matter most for this profile, those same metrics as
 * featured cards, then the rest of the profile's KPIs in a smaller grid.
 */
export function HeadlineKpis({
  metricKeys,
  heroKeys,
  totals,
  previous,
}: {
  metricKeys: MetricKey[];
  heroKeys: MetricKey[];
  totals: Kpis;
  previous: Kpis;
}) {
  const restKeys = metricKeys.filter((key) => !heroKeys.includes(key));

  return (
    <div className="space-y-3">
      <DashboardSummary
        items={heroKeys.map((key) => ({ key, current: totals[key], previous: previous[key] }))}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {heroKeys.map((key) => (
          <KpiCard key={key} metricKey={key} value={totals[key]} previous={previous[key]} featured />
        ))}
      </div>
      {restKeys.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {restKeys.map((key) => (
            <KpiCard key={key} metricKey={key} value={totals[key]} previous={previous[key]} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
