'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { PLATFORMS, REPORT_PROFILES } from '@/lib/client-profile';
import { ForbiddenError, requireRole, TenantError } from '@/server/auth/guards';
import { db } from '@/server/db';
import { auditLogs } from '@/server/db/schema';
import { createClient, softDeleteClient, updateClient } from '@/server/mutations/clients';

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
  platform: z.enum(PLATFORMS),
  reportProfile: z.enum(REPORT_PROFILES),
});

const updateSchema = z.object({
  orgSlug: z.string().min(1),
  clientId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  platform: z.enum(PLATFORMS),
  platformAccountId: z.string().trim().max(120).optional(),
  reportProfile: z.enum(REPORT_PROFILES),
});

const deleteSchema = z.object({
  orgSlug: z.string().min(1),
  clientId: z.uuid(),
});

export type CreateClientState = { ok?: boolean; error?: string };

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

  const parsed = createSchema.safeParse({
    orgSlug: str(formData, 'orgSlug'),
    name: str(formData, 'name'),
    platform: str(formData, 'platform'),
    reportProfile: str(formData, 'reportProfile') || 'ads',
  });
  if (!parsed.success) {
    return { error: 'Ingresa un nombre y elige una plataforma.' };
  }

  try {
    const { org } = await requireRole(parsed.data.orgSlug, user.id, 'admin');
    const client = await createClient({
      orgId: org.id,
      createdBy: user.id,
      name: parsed.data.name,
      platform: parsed.data.platform,
      reportProfile: parsed.data.reportProfile,
    });
    await recordAudit(org.id, user.id, 'client.create', client.id, { name: client.name });
  } catch (error) {
    return { error: messageForError(error) };
  }

  revalidatePath(`/${parsed.data.orgSlug}/clients`);
  return { ok: true };
}

export async function updateClientAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/signin');

  const parsed = updateSchema.safeParse({
    orgSlug: str(formData, 'orgSlug'),
    clientId: str(formData, 'clientId'),
    name: str(formData, 'name'),
    platform: str(formData, 'platform'),
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
