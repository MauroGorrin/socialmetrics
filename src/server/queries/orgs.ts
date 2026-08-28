import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/server/db';
import { memberships, organizations } from '@/server/db/schema';
import type { Organization, Role } from '@/server/db/schema';
import { checkOrgAccess } from '@/server/auth/guards';

/**
 * Bootstrap queries — the two lookups that run before an org context exists:
 * resolving which orgs a user belongs to, and resolving a URL slug to an org.
 * Every other query in `src/server/queries/` takes `org_id` as its first
 * argument; these two are the exceptions that establish it.
 */

export type OrgMembership = Organization & { role: Role };

/** Orgs the user is an accepted member of, newest first. */
export async function listOrgsByUser(userId: string): Promise<OrgMembership[]> {
  const rows = await db
    .select({ org: organizations, role: memberships.role })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.userId, userId), isNotNull(memberships.acceptedAt)))
    .orderBy(organizations.createdAt);

  return rows.map((row) => ({ ...row.org, role: row.role as Role }));
}

/** Resolve a URL slug to its organization, or `null` if none matches. */
export async function getOrgBySlug(slug: string): Promise<Organization | null> {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);

  return org ?? null;
}

/**
 * Resolve a slug to an org **only if** the user may access it, returning the
 * org together with the user's role. `null` when the org is missing or the user
 * is not a member — callers surface that as a 404, never a 403. This is the
 * front door for every org-scoped query; the raw {@link getOrgBySlug} above is
 * for the unauthenticated public-report path only.
 */
export async function getAccessibleOrg(
  slug: string,
  userId: string,
): Promise<{ org: Organization; role: Role } | null> {
  const ctx = await checkOrgAccess(slug, userId);
  return ctx ? { org: ctx.org, role: ctx.role } : null;
}

/** Whether the user is an accepted member of the org (any role). */
export async function isOrgMember(orgId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.orgId, orgId),
        eq(memberships.userId, userId),
        isNotNull(memberships.acceptedAt),
      ),
    )
    .limit(1);

  return row !== undefined;
}
