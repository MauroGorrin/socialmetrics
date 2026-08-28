import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { Resend } from 'resend';
import { createAdminSupabase, createServerSupabase } from '@/lib/auth';
import { env } from '@/lib/env';
import { db } from '@/server/db';
import type { Role } from '@/server/db/schema';
import { memberships, organizations, users } from '@/server/db/schema';
import { getInviteByToken } from '@/server/queries/memberships';

/**
 * Membership writes. Callers resolve and authorize the org through a guard
 * first; these functions take a resolved `orgId` and scope every write by it.
 *
 * The invitee's auth user is created up front (so the pending membership row
 * has a `user_id`), the row carries the 48-hour token, and `acceptInvite`
 * flips `accepted_at` under an `IS NULL` guard so a second redeem is a no-op.
 */

const SITE_URL = env.SESSION_URL ?? 'http://localhost:3000';
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function resolveAuthUserId(email: string): Promise<string> {
  const admin = createAdminSupabase();
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.data.user) return created.data.user.id;

  // Already exists — find them.
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!existing) throw created.error ?? new Error('could not resolve invitee');
  return existing.id;
}

async function sendInviteEmail(email: string, orgName: string, token: string): Promise<void> {
  try {
    const resend = new Resend(env.RESEND_API_KEY);
    await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: `Te invitaron a ${orgName} en Reportes`,
      html: `<p>Te sumaron a <strong>${orgName}</strong>. El enlace vence en 48 horas.</p>
             <p><a href="${SITE_URL}/invite/${token}">Aceptar invitación</a></p>`,
    });
  } catch (error) {
    // Non-fatal: the invite is valid via its link even if delivery fails.
    console.error('[invite] email send failed', error);
  }
}

/** Invite `email` into the org with `role`. Idempotent per (user, org). */
export async function inviteMember(input: {
  orgId: string;
  orgName: string;
  invitedBy: string;
  email: string;
  role: Role;
}): Promise<Result<{ token: string }>> {
  const email = input.email.trim().toLowerCase();
  const userId = await resolveAuthUserId(email);

  await db
    .insert(users)
    .values({ id: userId, email })
    .onConflictDoUpdate({ target: users.id, set: { email } });

  const token = randomUUID();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const inserted = await db
    .insert(memberships)
    .values({
      userId,
      orgId: input.orgId,
      role: input.role,
      invitedBy: input.invitedBy,
      inviteToken: token,
      inviteExpiresAt: expiresAt,
    })
    .onConflictDoNothing()
    .returning({ id: memberships.id });

  if (inserted.length === 0) {
    return { ok: false, error: 'Esa persona ya es miembro o tiene una invitación pendiente.' };
  }

  await sendInviteEmail(email, input.orgName, token);
  return { ok: true, data: { token } };
}

/** Redeem an invite: set the invitee's password, log them in, join the org. */
export async function acceptInvite(input: {
  token: string;
  password: string;
}): Promise<Result<{ orgSlug: string }>> {
  const invite = await getInviteByToken(input.token);
  if (!invite) return { ok: false, error: 'Esta invitación no es válida o ya expiró.' };

  const admin = createAdminSupabase();
  const link = await admin.auth.admin.generateLink({ type: 'recovery', email: invite.email });
  const tokenHash = link.data.properties?.hashed_token;
  if (link.error || !tokenHash) return { ok: false, error: 'No pudimos verificar tu cuenta.' };

  const supabase = createServerSupabase();
  const verified = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
  if (verified.error) return { ok: false, error: 'No pudimos verificar tu cuenta.' };
  await supabase.auth.updateUser({ password: input.password });

  const claimed = await db
    .update(memberships)
    .set({ acceptedAt: new Date(), inviteToken: null, inviteExpiresAt: null })
    .where(and(eq(memberships.id, invite.membershipId), isNull(memberships.acceptedAt)))
    .returning({ id: memberships.id });

  if (claimed.length === 0) {
    return { ok: false, error: 'Esta invitación ya fue aceptada.' };
  }

  return { ok: true, data: { orgSlug: invite.org.slug } };
}

/** Change a member's role. `false` when the membership is not in this org. */
export async function changeMemberRole(
  orgId: string,
  membershipId: string,
  role: Role,
): Promise<boolean> {
  const rows = await db
    .update(memberships)
    .set({ role })
    .where(and(eq(memberships.id, membershipId), eq(memberships.orgId, orgId)))
    .returning({ id: memberships.id });
  return rows.length > 0;
}

/** Remove a member. Refuses to remove the org owner. */
export async function removeMember(orgId: string, membershipId: string): Promise<Result<null>> {
  const [row] = await db
    .select({ userId: memberships.userId, ownerId: organizations.ownerId })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(and(eq(memberships.id, membershipId), eq(memberships.orgId, orgId)))
    .limit(1);

  if (!row) return { ok: false, error: 'Ese miembro no existe.' };
  if (row.userId === row.ownerId) {
    return { ok: false, error: 'No se puede quitar al dueño de la organización.' };
  }

  await db
    .delete(memberships)
    .where(and(eq(memberships.id, membershipId), eq(memberships.orgId, orgId)));
  return { ok: true, data: null };
}
