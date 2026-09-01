'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatMetric, METRIC_LABELS, type MetricKey } from '@/lib/metrics';

type Chip = { key: MetricKey; label: string };
type Point = { label: string; value: number };

/**
 * The dashboard's hero chart: a header (active metric name + headline value),
 * a row of metric chips, and an area chart of the active metric over the
 * window. Activating a chip sets `?chart_metric=` and preserves every other
 * query param. Themed entirely off CSS custom properties.
 */
export function MetricToggleChart({
  chips,
  active,
  data,
  headline,
}: {
  chips: Chip[];
  active: MetricKey;
  data: Point[];
  headline: { value: string; delta: ReactNode };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function pick(key: MetricKey) {
    const next = new URLSearchParams(params);
    next.set('chart_metric', key);
    router.push(`${pathname}?${next.toString()}`);
  }

  const empty = data.length === 0 || data.every((d) => d.value === 0);

  return (
    <div className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">
            {METRIC_LABELS[active]} · últimos {data.length} meses
          </p>
          <div className="mt-1 flex items-center gap-3">
            <span className="font-mono text-4xl font-bold leading-none tracking-tight text-[var(--fg)]">
              {headline.value}
            </span>
            {headline.delta}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => {
            const on = chip.key === active;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => pick(chip.key)}
                aria-pressed={on}
                className={`rounded-[var(--radius-full)] border px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                  on
                    ? 'border-[var(--primary)] bg-[var(--brand-50)] text-[var(--brand-700)]'
                    : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--border-hover)] hover:text-[var(--fg)]'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-[260px] w-full">
        {empty ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--text-secondary)]">
            Sin datos en este período
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="metric-toggle-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                interval="preserveStartEnd"
              />
              <YAxis
                width={48}
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => formatMetric(active, Number(v))}
              />
              <Tooltip
                cursor={{ stroke: 'var(--border)' }}
                content={({ active: on, payload }) => {
                  if (!on || !payload || payload.length === 0) return null;
                  const point = payload[0];
                  return (
                    <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs shadow-[var(--shadow-md)]">
                      <p className="text-[var(--text-secondary)]">{(point.payload as Point).label}</p>
                      <p className="font-mono font-semibold text-[var(--fg)]">
                        {formatMetric(active, Number(point.value ?? 0))}
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#metric-toggle-grad)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
