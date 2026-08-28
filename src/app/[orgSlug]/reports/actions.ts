'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { ForbiddenError, requireRole, TenantError } from '@/server/auth/guards';
import { createShareLink, generateReport, sendReport } from '@/server/mutations/reports';

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

const shareSchema = z.object({ orgSlug: z.string().min(1), reportId: z.uuid() });

/** Mint a public share link, then land back on the report with the token. */
export async function createShareAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/signin');

  const parsed = shareSchema.safeParse({
    orgSlug: str(formData, 'orgSlug'),
    reportId: str(formData, 'reportId'),
  });
  if (!parsed.success) redirect(`/${str(formData, 'orgSlug')}/reports`);

  const base = `/${parsed.data.orgSlug}/reports/${parsed.data.reportId}`;
  let target: string;
  try {
    const { org } = await requireRole(parsed.data.orgSlug, user.id, 'admin');
    const result = await createShareLink({
      orgId: org.id,
      actorId: user.id,
      reportId: parsed.data.reportId,
    });
    target = result.ok ? `${base}?shared=${result.data.token}` : `${base}?error=share`;
  } catch (error) {
    if (error instanceof ForbiddenError) target = `${base}?error=forbidden`;
    else if (error instanceof TenantError) target = '/dashboard';
    else throw error;
  }
  redirect(target);
}

export type SendReportState = { ok?: boolean; error?: string; warning?: string };

const sendSchema = z.object({
  orgSlug: z.string().min(1),
  reportId: z.uuid(),
  recipients: z.string().min(1),
});

export async function sendReportAction(
  _prev: SendReportState,
  formData: FormData,
): Promise<SendReportState> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Tu sesión expiró. Volvé a iniciar sesión.' };

  const parsed = sendSchema.safeParse({
    orgSlug: str(formData, 'orgSlug'),
    reportId: str(formData, 'reportId'),
    recipients: str(formData, 'recipients'),
  });
  if (!parsed.success) return { error: 'Ingresá al menos un email.' };

  const recipients = parsed.data.recipients
    .split(/[\s,;]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const validated = z.array(z.email()).min(1).max(20).safeParse(recipients);
  if (!validated.success) return { error: 'Revisá los emails ingresados.' };

  try {
    const { org } = await requireRole(parsed.data.orgSlug, user.id, 'admin');
    const result = await sendReport({
      orgId: org.id,
      orgSlug: parsed.data.orgSlug,
      orgName: org.name,
      actorId: user.id,
      reportId: parsed.data.reportId,
      recipients: validated.data,
    });
    if (!result.ok) return { error: result.error };
    revalidatePath(`/${parsed.data.orgSlug}/reports/${parsed.data.reportId}`);
    return { ok: true, warning: result.data.warning };
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof TenantError) {
      return { error: 'No tenés permiso para enviar reportes.' };
    }
    throw error;
  }
}
