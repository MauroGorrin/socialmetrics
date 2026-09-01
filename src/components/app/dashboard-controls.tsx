'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { currentMonth, nextMonth, previousMonth } from '@/lib/metrics';

const PROFILES: Array<{ value: string; label: string }> = [
  { value: 'ads', label: 'Ads' },
  { value: 'organic', label: 'Orgánico' },
];

const CONTROL =
  'rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--fg)]';
const QUICK =
  'rounded-[var(--radius-md)] border border-[var(--border)] px-2.5 py-1.5 text-sm text-[var(--text-secondary)] transition-colors duration-150 hover:text-[var(--fg)]';

/**
 * Secondary dashboard controls: the ads/organic profile toggle and the
 * reference-month picker with quick prev/next/current nav. The client filter
 * and the period selector moved to <ClientSwitcher> and <RangeToggle>.
 */
export function DashboardControls({
  month,
  profile,
  showProfileToggle,
}: {
  month: string;
  profile: string;
  showProfileToggle: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function set(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  }

  function setProfile(value: string) {
    const next = new URLSearchParams(params);
    next.set('profile', value);
    next.delete('client'); // a client belongs to one profile's list
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {showProfileToggle ? (
        <div className="inline-flex rounded-[var(--radius-full)] border border-[var(--border)] bg-[var(--surface-1)] p-0.5">
          {PROFILES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setProfile(option.value)}
              aria-pressed={option.value === profile}
              className={`rounded-[var(--radius-full)] px-3 py-1 text-xs font-semibold transition-colors ${
                option.value === profile
                  ? 'bg-[var(--surface)] text-[var(--fg)] shadow-[var(--shadow-xs)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--fg)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => set('month', previousMonth(month))}
          className={QUICK}
          aria-label="Mes anterior"
          title="Mes anterior"
        >
          ←
        </button>
        <input
          type="month"
          value={month}
          onChange={(e) => set('month', e.target.value || null)}
          className={CONTROL}
          aria-label="Mes de referencia"
        />
        <button
          type="button"
          onClick={() => set('month', nextMonth(month))}
          className={QUICK}
          aria-label="Mes siguiente"
          title="Mes siguiente"
        >
          →
        </button>
        {month !== currentMonth() ? (
          <button type="button" onClick={() => set('month', null)} className={QUICK}>
            Actual
          </button>
        ) : null}
      </div>
    </div>
  );
}
