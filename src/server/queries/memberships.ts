import 'server-only';

import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/server/db';
import type { Organization, Role } from '@/server/db/schema';
import { memberships, organizations, users } from '@/server/db/schema';

/**
 * Membership reads. `listMembers` is org-scoped; `getMembershipByToken` is the
 * one pre-context lookup (an invitee has no session yet), and it only ever
 * returns a still-valid pending invite.
 */

export type MemberRow = {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  role: Role;
  status: 'active' | 'pending';
  isOwner: boolean;
};

/** Everyone attached to an org — accepted members and pending invites. */
export async function listMembers(orgId: string): Promise<MemberRow[]> {
  const rows = await db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      role: memberships.role,
      acceptedAt: memberships.acceptedAt,
      ownerId: organizations.ownerId,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.orgId, orgId))
    .orderBy(memberships.createdAt);

  return rows.map((r) => ({
    membershipId: r.membershipId,
    userId: r.userId,
    email: r.email,
    name: r.name,
    role: r.role as Role,
    status: r.acceptedAt ? 'active' : 'pending',
    isOwner: r.userId === r.ownerId,
  }));
}

export type InviteByToken = {
  membershipId: string;
  org: Organization;
  email: string;
  role: Role;
};

/** A pending, unexpired invite for `token`, or `null`. */
export async function getInviteByToken(token: string): Promise<InviteByToken | null> {
  const [row] = await db
    .select({ membership: memberships, org: organizations, email: users.email })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.inviteToken, token),
        isNull(memberships.acceptedAt),
        gt(memberships.inviteExpiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return null;
  return {
    membershipId: row.membership.id,
    org: row.org,
    email: row.email,
    role: row.membership.role as Role,
  };
}
