'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { currentMonth, nextMonth, previousMonth } from '@/lib/metrics';

const PERIODS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Mes' },
  { value: 3, label: 'Trimestre' },
  { value: 6, label: '6 meses' },
  { value: 12, label: '12 meses' },
];

const PROFILES: Array<{ value: string; label: string }> = [
  { value: 'ads', label: 'Ads' },
  { value: 'organic', label: 'Orgánico' },
];

const CONTROL =
  'rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--fg)]';
const FIELD_LABEL = 'text-xs font-medium uppercase tracking-wide text-[var(--fg-muted)]';
const QUICK_BTN =
  'rounded border border-[var(--border)] px-2.5 py-2 text-sm text-[var(--fg)] transition-opacity duration-150 hover:opacity-70';

/** Profile toggle, client filter, period selector and reference month (with quick month nav). */
export function DashboardControls({
  clients,
  client,
  period,
  month,
  profile,
  showProfileToggle,
}: {
  clients: Array<{ id: string; name: string }>;
  client: string;
  period: number;
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
    <div className="flex flex-wrap items-end gap-3">
      {showProfileToggle ? (
        <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5">
          {PROFILES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setProfile(option.value)}
              aria-pressed={option.value === profile}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                option.value === profile
                  ? 'bg-[var(--surface)] font-medium text-[var(--fg)]'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      {clients.length > 1 ? (
        <label className="flex flex-col gap-1">
          <span className={FIELD_LABEL}>Cliente</span>
          <select
            value={client}
            onChange={(e) => set('client', e.target.value || null)}
            className={CONTROL}
          >
            <option value="">Todos los clientes</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="flex flex-col gap-1">
        <span className={FIELD_LABEL}>Período</span>
        <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5">
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => set('period', String(option.value))}
              aria-pressed={option.value === period}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                option.value === period
                  ? 'bg-[var(--surface)] font-medium text-[var(--fg)]'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className={FIELD_LABEL}>Mes de referencia</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => set('month', previousMonth(month))}
            className={QUICK_BTN}
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
            className={QUICK_BTN}
            aria-label="Mes siguiente"
            title="Mes siguiente"
          >
            →
          </button>
          {month !== currentMonth() ? (
            <button type="button" onClick={() => set('month', null)} className={QUICK_BTN}>
              Mes actual
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
