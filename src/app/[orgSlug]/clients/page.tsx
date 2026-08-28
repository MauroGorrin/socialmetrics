import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClientAction } from '@/app/[orgSlug]/clients/actions';
import { AddClientDialog } from '@/components/app/add-client-dialog';
import { getCurrentUser } from '@/lib/auth';
import { getAccessibleOrg } from '@/server/queries/orgs';
import { listClients } from '@/server/queries/clients';

const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta',
  google_ads: 'Google Ads',
  tiktok: 'TikTok',
  instagram: 'Instagram',
};

const dateFmt = new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' });

const ERRORS: Record<string, string> = {
  create: 'No se pudo crear el cliente. Revisá los datos.',
  missing: 'Ese cliente ya no existe.',
  forbidden: 'No tenés permiso para gestionar clientes.',
  delete: 'No se pudo eliminar el cliente.',
};

export default async function ClientsPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string };
  searchParams: { error?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/signin?redirect=/${params.orgSlug}/clients`);

  const access = await getAccessibleOrg(params.orgSlug, user.id);
  if (!access) notFound();

  const clients = await listClients(access.org.id);
  const error = searchParams.error ? (ERRORS[searchParams.error] ?? ERRORS.create) : null;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-[var(--fg)]">Clientes</h1>
        <AddClientDialog orgSlug={params.orgSlug} action={createClientAction} />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {error}
        </p>
      ) : null}

      {clients.length === 0 ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--fg-muted)]">
          Todavía no cargaste clientes. Agregá el primero para empezar a generar reportes.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {clients.map((client) => (
            <li key={client.id}>
              <Link
                href={`/${params.orgSlug}/clients/${client.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors duration-150 hover:bg-[var(--surface)]"
              >
                <span className="min-w-0 truncate font-medium text-[var(--fg)]">{client.name}</span>
                <span className="shrink-0 text-sm text-[var(--fg-muted)]">
                  {PLATFORM_LABELS[client.platform] ?? client.platform} ·{' '}
                  {dateFmt.format(client.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
