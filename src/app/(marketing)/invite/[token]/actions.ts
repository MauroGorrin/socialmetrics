'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { acceptInvite } from '@/server/mutations/memberships';

/**
 * Redeem an invite. `acceptInvite` sets the invitee's password, establishes
 * their session, and joins the org; on any failure we bounce back to the
 * invite page with an error code.
 */

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(72),
});

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function acceptInviteAction(formData: FormData): Promise<void> {
  const token = str(formData, 'token');

  const parsed = schema.safeParse({ token, password: str(formData, 'password') });
  if (!parsed.success) {
    redirect(`/invite/${encodeURIComponent(token)}?error=weak`);
  }

  const result = await acceptInvite(parsed.data);
  if (!result.ok) {
    redirect(`/invite/${encodeURIComponent(token)}?error=invalid`);
  }

  redirect(`/${result.data.orgSlug}/dashboard`);
}
