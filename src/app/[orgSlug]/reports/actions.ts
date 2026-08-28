'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { ForbiddenError, requireRole, TenantError } from '@/server/auth/guards';
import { generateReport } from '@/server/mutations/reports';

const schema = z.object({
  orgSlug: z.string().min(1),
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

/** Generate the month's report, then land on its view page. */
export async function generateReportAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/signin');

  const parsed = schema.safeParse({
    orgSlug: str(formData, 'orgSlug'),
    periodMonth: str(formData, 'periodMonth'),
  });
  if (!parsed.success) {
    redirect(`/${str(formData, 'orgSlug')}/reports?error=period`);
  }

  let target: string;
  try {
    const { org } = await requireRole(parsed.data.orgSlug, user.id, 'admin');
    const result = await generateReport({
      orgId: org.id,
      orgName: org.name,
      actorId: user.id,
      periodMonth: parsed.data.periodMonth,
      clientIds: [],
    });
    target = result.ok
      ? `/${parsed.data.orgSlug}/reports/${result.data.reportId}`
      : `/${parsed.data.orgSlug}/reports?error=failed`;
  } catch (error) {
    if (error instanceof ForbiddenError) {
      target = `/${parsed.data.orgSlug}/reports?error=forbidden`;
    } else if (error instanceof TenantError) {
      target = '/dashboard';
    } else {
      throw error;
    }
  }
  redirect(target);
}
