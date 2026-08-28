'use client';

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';

export type InviteFormState = { ok?: boolean; error?: string };

type Props = {
  orgSlug: string;
  /** `inviteMemberAction`, passed in by the page. */
  action: (state: InviteFormState, formData: FormData) => Promise<InviteFormState>;
};

const FIELD =
  'rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base text-[var(--fg)] outline-none focus:border-[var(--fg-muted)]';

const INITIAL: InviteFormState = {};

export function InviteDialog({ orgSlug, action }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(action, INITIAL);

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
        Invitar miembro
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.45)] p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Invitar miembro"
        >
          <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--background)] p-6 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--fg)]">Invitar miembro</h2>
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
                Email
                <input name="email" type="email" required className={FIELD} />
              </label>
              <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
                Rol
                <select name="role" defaultValue="manager" className={FIELD}>
                  <option value="manager">Gestor</option>
                  <option value="admin">Administrador</option>
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
                  Enviar invitación
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
