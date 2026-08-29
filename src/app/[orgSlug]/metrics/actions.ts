'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import {
  type MetricKey,
  ORGANIC_POINT_METRICS,
  ORGANIC_SUM_METRICS,
  type ReportProfile,
} from '@/lib/metrics';
import { ForbiddenError, requireMembership, TenantError } from '@/server/auth/guards';
import { db } from '@/server/db';
import { auditLogs } from '@/server/db/schema';
import { getClient } from '@/server/queries/clients';
import { type MonthlyPostInput, upsertMonthlyMetrics, upsertMonthlyPosts } from '@/server/mutations/metrics';

/**
 * Monthly metric entry. Any member may enter metrics. One action writes the
 * whole month for one client — the fields depend on the client's report
 * profile (ads figures, organic figures, or both) plus the best-posts list for
 * organic / mixed clients.
 */

const ADS_KEYS = ['impressions', 'clicks', 'spend', 'conversions', 'conversion_value'] as const;
const ORGANIC_KEYS = [...ORGANIC_POINT_METRICS, ...ORGANIC_SUM_METRICS];

/** The metric keys a given profile's grid submits. `impressions` is shared. */
function keysForProfile(profile: ReportProfile): MetricKey[] {
  if (profile === 'ads') return [...ADS_KEYS];
  if (profile === 'organic') return [...ORGANIC_KEYS];
  // mixed: ads + organic, with the shared `impressions` counted once.
  return [...new Set<MetricKey>([...ADS_KEYS, ...ORGANIC_KEYS])];
}

const MAX_POSTS = 5;
const FORMATS = ['reel', 'carousel', 'image', 'story', 'video'] as const;

const numberField = z.preprocess(
  (raw) => (typeof raw === 'string' && raw.trim() === '' ? undefined : raw),
  z.coerce.number().min(0).max(1_000_000_000_000).optional(),
);

const schema = z.object({
  orgSlug: z.string().min(1),
  clientId: z.uuid(),
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** Parse the up-to-five best-posts rows off the form. */
function readPosts(formData: FormData): MonthlyPostInput[] {
  const posts: MonthlyPostInput[] = [];
  for (let i = 0; i < MAX_POSTS; i++) {
    const url = field(formData, `post_${i}_url`).trim();
    if (!url) continue;
    const format = field(formData, `post_${i}_format`).trim();
    const reach = numberField.safeParse(field(formData, `post_${i}_reach`));
    const interactions = numberField.safeParse(field(formData, `post_${i}_interactions`));
    posts.push({
      url,
      format: (FORMATS as readonly string[]).includes(format) ? format : null,
      reach: reach.success ? (reach.data ?? null) : null,
      interactions: interactions.success ? (interactions.data ?? null) : null,
    });
  }
  return posts;
}

export async function saveMonthlyMetricsAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/signin');

  const orgSlug = field(formData, 'orgSlug');
  const parsed = schema.safeParse({
    orgSlug,
    clientId: field(formData, 'clientId'),
    periodMonth: field(formData, 'periodMonth'),
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
      const profile = (client.reportProfile as ReportProfile) ?? 'ads';
      const values: Partial<Record<MetricKey, number>> = {};
      for (const key of keysForProfile(profile)) {
        const num = numberField.safeParse(field(formData, key));
        if (num.success && num.data != null) values[key] = num.data;
      }

      await upsertMonthlyMetrics({
        orgId: org.id,
        clientId,
        actorId: user.id,
        periodMonth,
        values,
      });

      if (profile === 'organic' || profile === 'mixed') {
        await upsertMonthlyPosts({
          orgId: org.id,
          clientId,
          actorId: user.id,
          periodMonth,
          posts: readPosts(formData),
        });
      }

      await db.insert(auditLogs).values({
        orgId: org.id,
        actorId: user.id,
        action: 'metric.month.save',
        targetId: clientId,
        metadata: { periodMonth, profile, fields: Object.keys(values) },
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
