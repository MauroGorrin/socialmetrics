'use client';

import { useEffect } from 'react';

/**
 * Root error boundary. The server has already logged the failure with a digest;
 * the user sees a plain message and a reference, never a stack trace.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Breadcrumb only — the full error is logged server-side with this digest.
    console.error('client error boundary', error.digest ?? 'no-digest');
  }, [error.digest]);

  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-bold text-[var(--fg)]">Algo salió mal</h1>
      <p className="text-sm text-[var(--fg-muted)]">
        Tuvimos un problema procesando tu pedido. Ya quedó registrado y lo estamos revisando.
      </p>
      {error.digest ? (
        <p className="text-xs text-[var(--fg-muted)]">Referencia: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90"
      >
        Reintentar
      </button>
    </main>
  );
}
