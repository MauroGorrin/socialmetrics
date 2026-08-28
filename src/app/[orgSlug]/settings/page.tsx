import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getAccessibleOrg } from '@/server/queries/orgs';

const SECTIONS = [
  {
    slug: 'members',
    title: 'Miembros',
    description: 'Invita a tu equipo y gestiona sus roles.',
  },
  {
    slug: 'branding',
    title: 'Branding',
    description: 'Logo y pie de página que aparecen en los reportes.',
  },
  {
    slug: 'audit',
    title: 'Auditoría',
    description: 'Registro de acciones de la organización.',
    adminOnly: true,
  },
];

export default async function SettingsPage({ params }: { params: { orgSlug: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/signin?redirect=/${params.orgSlug}/settings`);

  const access = await getAccessibleOrg(params.orgSlug, user.id);
  if (!access) notFound();

  const isAdmin = access.role === 'owner' || access.role === 'admin';

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold text-[var(--fg)]">Ajustes</h1>

      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.filter((section) => !section.adminOnly || isAdmin).map((section) => (
          <Link
            key={section.slug}
            href={`/${params.orgSlug}/settings/${section.slug}`}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5 transition-colors duration-150 hover:border-[var(--fg-muted)]"
          >
            <span className="font-semibold text-[var(--fg)]">{section.title}</span>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">{section.description}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
