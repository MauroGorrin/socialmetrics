import Link from 'next/link';
import { signInAction } from '@/server/mutations/auth';

const INPUT =
  'rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base text-[var(--fg)] outline-none focus:border-[var(--fg-muted)]';
const BUTTON =
  'rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90';

const ERRORS: Record<string, string> = {
  invalid: 'Ingresa un email válido y tu contraseña.',
  credentials: 'Email o contraseña incorrectos.',
};

export default function SignInPage({
  searchParams,
}: {
  searchParams: { error?: string; redirect?: string; reset?: string };
}) {
  const error = searchParams.error ? (ERRORS[searchParams.error] ?? ERRORS.credentials) : null;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--fg)]">Iniciar sesión</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">Accede a tu panel de reportes.</p>
      </div>

      {searchParams.reset ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--fg)]">
          Contraseña actualizada. Inicia sesión con la nueva.
        </p>
      ) : null}

      <form action={signInAction} className="flex flex-col gap-4">
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
            autoComplete="current-password"
            className={INPUT}
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-[var(--destructive)]">
            {error}
          </p>
        ) : null}
        <button type="submit" className={BUTTON}>
          Entrar
        </button>
      </form>

      <div className="flex justify-between text-sm text-[var(--fg-muted)]">
        <Link href="/auth/forgot-password" className="underline">
          Olvidé mi contraseña
        </Link>
        <Link href="/auth/signup" className="text-[var(--fg)] underline">
          Crear cuenta
        </Link>
      </div>
    </main>
  );
}
