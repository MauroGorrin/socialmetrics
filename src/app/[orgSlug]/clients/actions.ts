'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { parseBulkClients } from '@/lib/bulk-clients';
import { PLATFORMS, REPORT_PROFILES } from '@/lib/client-profile';
import { currentMonth, firstOfMonth, previousMonth, today } from '@/lib/metrics';
import { rateLimit } from '@/lib/rate-limit';
import { ForbiddenError, requireRole, TenantError } from '@/server/auth/guards';
import { db } from '@/server/db';
import { auditLogs } from '@/server/db/schema';
import { createClient, softDeleteClient, updateClient } from '@/server/mutations/clients';
import { deleteManualBaseMetrics } from '@/server/mutations/metrics';
import { finalize, remove as removeConnection } from '@/server/mutations/platform-connections';
import { getById as getConnectionById } from '@/server/queries/platform-connections';
import { backfillConnection, syncConnection } from '@/server/sync/ads-sync';

/**
 * Client server actions. Each validates its input with zod, authorizes through
 * the tenant guard (`requireRole` — a manager cannot write clients), performs
 * the org-scoped mutation, and writes an audit row. `orgSlug` arrives in a
 * hidden field but is untrusted: the guard is what proves access.
 *
 * Create returns state (the dialog closes on success); update/delete redirect.
 * `redirect()` is always called outside try/catch — it signals by throwing.
 */

const createSchema = z.object({
  orgSlug: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  reportProfile: z.enum(REPORT_PROFILES),
});

const bulkSchema = z.object({
  orgSlug: z.string().min(1),
  raw: z.string().trim().min(1).max(8000),
});

const updateSchema = z.object({
  orgSlug: z.string().min(1),
  clientId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  platform: z.enum(PLATFORMS).nullable(),
  platformAccountId: z.string().trim().max(120).optional(),
  reportProfile: z.enum(REPORT_PROFILES),
});

const deleteSchema = z.object({
  orgSlug: z.string().min(1),
  clientId: z.uuid(),
});

export type CreateClientState = {
  ok?: boolean;
  error?: string;
  /** Set on success — the dialog uses it to jump straight to metric entry. */
  clientId?: string;
  /** Which submit button was pressed: `load` → go to metrics, `another` → reset. */
  intent?: 'load' | 'another';
};

export type BulkCreateState = {
  ok?: boolean;
  error?: string;
  created?: number;
  /** Non-fatal notes from the parser (skipped dupes, malformed lines, the cap). */
  notes?: string[];
};

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

async function recordAudit(
  orgId: string,
  actorId: string,
  action: string,
  targetId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditLogs).values({ orgId, actorId, action, targetId, metadata });
}

/** Guard errors → a user-facing message; anything else re-throws (→ 500). */
function messageForError(error: unknown): string {
  if (error instanceof ForbiddenError) return 'No tienes permiso para gestionar clientes.';
  if (error instanceof TenantError) return 'Organización no encontrada.';
  throw error;
}

export async function createClientAction(
  _prev: CreateClientState,
  formData: FormData,
): Promise<CreateClientState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' };

  const intent: 'load' | 'another' = str(formData, 'intent') === 'another' ? 'another' : 'load';
  const parsed = createSchema.safeParse({
    orgSlug: str(formData, 'orgSlug'),
    name: str(formData, 'name'),
    reportProfile: str(formData, 'reportProfile') || 'ads',
  });
  if (!parsed.success) {
    return { error: 'Ingresa un nombre para el cliente.', intent };
  }

  let clientId: string;
  try {
    const { org } = await requireRole(parsed.data.orgSlug, user.id, 'admin');
    const client = await createClient({
      orgId: org.id,
      createdBy: user.id,
      name: parsed.data.name,
      reportProfile: parsed.data.reportProfile,
    });
    await recordAudit(org.id, user.id, 'client.create', client.id, { name: client.name });
    clientId = client.id;
  } catch (error) {
    return { error: messageForError(error), intent };
  }

  revalidatePath(`/${parsed.data.orgSlug}/clients`);
  return { ok: true, clientId, intent };
}

