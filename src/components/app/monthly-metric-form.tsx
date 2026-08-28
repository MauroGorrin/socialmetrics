'use client';

import { type FormEvent, useState } from 'react';
import {
  BASE_METRICS,
  computeKpis,
  formatMetric,
  METRIC_LABELS,
  type MetricKey,
  RATIO_METRICS,
} from '@/lib/metrics';

type Values = Partial<Record<MetricKey, number>>;

type Props = {
  orgSlug: string;
  clientId: string;
  clientName: string;
  periodMonth: string;
  monthLabel: string;
  initial: Values;
  /** `saveMonthlyMetricsAction`, passed in by the page. */
  action: (formData: FormData) => void | Promise<void>;
};

const FIELD =
  'w-full rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base text-[var(--fg)] outline-none focus:border-[var(--fg-muted)]';

/** Read the base-metric fields straight off the form DOM. */
function readValues(form: HTMLFormElement): Values {
  const out: Values = {};
  for (const key of BASE_METRICS) {
    const field = form.elements.namedItem(key);
    const parsed = field instanceof HTMLInputElement ? Number.parseFloat(field.value) : Number.NaN;
    if (Number.isFinite(parsed)) out[key] = parsed;
  }
  return out;
}

/**
 * One client, one month: an uncontrolled field per base metric with the derived
 * KPIs (CTR / CPL / ROAS) previewed live. Ratios are never entered — they follow
 * from the base figures. The page reloads on save, so `initial` is always fresh.
 */
export function MonthlyMetricForm({
  orgSlug,
  clientId,
  clientName,
  periodMonth,
  monthLabel,
  initial,
  action,
}: Props) {
  const [preview, setPreview] = useState<Values>(initial);
  const kpis = computeKpis(preview);

  function onChange(event: FormEvent<HTMLFormElement>) {
    setPreview(readValues(event.currentTarget));
  }

  return (
    <form
      action={action}
      onChange={onChange}
      className="space-y-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6"
    >
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="periodMonth" value={periodMonth} />

      <div>
        <h2 className="text-lg font-semibold text-[var(--fg)]">{clientName}</h2>
        <p className="text-sm text-[var(--fg-muted)]">
          Totales de {monthLabel}. Deja un campo vacío si no tienes el dato.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {BASE_METRICS.map((key) => (
          <label key={key} className="flex flex-col gap-1 text-sm text-[var(--fg)]">
            {METRIC_LABELS[key]}
            <input
              name={key}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              defaultValue={initial[key] ?? ''}
              className={FIELD}
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-6 rounded border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm">
        {RATIO_METRICS.map((key) => (
          <span key={key} className="text-[var(--fg-muted)]">
            {METRIC_LABELS[key]}{' '}
            <span className="font-semibold text-[var(--fg)]" data-preview={key}>
              {formatMetric(key, kpis[key])}
            </span>
          </span>
        ))}
      </div>

      <button
        type="submit"
        className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90"
      >
        Guardar el mes
      </button>
    </form>
  );
}
