'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const RANGES = [
  { value: 1, label: '1M' },
  { value: 3, label: '3M' },
  { value: 6, label: '6M' },
  { value: 12, label: '12M' },
];

/**
 * The period pill-group (1M / 3M / 6M / 12M). Maps to the `period` URL param
 * (values 1 / 3 / 6 / 12 — kept for bookmark compatibility) and preserves
 * every other query param on navigation.
 */
export function RangeToggle({ period }: { period: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(value: number) {
    const next = new URLSearchParams(params);
    next.set('period', String(value));
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="inline-flex items-center gap-0.5 rounded-[var(--radius-full)] border border-[var(--border)] bg-[var(--surface-1)] p-0.5">
      {RANGES.map((r) => {
        const on = r.value === period;
        return (
          <button
            key={r.value}
            type="button"
            onClick={() => set(r.value)}
            aria-pressed={on}
            className={`rounded-[var(--radius-full)] px-3 py-1 text-xs font-semibold transition-colors duration-150 ${
              on
                ? 'bg-[var(--surface)] text-[var(--fg)] shadow-[var(--shadow-xs)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--fg)]'
            }`}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
