'use client';

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMetric, METRIC_CHART_COLOR, type MetricKey } from '@/lib/metrics';

export type ClientValue = { name: string; value: number };

/** One metric compared across clients — horizontal bars, biggest first. */
export function ComparisonBarChart({
  data,
  metricKey,
}: {
  data: ClientValue[];
  metricKey: MetricKey;
}) {
  const sorted = [...data].sort((a, b) => b.value - a.value);
  const height = Math.max(90, sorted.length * 34 + 16);
  const empty = sorted.every((d) => d.value === 0);

  return (
    <div className="w-full" style={{ height }}>
      {empty ? (
        <div className="flex h-full items-center justify-center text-xs text-[var(--text-secondary)]">
          Sin datos en este período
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={sorted}
            margin={{ top: 4, right: 48, bottom: 4, left: 4 }}
          >
            <XAxis
              type="number"
              tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => formatMetric(metricKey, Number(value))}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fill: 'var(--fg)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: 'var(--surface-1)' }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const entry = payload[0];
                return (
                  <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs shadow-[var(--shadow-md)]">
                    <p className="text-[var(--text-secondary)]">
                      {String((entry.payload as ClientValue).name)}
                    </p>
                    <p className="font-semibold text-[var(--fg)]">
                      {formatMetric(metricKey, Number(entry.value ?? 0))}
                    </p>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="value"
              fill={METRIC_CHART_COLOR[metricKey]}
              radius={[0, 3, 3, 0]}
              maxBarSize={22}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
