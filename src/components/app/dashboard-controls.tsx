'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const PERIODS: Array<{ value: number; label: string }> = [
  { value: 1, label: 'Mes' },
  { value: 3, label: 'Trimestre' },
  { value: 6, label: '6 meses' },
  { value: 12, label: '12 meses' },
];

const CONTROL =
  'rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--fg)]';

const PROFILES: Array<{ value: string; label: string }> = [
  { value: 'ads', label: 'Ads' },
  { value: 'organic', label: 'Orgánico' },
];

/** Profile toggle, client filter, period selector and reference month. */
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
    <div className="flex flex-wrap items-center gap-2">
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
        <select
          value={client}
          onChange={(e) => set('client', e.target.value || null)}
          className={CONTROL}
          aria-label="Cliente"
        >
          <option value="">Todos los clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : null}

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

      <input
        type="month"
        value={month}
        onChange={(e) => set('month', e.target.value || null)}
        className={CONTROL}
        aria-label="Mes de referencia"
      />
    </div>
  );
}
