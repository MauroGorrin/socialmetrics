'use client';

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';

export type AddClientFormState = { ok?: boolean; error?: string };

type Props = {
  orgSlug: string;
  /** The `createClientAction` server action, passed in by the page. */
  action: (state: AddClientFormState, formData: FormData) => Promise<AddClientFormState>;
};

const PLATFORM_OPTIONS = [
  { value: 'meta', label: 'Meta' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
] as const;

const FIELD =
  'rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base text-[var(--fg)] outline-none focus:border-[var(--fg-muted)]';

const INITIAL: AddClientFormState = {};

/** "Add client" button + modal form. The only client component on the page. */
export function AddClientDialog({ orgSlug, action }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(action, INITIAL);

  // `state` gets a fresh identity per submission, so this fires once per success.
  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90"
      >
        Agregar cliente
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.45)] p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Agregar cliente"
        >
          <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--background)] p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--fg)]">Nuevo cliente</h2>
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
              <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
                Nombre
                <input name="name" type="text" required className={FIELD} />
              </label>
              <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
                Plataforma
                <select name="platform" defaultValue="meta" className={FIELD}>
                  {PLATFORM_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              {state.error ? (
                <p role="alert" className="text-sm text-[var(--destructive)]">
                  {state.error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded border border-[var(--border)] px-4 py-2 text-sm text-[var(--fg)] transition-opacity duration-150 hover:opacity-70"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90"
                >
                  Crear
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
