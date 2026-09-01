'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import type { CreateClientState } from '@/app/[orgSlug]/clients/actions';
import { PROFILE_DESCRIPTIONS, PROFILE_LABELS, REPORT_PROFILES } from '@/lib/client-profile';
import { currentMonth } from '@/lib/metrics';

type Props = {
  orgSlug: string;
  /** The `createClientAction` server action, passed in by the page. */
  action: (state: CreateClientState, formData: FormData) => Promise<CreateClientState>;
};

const FIELD =
  'w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-base text-[var(--fg)] outline-none focus:border-[var(--primary)]';
const PRIMARY_BTN =
  'rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90 disabled:pointer-events-none disabled:opacity-50';
const GHOST_BTN =
  'rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-sm text-[var(--fg)] transition-opacity duration-150 hover:opacity-70 disabled:pointer-events-none disabled:opacity-50';

const INITIAL: CreateClientState = {};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** "Agregar cliente" button + modal. Two fields, then straight into metric entry. */
export function AddClientDialog({ orgSlug, action }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [createdCount, setCreatedCount] = useState(0);
  const [state, formAction] = useFormState(action, INITIAL);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setCreatedCount(0);
    triggerRef.current?.focus();
  }, []);

  // Focus the name field on open; trap Tab and close on Escape while open.
  useEffect(() => {
    if (!open) return;
    nameRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const nodes = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  // Each submission gives `state` a fresh identity, so this fires once per result.
  useEffect(() => {
    if (!state.ok || !state.clientId) return;
    if (state.intent === 'another') {
      formRef.current?.reset();
      setCreatedCount((n) => n + 1);
      nameRef.current?.focus();
      return;
    }
    router.push(`/${orgSlug}/metrics?client=${state.clientId}&month=${currentMonth()}`);
  }, [state, orgSlug, router]);

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className={PRIMARY_BTN}>
        Agregar cliente
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
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-client-title"
            className="relative w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--background)] p-6 shadow-[var(--shadow-lg)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="add-client-title" className="text-lg font-bold text-[var(--fg)]">
                Nuevo cliente
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

            <form ref={formRef} action={formAction} className="flex flex-col gap-5">
              <input type="hidden" name="orgSlug" value={orgSlug} />

              <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
                Nombre
                <input ref={nameRef} name="name" type="text" required maxLength={120} className={FIELD} />
              </label>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm text-[var(--fg)]">Tipo de gestión</legend>
                {REPORT_PROFILES.map((value, index) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-start gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 text-sm text-[var(--fg)] has-[:checked]:border-[var(--primary)] has-[:checked]:bg-[var(--brand-50)]"
                  >
                    <input
                      type="radio"
                      name="reportProfile"
                      value={value}
                      defaultChecked={index === 1}
                      className="mt-0.5 accent-[var(--primary)]"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium">{PROFILE_LABELS[value]}</span>
                      <span className="text-xs text-[var(--text-secondary)]">
                        {PROFILE_DESCRIPTIONS[value]}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>

              {state.error ? (
                <p role="alert" className="text-sm text-[var(--destructive)]">
                  {state.error}
                </p>
              ) : null}

              {createdCount > 0 ? (
                <p className="text-sm text-[var(--text-secondary)]">
                  {createdCount} cliente{createdCount === 1 ? '' : 's'} creado
                  {createdCount === 1 ? '' : 's'}. Cargá el siguiente o cerrá.
                </p>
              ) : null}

              <div className="flex flex-col gap-2">
                <button type="submit" name="intent" value="load" className={PRIMARY_BTN}>
                  Crear y cargar métricas
                </button>
                <button type="submit" name="intent" value="another" className={GHOST_BTN}>
                  Crear y agregar otro
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
