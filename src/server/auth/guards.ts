import 'server-only';

import { and, eq, isNotNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import type { Organization, Role } from '@/server/db/schema';
import { memberships, organizations } from '@/server/db/schema';

/**
 * Multi-tenant guards. Every org-scoped query and mutation resolves its
 * `org_id` through one of these — never from the URL directly — so a request
 * can only ever touch data in an org the caller belongs to.
 *
 * Isolation rule: a missing org and an org the user is not a member of are
 * **indistinguishable** to the caller. Both raise `TenantError`, which becomes
 * a 404 with no body detail. Never 403 here — a 403 confirms the org exists.
 */

export class TenantError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'TenantError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export type OrgContext = {
  org: Organization;
  role: Role;
  userId: string;
};

/**
 * Resolve `slug` to an organization the user is an accepted member of.
 * Throws {@link TenantError} when the org does not exist **or** the user is not
 * a member — the caller cannot tell which.
 */
export async function requireMembership(slug: string, userId: string): Promise<OrgContext> {
  const [row] = await db
    .select({ org: organizations, role: memberships.role })
    .from(organizations)
    .innerJoin(
      memberships,
      and(
        eq(memberships.orgId, organizations.id),
        eq(memberships.userId, userId),
        isNotNull(memberships.acceptedAt),
      ),
    )
    .where(eq(organizations.slug, slug))
    .limit(1);

  if (!row) throw new TenantError();
  return { org: row.org, role: row.role as Role, userId };
}

const ROLE_RANK: Record<Role, number> = { manager: 1, admin: 2, owner: 3 };

/**
 * {@link requireMembership} plus a minimum-role check. Throws
 * {@link ForbiddenError} (→ 403) when the member's role outranks-below
 * `minimum`. The 403 is deliberate: the caller has already proven membership.
 */
export async function requireRole(
  slug: string,
  userId: string,
  minimum: Role,
): Promise<OrgContext> {
  const ctx = await requireMembership(slug, userId);
  if (ROLE_RANK[ctx.role] < ROLE_RANK[minimum]) throw new ForbiddenError();
  return ctx;
}

/** Non-throwing {@link requireMembership}: the org context, or `null`. */
export async function checkOrgAccess(slug: string, userId: string): Promise<OrgContext | null> {
  try {
    return await requireMembership(slug, userId);
  } catch {
    return null;
  }
}

/**
 * Map a guard error (or any thrown value) to an HTTP response for a route
 * handler. `ForbiddenError` → 403; everything else → 404 with no detail.
 */
export function guardErrorResponse(error: unknown): NextResponse {
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
