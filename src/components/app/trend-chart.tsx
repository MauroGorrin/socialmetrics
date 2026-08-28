'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMetric, METRIC_CHART_COLOR, METRIC_LABELS, type MetricKey } from '@/lib/metrics';

export type TrendPoint = { label: string; value: number };

/** A single metric's monthly trend as a filled area chart, themed and responsive. */
export function TrendChart({
  data,
  metricKey,
  height = 130,
}: {
  data: TrendPoint[];
  metricKey: MetricKey;
  height?: number;
}) {
  const color = METRIC_CHART_COLOR[metricKey];
  const gradientId = `grad-${metricKey}`;
  const empty = data.every((d) => d.value === 0);

  return (
    <div className="w-full" style={{ height }}>
      {empty ? (
        <div className="flex h-full items-center justify-center text-xs text-[var(--fg-muted)]">
          Sin datos en este período
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                <stop offset="100%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--fg-muted)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              interval="preserveStartEnd"
            />
            <YAxis
              width={44}
              tick={{ fill: 'var(--fg-muted)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => formatMetric(metricKey, Number(value))}
            />
            <Tooltip
              cursor={{ stroke: 'var(--border)' }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const point = payload[0];
                const label = (point.payload as TrendPoint).label;
                return (
                  <div className="rounded border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-xs shadow-sm">
                    <p className="text-[var(--fg-muted)]">{label}</p>
                    <p className="font-semibold text-[var(--fg)]">
                      {formatMetric(metricKey, Number(point.value ?? 0))}
                    </p>
                  </div>
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              name={METRIC_LABELS[metricKey]}
              stroke={color}
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={{ r: 2, fill: color, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

/** A chrome-free line — for a metric preview inside a card. */
export function Sparkline({
  data,
  metricKey,
  height = 40,
}: {
  data: TrendPoint[];
  metricKey: MetricKey;
  height?: number;
}) {
  if (data.every((d) => d.value === 0)) {
    return <div style={{ height }} />;
  }
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={METRIC_CHART_COLOR[metricKey]}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
