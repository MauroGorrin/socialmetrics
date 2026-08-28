'use server';

import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { ForbiddenError, TenantError } from '@/server/auth/guards';
import { updateBranding } from '@/server/mutations/orgs';

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
};

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

export async function updateBrandingAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/signin');

  const orgSlug = str(formData, 'orgSlug');
  if (!orgSlug) redirect('/dashboard');
  const base = `/${orgSlug}/settings/branding`;

  const footerText = str(formData, 'footerText') || null;
  const removeLogo = formData.get('removeLogo') === 'on';

  let logo: { bytes: Buffer; contentType: string; ext: string } | null = null;
  const fileEntry = formData.get('logo');
  if (!removeLogo && fileEntry instanceof File && fileEntry.size > 0) {
    const ext = EXT_BY_TYPE[fileEntry.type] ?? null;
    if (!ext) redirect(`${base}?error=type`);
    logo = {
      bytes: Buffer.from(await fileEntry.arrayBuffer()),
      contentType: fileEntry.type,
      ext,
    };
  }

  let target = `${base}?saved=1`;
  try {
    const result = await updateBranding({
      slug: orgSlug,
      userId: user.id,
      footerText,
      removeLogo,
      logo,
    });
    if (!result.ok) target = `${base}?error=save`;
  } catch (error) {
    if (error instanceof ForbiddenError) target = `${base}?error=forbidden`;
    else if (error instanceof TenantError) target = '/dashboard';
    else throw error;
  }
  redirect(target);
}
