import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getOrgBySlug, isOrgMember } from '@/server/queries/orgs';

/**
 * Placeholder org dashboard — enough for the auth redirect target to resolve
 * and for membership to be enforced. The org shell (sidebar/topbar) comes from
 * `src/app/[orgSlug]/layout.tsx`. Replaced by the real dashboard in E2-T1.
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
    <div className="space-y-3">
      <p className="text-sm text-[var(--fg-muted)]">Panel</p>
      <h1 className="text-2xl font-bold text-[var(--fg)]">{org.name}</h1>
      <p className="text-[var(--fg-muted)]">El panel de métricas llega en el próximo paso.</p>
    </div>
  );
}
