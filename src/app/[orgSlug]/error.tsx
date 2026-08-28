'use client';

import { useEffect } from 'react';

/** Tenant-scope error boundary — same contract as the root one. */
export default function OrgError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('client error boundary', error.digest ?? 'no-digest');
  }, [error.digest]);

  return (
    <section className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-[var(--fg)]">Algo salió mal</h1>
      <p className="text-sm text-[var(--fg-muted)]">
        No pudimos cargar esta sección. Ya quedó registrado.
      </p>
      {error.digest ? (
        <p className="text-xs text-[var(--fg-muted)]">Referencia: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="rounded border border-[var(--border)] px-4 py-2 text-sm text-[var(--fg)] transition-opacity duration-150 hover:opacity-70"
      >
        Reintentar
      </button>
    </section>
  );
}
