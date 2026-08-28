import 'server-only';

import { Resend } from 'resend';
import { env } from '@/lib/env';

/**
 * Resend wrapper. Sends never throw — a bad key or a network error comes back
 * as `{ ok: false }` so the caller can still record the attempt.
 */

export type EmailAttachment = { filename: string; content: Buffer };

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string };

export async function sendEmail(input: {
  to: string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): Promise<SendResult> {
  try {
    const resend = new Resend(env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: input.to,
      subject: input.subject,
      html: input.html,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'send failed' };
  }
}
