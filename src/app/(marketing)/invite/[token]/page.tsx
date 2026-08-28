import { acceptInviteAction } from '@/app/(marketing)/invite/[token]/actions';
import { getInviteByToken } from '@/server/queries/memberships';

const FIELD =
  'rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base text-[var(--fg)] outline-none focus:border-[var(--fg-muted)]';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Dueño',
  admin: 'Administrador',
  manager: 'Gestor',
};

const ERRORS: Record<string, string> = {
  weak: 'La contraseña necesita al menos 8 caracteres.',
  invalid: 'Esta invitación ya fue usada o expiró.',
};

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { error?: string };
}) {
  const invite = await getInviteByToken(params.token);

  if (!invite) {
    return (
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-4 p-6">
        <h1 className="text-2xl font-bold text-[var(--fg)]">Invitación no disponible</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          El enlace no es válido, ya fue usado o pasaron más de 48 horas.
        </p>
      </main>
    );
  }

  const error = searchParams.error ? (ERRORS[searchParams.error] ?? ERRORS.invalid) : null;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--fg)]">Unirte a {invite.org.name}</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Invitación para {invite.email} · {ROLE_LABELS[invite.role] ?? invite.role}
        </p>
      </div>

      <form action={acceptInviteAction} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={params.token} />
        <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
          Elegí una contraseña
          <input
            name="password"
            type="password"
            minLength={8}
            required
            autoComplete="new-password"
            className={FIELD}
          />
        </label>
        {error ? (
          <p role="alert" className="text-sm text-[var(--destructive)]">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90"
        >
          Aceptar y entrar
        </button>
      </form>
    </main>
  );
}
