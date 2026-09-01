'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import type { BulkCreateState } from '@/app/[orgSlug]/clients/actions';
import { MAX_BULK_CLIENTS } from '@/lib/bulk-clients';

type Props = {
  orgSlug: string;
  /** The `createClientsBulkAction` server action, passed in by the page. */
  action: (state: BulkCreateState, formData: FormData) => Promise<BulkCreateState>;
};

const FIELD =
  'w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-sm text-[var(--fg)] outline-none focus:border-[var(--primary)]';
const PRIMARY_BTN =
  'rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90 disabled:pointer-events-none disabled:opacity-50';
const GHOST_BTN =
  'rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-sm text-[var(--fg)] transition-opacity duration-150 hover:opacity-70';

const INITIAL: BulkCreateState = {};

/** "Agregar varios" — a textarea that creates many clients in one submit. */
export function BulkAddClients({ orgSlug, action }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(action, INITIAL);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className={GHOST_BTN}>
        Agregar varios
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={close}
            className="absolute inset-0 h-full w-full cursor-default bg-[rgba(0,0,0,0.45)]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-add-title"
            className="relative w-full max-w-lg rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--background)] p-6 shadow-[var(--shadow-lg)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="bulk-add-title" className="text-lg font-bold text-[var(--fg)]">
                Agregar varios clientes
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label="Cerrar"
                className="text-[var(--text-secondary)] transition-opacity duration-150 hover:opacity-70"
              >
                ✕
              </button>
            </div>

            {state.ok ? (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-[var(--fg)]">
                  {state.created} cliente{state.created === 1 ? '' : 's'} creado
                  {state.created === 1 ? '' : 's'}.
                </p>
                {state.notes && state.notes.length > 0 ? (
                  <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
                    {state.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : null}
                <button type="button" onClick={close} className={PRIMARY_BTN}>
                  Listo
                </button>
              </div>
            ) : (
              <form action={formAction} className="flex flex-col gap-4">
                <input type="hidden" name="orgSlug" value={orgSlug} />
                <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
                  Un cliente por línea. Opcional: <code>Nombre, tipo</code> (ads · orgánico · ambos).
                  <textarea
                    name="raw"
                    required
                    rows={8}
                    maxLength={8000}
                    placeholder={'Cliente Uno\nCliente Dos, orgánico\nCliente Tres, ambos'}
                    className={FIELD}
                  />
                </label>
                <p className="text-xs text-[var(--text-secondary)]">
                  Hasta {MAX_BULK_CLIENTS} por vez. Sin tipo, se asume Ads.
                </p>

                {state.error ? (
                  <p role="alert" className="text-sm text-[var(--destructive)]">
                    {state.error}
                  </p>
                ) : null}
                {state.notes && state.notes.length > 0 ? (
                  <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
                    {state.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                ) : null}

                <div className="flex justify-end gap-2">
                  <button type="button" onClick={close} className={GHOST_BTN}>
                    Cancelar
                  </button>
                  <button type="submit" className={PRIMARY_BTN}>
                    Crear clientes
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
