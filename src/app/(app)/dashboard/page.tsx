import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { ensurePersonalOrg } from '@/server/mutations/auth';
import { listOrgsByUser } from '@/server/queries/orgs';

/**
 * Post-login landing. Sends the user to their organization's dashboard,
 * creating a personal org on the spot if they somehow have none, and shows a
 * picker only when they belong to more than one.
 */
export default async function DashboardIndexPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/signin?redirect=/dashboard');

  const orgs = await listOrgsByUser(user.id);

  if (orgs.length === 0) {
    const slug = await ensurePersonalOrg({
      id: user.id,
      email: user.email ?? '',
      name: (user.user_metadata?.name as string | undefined) ?? null,
    });
    redirect(`/${slug}/dashboard`);
  }

  if (orgs.length === 1) {
    redirect(`/${orgs[0].slug}/dashboard`);
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-[var(--fg)]">Tus organizaciones</h1>
      <ul className="space-y-2">
        {orgs.map((org) => (
          <li key={org.id}>
            <Link
              href={`/${org.slug}/dashboard`}
              className="block rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--fg)] transition-opacity duration-150 hover:opacity-80"
            >
              {org.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
