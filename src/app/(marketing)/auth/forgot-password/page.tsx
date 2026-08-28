import Link from 'next/link';
import { forgotPasswordAction } from '@/server/mutations/auth';

const INPUT =
  'rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base text-[var(--fg)] outline-none focus:border-[var(--fg-muted)]';
const BUTTON =
  'rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90';

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: { sent?: string };
}) {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--fg)]">Restablecer contraseña</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Te enviamos un enlace para elegir una nueva.
        </p>
      </div>

      {searchParams.sent ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--fg)]">
          Si el email está registrado, recibirás un enlace para restablecer la contraseña.
        </p>
      ) : (
        <form action={forgotPasswordAction} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
            Email
            <input name="email" type="email" required autoComplete="email" className={INPUT} />
          </label>
          <button type="submit" className={BUTTON}>
            Enviar enlace
          </button>
        </form>
      )}

      <p className="text-sm text-[var(--fg-muted)]">
        <Link href="/auth/signin" className="text-[var(--fg)] underline">
          Volver a iniciar sesión
        </Link>
      </p>
    </main>
  );
}
