'use client';

import { useFormState } from 'react-dom';
import { disconnectPlatformAction, syncNowAction } from '@/app/[orgSlug]/clients/actions';
import type { PlatformConnection } from '@/server/db/schema';

type Props = {
  platform: 'meta' | 'google_ads';
  orgSlug: string;
  clientId: string;
  connection: PlatformConnection | null;
};

const LABEL = { meta: 'Meta Ads', google_ads: 'Google Ads' } as const;

const CARD =
  'space-y-3 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-sm)]';
const PRIMARY =
  'inline-block rounded-[var(--radius-md)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-fg)] transition-opacity duration-150 hover:opacity-90';
const GHOST =
  'rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--fg)] transition-opacity duration-150 hover:opacity-70';

function relativeTime(date: Date | null): string {
  if (!date) return 'nunca';
  const secs = Math.round((Date.now() - date.getTime()) / 1000);
  if (secs < 90) return 'hace un momento';
  const mins = Math.round(secs / 60);
  if (mins < 90) return `hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 36) return `hace ${hrs} h`;
  return `hace ${Math.round(hrs / 24)} días`;
}

export function PlatformConnectionCard({ platform, orgSlug, clientId, connection }: Props) {
  const [syncState, runSync] = useFormState(syncNowAction, {});
  const label = LABEL[platform];
  const connectHref = `/api/integrations/${platform}/connect?clientId=${clientId}`;
  const status = connection?.status ?? null;

  if (!connection || status === 'revoked') {
    return (
      <div className={CARD}>
        <h3 className="font-semibold text-[var(--fg)]">{label}</h3>
        <p className="text-sm text-[var(--text-secondary)]">
          Conecta la cuenta de {label} de este cliente para traer las métricas automáticamente.
        </p>
        <a href={connectHref} className={PRIMARY}>
          Conectar {label}
        </a>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className={CARD}>
        <h3 className="font-semibold text-[var(--fg)]">{label}</h3>
        <p className="text-sm text-[var(--text-secondary)]">
          Autorización iniciada — elige la cuenta publicitaria.
        </p>
        <a href={`/${orgSlug}/clients/${clientId}/integrations/${platform}`} className={PRIMARY}>
          Elegir cuenta
        </a>
      </div>
    );
  }

  const hidden = (
    <>
      <input type="hidden" name="orgSlug" value={orgSlug} />
      <input type="hidden" name="connectionId" value={connection.id} />
    </>
  );

  const syncButton = (
    <form action={runSync}>
      {hidden}
      <button type="submit" className={GHOST}>
        Sincronizar ahora
      </button>
    </form>
  );

  const disconnectButton = (
    <form action={disconnectPlatformAction}>
      {hidden}
      <button
        type="submit"
        className="rounded-[var(--radius-md)] border border-[var(--destructive)] px-3 py-1.5 text-sm text-[var(--destructive)] transition-opacity duration-150 hover:opacity-70"
      >
        Desconectar
      </button>
    </form>
  );

  return (
    <div className={CARD}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[var(--fg)]">{label}</h3>
          <p className="text-sm text-[var(--text-secondary)]">
            {connection.externalAccountName ?? connection.externalAccountId}
          </p>
        </div>
      </div>

      {status === 'needs_reconnect' ? (
        <p className="rounded-[var(--radius-md)] bg-[var(--warning-50)] p-2.5 text-sm text-[var(--warning-700)]">
          La conexión con {label} expiró. Reconéctala para seguir sincronizando.
        </p>
      ) : status === 'error' ? (
        <p className="text-sm text-[var(--destructive)]">
          La última sincronización falló: {connection.lastError}
        </p>
      ) : (
        <p className="text-sm text-[var(--text-tertiary)]">
          Última sincronización: {relativeTime(connection.lastSyncedAt)}
        </p>
      )}

      {syncState.ok ? (
        <p className="text-sm text-[var(--success)]">
          Sincronizado — {syncState.syncedRows ?? 0} filas.
        </p>
      ) : syncState.error ? (
        <p role="alert" className="text-sm text-[var(--destructive)]">
          {syncState.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {status === 'needs_reconnect' ? (
          <a href={connectHref} className={PRIMARY}>
            Reconectar
          </a>
        ) : (
          syncButton
        )}
        {disconnectButton}
      </div>
    </div>
  );
}
