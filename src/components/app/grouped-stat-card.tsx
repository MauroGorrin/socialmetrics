import type { ReactNode } from 'react';
import { InlineSparkline } from '@/components/app/inline-sparkline';

type Feature = { label: string; value: string; delta: ReactNode; series: number[] };
type Part = { label: string; value: string; delta: ReactNode };

/**
 * The wide "engagement" card: one featured metric shown large on the left with
 * its delta and sparkline, a divider, and a 2x2 grid of related sub-tiles on
 * the right. All values are pre-formatted strings supplied by the caller.
 */
export function GroupedStatCard({ feature, parts }: { feature: Feature; parts: Part[] }) {
  return (
    <div className="flex flex-1 basis-[460px] flex-wrap items-stretch gap-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex min-w-[150px] flex-1 basis-[160px] flex-col justify-between gap-3">
        <div>
          <span className="text-[0.8125rem] font-semibold text-[var(--text-secondary)]">
            {feature.label}
          </span>
          <div className="mt-2 flex items-end gap-2">
            <span className="font-mono text-[2.5rem] font-bold leading-none tracking-tight text-[var(--fg)]">
              {feature.value}
            </span>
            {feature.delta}
          </div>
        </div>
        <InlineSparkline values={feature.series} width={180} height={40} />
      </div>

      <div className="w-px self-stretch bg-[var(--border)]" aria-hidden />

      <div className="grid flex-1 basis-[215px] grid-cols-2 content-center gap-2.5">
        {parts.map((p) => (
          <div
            key={p.label}
            className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-3"
          >
            <span className="text-[11px] font-semibold text-[var(--text-secondary)]">{p.label}</span>
            <div className="mt-1.5 flex items-baseline justify-between gap-1.5">
              <span className="font-mono text-base font-bold text-[var(--fg)]">{p.value}</span>
              {p.delta}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
