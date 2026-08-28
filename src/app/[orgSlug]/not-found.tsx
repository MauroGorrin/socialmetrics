import Link from 'next/link';

/** Themed 404 for anything under `/[orgSlug]/` that does not resolve. */
export default function OrgNotFound() {
  return (
    <div className="mx-auto flex min-h-[60dvh] w-full max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-wide text-[var(--fg-muted)]">
        Error 404
      </p>
      <h1 className="text-2xl font-bold text-[var(--fg)]">No encontramos esta página</h1>
      <p className="text-sm text-[var(--fg-muted)]">
        El enlace puede estar roto o la sección ya no existe.
      </p>
      <Link
        href="/dashboard"
        className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90"
      >
        Volver al panel
      </Link>
    </div>
  );
}
