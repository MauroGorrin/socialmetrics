import { resetPasswordAction } from '@/server/mutations/auth';

const INPUT =
  'rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base text-[var(--fg)] outline-none focus:border-[var(--fg-muted)]';
const BUTTON =
  'rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90';

const ERRORS: Record<string, string> = {
  weak: 'La contraseña necesita al menos 8 caracteres.',
  failed: 'El enlace expiró o no es válido. Pedí uno nuevo.',
};

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const error = searchParams.error ? (ERRORS[searchParams.error] ?? ERRORS.failed) : null;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--fg)]">Elegí una nueva contraseña</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">Mínimo 8 caracteres.</p>
      </div>

      <form action={resetPasswordAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
          Nueva contraseña
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={INPUT}
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-[var(--destructive)]">
            {error}
          </p>
        ) : null}
        <button type="submit" className={BUTTON}>
          Guardar contraseña
        </button>
      </form>
    </main>
  );
}
