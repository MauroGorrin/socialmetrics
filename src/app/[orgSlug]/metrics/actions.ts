'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { BASE_METRICS } from '@/lib/metrics';
import { ForbiddenError, requireMembership, TenantError } from '@/server/auth/guards';
import { db } from '@/server/db';
import { auditLogs } from '@/server/db/schema';
import { getClient } from '@/server/queries/clients';
import { upsertMonthlyMetrics } from '@/server/mutations/metrics';

/**
 * Monthly metric entry. Any member may enter metrics (same as the dashboard's
 * inline form). One action writes the whole month for one client at once.
 */

const numberField = z.preprocess(
  (raw) => (typeof raw === 'string' && raw.trim() === '' ? undefined : raw),
  z.coerce.number().min(0).max(1_000_000_000_000).optional(),
);

const schema = z.object({
  orgSlug: z.string().min(1),
  clientId: z.uuid(),
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/),
  impressions: numberField,
  clicks: numberField,
  spend: numberField,
  conversions: numberField,
  conversion_value: numberField,
});

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

export async function saveMonthlyMetricsAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/signin');

  const orgSlug = field(formData, 'orgSlug');
  const parsed = schema.safeParse({
    orgSlug,
    clientId: field(formData, 'clientId'),
    periodMonth: field(formData, 'periodMonth'),
    impressions: field(formData, 'impressions'),
    clicks: field(formData, 'clicks'),
    spend: field(formData, 'spend'),
    conversions: field(formData, 'conversions'),
    conversion_value: field(formData, 'conversion_value'),
  });
  if (!parsed.success) {
    redirect(`/${orgSlug}/metrics?error=invalid`);
  }

  const { clientId, periodMonth } = parsed.data;
  const back = `/${orgSlug}/metrics?client=${clientId}&month=${periodMonth}`;

  let target = `${back}&saved=1`;
  try {
    const { org } = await requireMembership(orgSlug, user.id);
    const client = await getClient(org.id, clientId);
    if (!client) {
      target = `/${orgSlug}/metrics?error=client`;
    } else {
      const values = Object.fromEntries(
        BASE_METRICS.map((key) => [key, parsed.data[key]]).filter(([, v]) => v != null),
      );

      await upsertMonthlyMetrics({
        orgId: org.id,
        clientId,
        actorId: user.id,
        periodMonth,
        values,
      });

      await db.insert(auditLogs).values({
        orgId: org.id,
        actorId: user.id,
        action: 'metric.month.save',
        targetId: clientId,
        metadata: { periodMonth, fields: Object.keys(values) },
      });
    }
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof TenantError) {
      target = `${back}&error=forbidden`;
    } else {
      throw error;
    }
  }

  redirect(target);
}
