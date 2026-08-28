import Link from 'next/link';
import { signUpAction } from '@/server/mutations/auth';

const INPUT =
  'rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base text-[var(--fg)] outline-none focus:border-[var(--fg-muted)]';
const BUTTON =
  'rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90';

const ERRORS: Record<string, string> = {
  invalid: 'Revisá los datos: nombre, email válido y contraseña de 8+ caracteres.',
  failed: 'No pudimos crear la cuenta. Probá de nuevo.',
  signup: 'No pudimos crear la cuenta. Probá de nuevo en unos minutos.',
  ratelimited: 'Demasiados intentos. Esperá unos minutos y reintentá.',
};

export default function SignUpPage({
  searchParams,
}: {
  searchParams: { error?: string; sent?: string };
}) {
  const error = searchParams.error ? (ERRORS[searchParams.error] ?? ERRORS.failed) : null;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--fg)]">Crear cuenta</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Empezá a generar reportes para tus clientes.
        </p>
      </div>

      {searchParams.sent ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--fg)]">
          Te enviamos un correo de verificación. Abrí el enlace para activar tu cuenta.
        </p>
      ) : (
        <form action={signUpAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
            Nombre
            <input name="name" type="text" required autoComplete="name" className={INPUT} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
            Email
            <input name="email" type="email" required autoComplete="email" className={INPUT} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
            Contraseña
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
            Crear cuenta
          </button>
        </form>
      )}

      <p className="text-sm text-[var(--fg-muted)]">
        ¿Ya tenés cuenta?{' '}
        <Link href="/auth/signin" className="text-[var(--fg)] underline">
          Iniciá sesión
        </Link>
      </p>
    </main>
  );
}