export async function createClientsBulkAction(
  _prev: BulkCreateState,
  formData: FormData,
): Promise<BulkCreateState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' };

  const parsed = bulkSchema.safeParse({
    orgSlug: str(formData, 'orgSlug'),
    raw: str(formData, 'raw'),
  });
  if (!parsed.success) {
    return { error: 'Pegá al menos un cliente, uno por línea.' };
  }

  const { rows, errors } = parseBulkClients(parsed.data.raw);
  if (rows.length === 0) {
    return { error: 'Ninguna línea es válida.', notes: errors };
  }

  try {
    const { org } = await requireRole(parsed.data.orgSlug, user.id, 'admin');
    for (const row of rows) {
      const client = await createClient({
        orgId: org.id,
        createdBy: user.id,
        name: row.name,
        reportProfile: row.reportProfile,
      });
      await recordAudit(org.id, user.id, 'client.create', client.id, { name: client.name });
    }
  } catch (error) {
    return { error: messageForError(error), notes: errors };
  }

  revalidatePath(`/${parsed.data.orgSlug}/clients`);
  return { ok: true, created: rows.length, notes: errors };
}

export async function updateClientAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/signin');

  const parsed = updateSchema.safeParse({
    orgSlug: str(formData, 'orgSlug'),
    clientId: str(formData, 'clientId'),
    name: str(formData, 'name'),
    platform: str(formData, 'platform') || null,
    platformAccountId: str(formData, 'platformAccountId').trim() || undefined,
    reportProfile: str(formData, 'reportProfile') || 'ads',
  });
  if (!parsed.success) {
    redirect(`/${str(formData, 'orgSlug')}/clients/${str(formData, 'clientId')}?error=save`);
  }

  let target = `/${parsed.data.orgSlug}/clients/${parsed.data.clientId}?saved=1`;
  try {
    const { org } = await requireRole(parsed.data.orgSlug, user.id, 'admin');
    const updated = await updateClient(org.id, parsed.data.clientId, {
      name: parsed.data.name,
      platform: parsed.data.platform,
      platformAccountId: parsed.data.platformAccountId ?? null,
      reportProfile: parsed.data.reportProfile,
    });
    if (updated) {
      await recordAudit(org.id, user.id, 'client.update', parsed.data.clientId, {
        name: parsed.data.name,
      });
    } else {
      target = `/${parsed.data.orgSlug}/clients?error=missing`;
    }
  } catch (error) {
    if (error instanceof ForbiddenError) {
      target = `/${parsed.data.orgSlug}/clients/${parsed.data.clientId}?error=forbidden`;
    } else if (error instanceof TenantError) {
      target = '/dashboard';
    } else {
      throw error;
    }
  }
  redirect(target);
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/signin');

  const parsed = deleteSchema.safeParse({
    orgSlug: str(formData, 'orgSlug'),
    clientId: str(formData, 'clientId'),
  });
  if (!parsed.success) {
    redirect(`/${str(formData, 'orgSlug')}/clients?error=delete`);
  }

  let target = `/${parsed.data.orgSlug}/clients`;
  try {
    const { org } = await requireRole(parsed.data.orgSlug, user.id, 'admin');
    const deleted = await softDeleteClient(org.id, parsed.data.clientId);
    if (deleted) {
      await recordAudit(org.id, user.id, 'client.delete', parsed.data.clientId, {});
    }
  } catch (error) {
    if (error instanceof ForbiddenError) {
      target = `/${parsed.data.orgSlug}/clients?error=forbidden`;
    } else if (!(error instanceof TenantError)) {
      throw error;
    } else {
      target = '/dashboard';
    }
  }
  redirect(target);
}

// ── ad-platform integrations ────────────────────────────────────────────────

const selectAccountSchema = z.object({
  orgSlug: z.string().min(1),
  connectionId: z.uuid(),
  /** Encoded `externalAccountId|externalAccountName` from the picker radio. */
  account: z.string().min(1).max(400),
});

/**
 * Finalize a `pending` connection with the chosen ad account, drop the client's
 * hand-entered ad rows, and kick off the 12-month backfill (best-effort — a
 * failure is recorded on the connection and the cron retries). Redirects.
 */
