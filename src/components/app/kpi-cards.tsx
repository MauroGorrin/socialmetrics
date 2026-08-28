export type KpiItem = { label: string; value: string };

/** Row of KPI summary cards. Presentational — the page formats the values. */
export function KpiCards({ items }: { items: KpiItem[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
        >
          <dt className="text-xs uppercase tracking-wide text-[var(--fg-muted)]">{item.label}</dt>
          <dd className="mt-1 text-xl font-bold text-[var(--fg)]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
