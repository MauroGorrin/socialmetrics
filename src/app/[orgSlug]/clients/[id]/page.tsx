import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { deleteClientAction, updateClientAction } from '@/app/[orgSlug]/clients/actions';
import { getCurrentUser } from '@/lib/auth';
import { getClient } from '@/server/queries/clients';
import { getAccessibleOrg } from '@/server/queries/orgs';

const FIELD =
  'rounded border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base text-[var(--fg)] outline-none focus:border-[var(--fg-muted)]';

const PLATFORM_OPTIONS = [
  { value: 'meta', label: 'Meta' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
];

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: { orgSlug: string; id: string };
  searchParams: { saved?: string; error?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/signin?redirect=/${params.orgSlug}/clients/${params.id}`);

  const access = await getAccessibleOrg(params.orgSlug, user.id);
  if (!access) notFound();

  const client = await getClient(access.org.id, params.id);
  if (!client) notFound();

  return (
    <section className="mx-auto max-w-xl space-y-6">
      <Link href={`/${params.orgSlug}/clients`} className="text-sm text-[var(--fg-muted)] underline">
        ← Volver a clientes
      </Link>

      <h1 className="text-2xl font-bold text-[var(--fg)]">{client.name}</h1>

      {searchParams.saved ? (
        <p className="rounded border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--fg)]">
          Cambios guardados.
        </p>
      ) : null}
      {searchParams.error === 'save' ? (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          Revisá los datos e intentá de nuevo.
        </p>
      ) : null}
      {searchParams.error === 'forbidden' ? (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          No tenés permiso para editar clientes.
        </p>
      ) : null}

      <form action={updateClientAction} className="flex flex-col gap-4">
        <input type="hidden" name="orgSlug" value={params.orgSlug} />
        <input type="hidden" name="clientId" value={client.id} />

        <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
          Nombre
          <input name="name" type="text" required defaultValue={client.name} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
          Plataforma
          <select name="platform" defaultValue={client.platform} className={FIELD}>
            {PLATFORM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--fg)]">
          ID de cuenta (opcional)
          <input
            name="platformAccountId"
            type="text"
            defaultValue={client.platformAccountId ?? ''}
            className={FIELD}
          />
        </label>

        <button
          type="submit"
          className="self-start rounded bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90"
        >
          Guardar cambios
        </button>
      </form>

      <form action={deleteClientAction} className="border-t border-[var(--border)] pt-4">
        <input type="hidden" name="orgSlug" value={params.orgSlug} />
        <input type="hidden" name="clientId" value={client.id} />
        <button
          type="submit"
          className="rounded border border-[var(--destructive)] px-4 py-2 text-sm font-medium text-[var(--destructive)] transition-opacity duration-150 hover:opacity-70"
        >
          Eliminar cliente
        </button>
      </form>
    </section>
  );
}
