import type { ReactNode } from 'react';
import { InlineSparkline } from '@/components/app/inline-sparkline';

/**
 * One compact metric: label, the pre-formatted value in the mono family, a
 * delta badge, and an inline sparkline. The caller formats `value` (via
 * `formatMetric`) — this component never touches numbers.
 */
export function StatCard({
  label,
  value,
  delta,
  series,
}: {
  label: string;
  value: string;
  delta: ReactNode;
  series: number[];
}) {
  return (
    <div className="flex min-w-[165px] flex-1 basis-[175px] flex-col justify-between gap-3 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-semibold text-[var(--text-secondary)]">{label}</span>
        <div className="flex items-end justify-between gap-2">
          <span className="font-mono text-2xl font-bold leading-none tracking-tight text-[var(--fg)]">
            {value}
          </span>
          {delta}
        </div>
      </div>
      <InlineSparkline values={series} />
    </div>
  );
}
