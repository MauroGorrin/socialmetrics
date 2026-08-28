'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const OPTIONS = [6, 12] as const;

/** Segmented control for the chart window (6 / 12 months). */
export function RangePicker({ value }: { value: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function select(months: number) {
    const next = new URLSearchParams(params);
    next.set('range', String(months));
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5">
      {OPTIONS.map((months) => (
        <button
          key={months}
          type="button"
          onClick={() => select(months)}
          aria-pressed={months === value}
          className={`rounded-md px-3 py-1 text-sm transition-colors ${
            months === value
              ? 'bg-[var(--surface)] font-medium text-[var(--fg)]'
              : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
          }`}
        >
          {months} meses
        </button>
      ))}
    </div>
  );
}
