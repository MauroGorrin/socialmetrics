import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { signOutAction } from '@/server/mutations/auth';
import { getOrgBySlug, isOrgMember } from '@/server/queries/orgs';

/**
 * Placeholder org dashboard — enough for the auth redirect target to resolve
 * and for membership to be enforced. Replaced by the real dashboard in the
 * metrics epic (E2-T1).
 */
export default async function OrgDashboardPage({
  params,
}: {
  params: { orgSlug: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/signin?redirect=/${params.orgSlug}/dashboard`);

  const org = await getOrgBySlug(params.orgSlug);
  if (!org || !(await isOrgMember(org.id, user.id))) notFound();

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col gap-4 p-6">
      <p className="text-sm text-[var(--fg-muted)]">Panel</p>
      <h1 className="text-2xl font-bold text-[var(--fg)]">{org.name}</h1>
      <p className="text-[var(--fg-muted)]">
        Sesión iniciada como {user.email}. El panel de métricas llega en el próximo paso.
      </p>
      <form action={signOutAction}>
        <button
          type="submit"
          className="rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90"
        >
          Cerrar sesión
        </button>
      </form>
    </main>
  );
}