export async function selectAdAccountAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/signin');

  const parsed = selectAccountSchema.safeParse({
    orgSlug: str(formData, 'orgSlug'),
    connectionId: str(formData, 'connectionId'),
    account: str(formData, 'account'),
  });
  if (!parsed.success) redirect('/dashboard');

  const sep = parsed.data.account.indexOf('|');
  const externalAccountId = sep === -1 ? parsed.data.account : parsed.data.account.slice(0, sep);
  const externalAccountName = sep === -1 ? externalAccountId : parsed.data.account.slice(sep + 1);

  let target = `/${parsed.data.orgSlug}/clients?error=integration`;
  try {
    const { org } = await requireRole(parsed.data.orgSlug, user.id, 'admin');
    const conn = await getConnectionById(org.id, parsed.data.connectionId);
    if (conn && conn.status === 'pending') {
      const finalized = await finalize(org.id, conn.id, { externalAccountId, externalAccountName });
      if (finalized) {
        await deleteManualBaseMetrics(org.id, conn.clientId);
        await backfillConnection(finalized).catch(() => {});
        await recordAudit(org.id, user.id, 'integration.connect', conn.id, {
          platform: conn.platform,
        });
        target = `/${parsed.data.orgSlug}/clients/${conn.clientId}?connected=1`;
      }
    }
  } catch (error) {
    if (error instanceof ForbiddenError) {
      target = `/${parsed.data.orgSlug}/clients?error=forbidden`;
    } else if (error instanceof TenantError) {
      target = '/dashboard';
    } else {
      throw error;
    }
  }
  redirect(target);
}

const disconnectSchema = z.object({
  orgSlug: z.string().min(1),
  connectionId: z.uuid(),
});

/** Disconnect a platform: `status='revoked'`, tokens nulled. Synced rows are kept. Redirects. */
export async function disconnectPlatformAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/signin');

  const parsed = disconnectSchema.safeParse({
    orgSlug: str(formData, 'orgSlug'),
    connectionId: str(formData, 'connectionId'),
  });
  if (!parsed.success) redirect('/dashboard');

  let target = `/${parsed.data.orgSlug}/clients`;
  try {
    const { org } = await requireRole(parsed.data.orgSlug, user.id, 'admin');
    const conn = await getConnectionById(org.id, parsed.data.connectionId);
    if (conn) {
      await removeConnection(org.id, conn.id);
      await recordAudit(org.id, user.id, 'integration.disconnect', conn.id, {
        platform: conn.platform,
      });
      target = `/${parsed.data.orgSlug}/clients/${conn.clientId}`;
    }
  } catch (error) {
    if (!(error instanceof ForbiddenError) && !(error instanceof TenantError)) throw error;
  }
  redirect(target);
}

export type SyncNowState = { ok?: boolean; error?: string; syncedRows?: number };

const syncNowSchema = z.object({
  orgSlug: z.string().min(1),
  connectionId: z.uuid(),
});

/** Force a re-sync of one connection's current + previous month. Rate-limited to 1/min. */
export async function syncNowAction(
  _prev: SyncNowState,
  formData: FormData,
): Promise<SyncNowState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Tu sesión expiró.' };

  const parsed = syncNowSchema.safeParse({
    orgSlug: str(formData, 'orgSlug'),
    connectionId: str(formData, 'connectionId'),
  });
  if (!parsed.success) return { error: 'Datos inválidos.' };

  if (!rateLimit(`sync:${parsed.data.connectionId}`, 1, 60_000).ok) {
    return { error: 'Espera un minuto entre sincronizaciones.' };
  }

  try {
    const { org } = await requireRole(parsed.data.orgSlug, user.id, 'admin');
    const conn = await getConnectionById(org.id, parsed.data.connectionId);
    if (!conn) return { error: 'Esa conexión ya no existe.' };
    const from = firstOfMonth(previousMonth(currentMonth()));
    const { syncedRows } = await syncConnection(conn, { from, to: today() });
    revalidatePath(`/${parsed.data.orgSlug}/clients/${conn.clientId}`);
    return { ok: true, syncedRows };
  } catch (error) {
    if (error instanceof ForbiddenError) return { error: 'No tienes permiso para sincronizar.' };
    if (error instanceof TenantError) return { error: 'Organización no encontrada.' };
    return { error: 'La sincronización falló. Revisa el estado de la conexión.' };
  }
}
