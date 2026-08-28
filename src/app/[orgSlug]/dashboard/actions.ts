'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { ForbiddenError, requireMembership, TenantError } from '@/server/auth/guards';
import { db } from '@/server/db';
import { auditLogs } from '@/server/db/schema';
import { createMetric, METRIC_NAMES } from '@/server/mutations/metrics';
import { getClient } from '@/server/queries/clients';

/**
 * Dashboard server actions. Metric entry is validated with zod, authorized
 * through the tenant guard (any member may input metrics), and the referenced
 * client is re-checked against the resolved org so a foreign `clientId` can't
 * be smuggled in. `orgSlug` comes from a hidden field — untrusted; the guard
 * is the gate.
 */

export type AddMetricState = { ok?: boolean; error?: string };

const schema = z.object({
  orgSlug: z.string().min(1),
  clientId: z.uuid(),
  metricName: z.enum(METRIC_NAMES),
  metricValue: z.coerce.number().min(0).max(1_000_000_000_000),
  period: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
});

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function createMetricAction(
  _prev: AddMetricState,
  formData: FormData,
): Promise<AddMetricState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' };

  const parsed = schema.safeParse({
    orgSlug: str(formData, 'orgSlug'),
    clientId: str(formData, 'clientId'),
    metricName: str(formData, 'metricName'),
    metricValue: str(formData, 'metricValue'),
    period: str(formData, 'period'),
  });
  if (!parsed.success) {
    return { error: 'Completa cliente, métrica, valor y fecha.' };
  }

  try {
    const { org } = await requireMembership(parsed.data.orgSlug, user.id);

    const client = await getClient(org.id, parsed.data.clientId);
    if (!client) return { error: 'Ese cliente no existe en esta organización.' };

    const metric = await createMetric({
      orgId: org.id,
      clientId: parsed.data.clientId,
      createdBy: user.id,
      metricName: parsed.data.metricName,
      metricValue: parsed.data.metricValue,
      period: parsed.data.period,
    });
    await db.insert(auditLogs).values({
      orgId: org.id,
      actorId: user.id,
      action: 'metric.create',
      targetId: metric.id,
      metadata: { metricName: parsed.data.metricName, period: parsed.data.period },
    });
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof TenantError) {
      return { error: 'No tienes acceso a esta organización.' };
    }
    throw error;
  }

  revalidatePath(`/${parsed.data.orgSlug}/dashboard`);
  return { ok: true };
}
