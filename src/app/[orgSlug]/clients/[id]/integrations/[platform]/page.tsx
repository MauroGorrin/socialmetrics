import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { selectAdAccountAction } from '@/app/[orgSlug]/clients/actions';
import { getCurrentUser } from '@/lib/auth';
import { decryptTokens } from '@/server/mutations/platform-connections';
import { getForClient } from '@/server/queries/platform-connections';
import { getAccessibleOrg } from '@/server/queries/orgs';
import { getProvider } from '@/server/providers';
import type { AdAccountRef } from '@/server/providers/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const platformSchema = z.enum(['meta', 'google_ads']);
const LABEL = { meta: 'Meta Ads', google_ads: 'Google Ads' } as const;

const FIELD =
  'flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-sm text-[var(--fg)] has-[:checked]:border-[var(--primary)] has-[:checked]:bg-[var(--brand-50)]';
const PRIMARY =
  'rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90';

export default async function AdAccountPickerPage({
  params,
}: {
  params: { orgSlug: string; id: string; platform: string };
}) {
  const platform = platformSchema.safeParse(params.platform);
  if (!platform.success) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/auth/signin?redirect=/${params.orgSlug}/clients/${params.id}`);

  const access = await getAccessibleOrg(params.orgSlug, user.id);
  if (!access || (access.role !== 'owner' && access.role !== 'admin')) notFound();

  const conn = (await getForClient(access.org.id, params.id)).find(
    (c) => c.platform === platform.data && c.status === 'pending',
  );
  if (!conn) notFound();

  let accounts: AdAccountRef[] = [];
  try {
    const { accessToken, refreshToken } = decryptTokens(conn);
    accounts = await getProvider(platform.data).listAdAccounts({
      accessToken: accessToken ?? '',
      refreshToken: refreshToken ?? undefined,
    });
  } catch {
    accounts = [];
  }

  const label = LABEL[platform.data];

  return (
    <section className="mx-auto max-w-md space-y-6">
      <div>
        <Link
          href={`/${params.orgSlug}/clients/${params.id}`}
          className="text-sm text-[var(--text-secondary)] hover:text-[var(--fg)]"
        >
          ← Volver al cliente
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-[var(--fg)]">Elige la cuenta de {label}</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Estas son las cuentas publicitarias a las que tu cuenta de agencia tiene acceso.
          Sincronizaremos las métricas de la que elijas para este cliente.
        </p>
      </div>

      {accounts.length === 0 ? (
        <div className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--text-secondary)]">
          <p>
            No encontramos cuentas publicitarias en esta autorización. Revisa los permisos y vuelve
            a conectar.
          </p>
          <Link
            href={`/api/integrations/${platform.data}/connect?clientId=${params.id}`}
            className={PRIMARY}
          >
            Reconectar {label}
          </Link>
        </div>
      ) : (
        <form action={selectAdAccountAction} className="space-y-4">
          <input type="hidden" name="orgSlug" value={params.orgSlug} />
          <input type="hidden" name="connectionId" value={conn.id} />
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-[var(--fg)]">Cuenta publicitaria</legend>
            {accounts.map((account, index) => (
              <label key={account.id} className={FIELD}>
                <input
                  type="radio"
                  name="account"
                  value={`${account.id}|${account.name}`}
                  defaultChecked={index === 0}
                  className="accent-[var(--primary)]"
                  required
                />
                <span className="flex flex-col">
                  <span className="font-medium">{account.name}</span>
                  <span className="text-xs text-[var(--text-tertiary)]">{account.id}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <button type="submit" className={PRIMARY}>
            Conectar y sincronizar
          </button>
        </form>
      )}
    </section>
  );
}
