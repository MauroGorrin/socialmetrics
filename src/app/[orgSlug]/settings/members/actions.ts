'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { ForbiddenError, requireRole, TenantError } from '@/server/auth/guards';
import { db } from '@/server/db';
import { auditLogs } from '@/server/db/schema';
import { changeMemberRole, inviteMember, removeMember } from '@/server/mutations/memberships';

/**
 * Member management actions. Inviting needs `admin`; changing a role and
 * removing a member need `owner` (an admin cannot, per the role matrix). The
 * org is resolved from a hidden `orgSlug` through the guard — untrusted input,
 * guarded gate.
 */

export type InviteMemberState = { ok?: boolean; error?: string };

const ASSIGNABLE_ROLES = ['admin', 'manager'] as const;

const inviteSchema = z.object({
  orgSlug: z.string().min(1),
  email: z.email(),
  role: z.enum(ASSIGNABLE_ROLES),
});

const roleSchema = z.object({
  orgSlug: z.string().min(1),
  membershipId: z.uuid(),
  role: z.enum(ASSIGNABLE_ROLES),
});

const removeSchema = z.object({
  orgSlug: z.string().min(1),
  membershipId: z.uuid(),
});

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function inviteMemberAction(
  _prev: InviteMemberState,
  formData: FormData,
): Promise<InviteMemberState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' };

  const parsed = inviteSchema.safeParse({
    orgSlug: str(formData, 'orgSlug'),
    email: str(formData, 'email').trim().toLowerCase(),
    role: str(formData, 'role'),
  });
  if (!parsed.success) return { error: 'Ingresá un email válido y elegí un rol.' };

  try {
    const { org } = await requireRole(parsed.data.orgSlug, user.id, 'admin');
    const result = await inviteMember({
      orgId: org.id,
      orgName: org.name,
      invitedBy: user.id,
      email: parsed.data.email,
      role: parsed.data.role,
    });
    if (!result.ok) return { error: result.error };
    await db.insert(auditLogs).values({
      orgId: org.id,
      actorId: user.id,
      action: 'invite_member',
      metadata: { email: parsed.data.email, role: parsed.data.role },
    });
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof TenantError) {
      return { error: 'No tenés permiso para invitar miembros.' };
    }
    throw error;
  }

  revalidatePath(`/${parsed.data.orgSlug}/settings/members`);
  return { ok: true };
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/signin');

  const parsed = roleSchema.safeParse({
    orgSlug: str(formData, 'orgSlug'),
    membershipId: str(formData, 'membershipId'),
    role: str(formData, 'role'),
  });
  if (!parsed.success) redirect(`/${str(formData, 'orgSlug')}/settings/members?error=role`);

  const base = `/${parsed.data.orgSlug}/settings/members`;
  let target = `${base}?ok=role`;
  try {
    const { org } = await requireRole(parsed.data.orgSlug, user.id, 'owner');
    const changed = await changeMemberRole(org.id, parsed.data.membershipId, parsed.data.role);
    if (!changed) {
      target = `${base}?error=missing`;
    } else {
      await db.insert(auditLogs).values({
        orgId: org.id,
        actorId: user.id,
        action: 'change_role',
        targetId: parsed.data.membershipId,
        metadata: { role: parsed.data.role },
      });
    }
  } catch (error) {
    if (error instanceof ForbiddenError) target = `${base}?error=forbidden`;
    else if (error instanceof TenantError) target = '/dashboard';
    else throw error;
  }
  redirect(target);
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/signin');

  const parsed = removeSchema.safeParse({
    orgSlug: str(formData, 'orgSlug'),
    membershipId: str(formData, 'membershipId'),
  });
  if (!parsed.success) redirect(`/${str(formData, 'orgSlug')}/settings/members?error=remove`);

  const base = `/${parsed.data.orgSlug}/settings/members`;
  let target = `${base}?ok=removed`;
  try {
    const { org } = await requireRole(parsed.data.orgSlug, user.id, 'owner');
    const result = await removeMember(org.id, parsed.data.membershipId);
    if (!result.ok) {
      target = `${base}?error=remove`;
    } else {
      await db.insert(auditLogs).values({
        orgId: org.id,
        actorId: user.id,
        action: 'delete_member',
        targetId: parsed.data.membershipId,
        metadata: {},
      });
    }
  } catch (error) {
    if (error instanceof ForbiddenError) target = `${base}?error=forbidden`;
    else if (error instanceof TenantError) target = '/dashboard';
    else throw error;
  }
  redirect(target);
}
