'use client';

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';

export type SendReportFormState = { ok?: boolean; error?: string; warning?: string };

type Props = {
  orgSlug: string;
  reportId: string;
  /** `sendReportAction`, passed in by the page. */
  action: (state: SendReportFormState, formData: FormData) => Promise<SendReportFormState>;
};

const INITIAL: SendReportFormState = {};

export function SendReportDialog({ orgSlug, reportId, action }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(action, INITIAL);

  useEffect(() => {
    if (state.ok && !state.warning) setOpen(false);
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg)] hover:opacity-70"
      >
        Enviar por email
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.45)] p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Enviar reporte"
        >
          <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--background)] p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--fg)]">Enviar reporte</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
                className="text-[var(--fg-muted)] transition-opacity duration-150 hover:opacity-70"
              >
                ✕
              </button>
            </div>

            <form action={formAction} className="flex flex-col gap-4">
              <input type="hidden" name="orgSlug" value={orgSlug} />
              <input type="hidden" name="reportId" value={reportId} />
              <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
                Destinatarios (uno por línea o separados por coma)
                <textarea
                  name="recipients"
                  required
                  rows={3}
                  className="rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--fg)] outline-none focus:border-[var(--fg-muted)]"
                />
              </label>

              {state.error ? (
                <p role="alert" className="text-sm text-[var(--destructive)]">
                  {state.error}
                </p>
              ) : null}
              {state.ok && state.warning ? (
                <p className="text-sm text-[var(--warning)]">{state.warning}</p>
              ) : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded border border-[var(--border)] px-4 py-2 text-sm text-[var(--fg)] transition-opacity duration-150 hover:opacity-70"
                >
                  Cerrar
                </button>
                <button
                  type="submit"
                  className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90"
                >
                  Enviar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
