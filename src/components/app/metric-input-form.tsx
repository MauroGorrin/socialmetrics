'use client';

import { useEffect, useRef } from 'react';
import { useFormState } from 'react-dom';

export type AddMetricFormState = { ok?: boolean; error?: string };

type Props = {
  orgSlug: string;
  clients: { id: string; name: string }[];
  metricOptions: { value: string; label: string }[];
  /** `createMetricAction`, passed in by the page. */
  action: (state: AddMetricFormState, formData: FormData) => Promise<AddMetricFormState>;
};

const FIELD =
  'rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--fg)] outline-none focus:border-[var(--fg-muted)]';

const INITIAL: AddMetricFormState = {};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Inline form to add one metric. Resets itself on a successful submit. */
export function MetricInputForm({ orgSlug, clients, metricOptions, action }: Props) {
  const [state, formAction] = useFormState(action, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
    >
      <input type="hidden" name="orgSlug" value={orgSlug} />

      <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
        Cliente
        <select name="clientId" required defaultValue="" className={FIELD}>
          <option value="" disabled>
            Elegí un cliente
          </option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
        Métrica
        <select name="metricName" required defaultValue={metricOptions[0]?.value} className={FIELD}>
          {metricOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
        Valor
        <input
          name="metricValue"
          type="number"
          min="0"
          step="0.01"
          required
          className={`${FIELD} w-32`}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
        Período
        <input name="period" type="date" required defaultValue={today()} className={FIELD} />
      </label>

      <button
        type="submit"
        className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90"
      >
        Agregar métrica
      </button>

      {state.error ? (
        <p role="alert" className="w-full text-sm text-[var(--destructive)]">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
