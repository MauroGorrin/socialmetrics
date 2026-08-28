import 'server-only';

import { and, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import type { Organization } from '@/server/db/schema';
import { organizations } from '@/server/db/schema';
import { requireRole } from '@/server/auth/guards';

/**
 * Organization mutations. Each one resolves and authorizes the org through a
 * guard before it writes, and scopes the write by `org_id` — so a caller can
 * never mutate an org they do not belong to, and role is checked before the
 * work, not after.
 */

/**
 * Rename an organization. Requires `admin` or `owner`. Returns the updated row,
 * or `null` when the slug does not resolve for this user (→ 404) — the guard
 * throws {@link import('@/server/auth/guards').TenantError} before this point in
 * that case, so `null` here only covers a lost race (org deleted meanwhile).
 */
export async function renameOrg(
  slug: string,
  userId: string,
  name: string,
): Promise<Organization | null> {
  const { org } = await requireRole(slug, userId, 'admin');

  const [updated] = await db
    .update(organizations)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(organizations.id, org.id), eq(organizations.slug, slug)))
    .returning();

  return updated ?? null;
}
