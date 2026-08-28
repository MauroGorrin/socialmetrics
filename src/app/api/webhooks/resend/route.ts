import { createHmac, timingSafeEqual } from 'node:crypto';
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db';
import { auditLogs, emailEvents } from '@/server/db/schema';
import { emailSendContext, userIdForEmail } from '@/server/queries/reports';

/**
 * Resend event webhook. Records delivered / bounced / opened / clicked against
 * the originating send (matched by Resend's `email_id`), and writes an audit
 * row on a bounce so an admin sees it.
 *
 * Signature check runs only when `RESEND_WEBHOOK_SECRET` is set (Standard
 * Webhooks scheme: base64 HMAC-SHA256 of `${id}.${timestamp}.${body}`).
 */

const TYPE_MAP: Record<string, string> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
};

function verifySignature(secret: string, headers: Headers, body: string): boolean {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signature = headers.get('webhook-signature');
  if (!id || !timestamp || !signature) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');

  return signature
    .split(' ')
    .map((part) => part.split(',')[1] ?? '')
    .some((candidate) => {
      const a = Buffer.from(candidate);
      const b = Buffer.from(expected);
      return a.length === b.length && timingSafeEqual(a, b);
    });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw = await request.text();

  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (secret && !verifySignature(secret, request.headers, raw)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const eventType = event.type ? TYPE_MAP[event.type] : undefined;
  const data = event.data ?? {};
  const providerId = typeof data.email_id === 'string' ? data.email_id : null;
  const toList = Array.isArray(data.to) ? (data.to as string[]) : [];
  const recipient = toList[0] ?? (typeof data.to === 'string' ? data.to : null);

  // Always 200 on an event we can't attribute — retries would not help.
  if (!eventType || !providerId) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const context = await emailSendContext(providerId);
  if (!context) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const associatedUserId = recipient ? await userIdForEmail(recipient) : null;

  await db.insert(emailEvents).values({
    orgId: context.orgId,
    reportId: context.reportId,
    recipient: recipient ?? 'unknown',
    eventType,
    providerId,
    metadata: {
      ...(associatedUserId ? { userId: associatedUserId } : {}),
      ...(eventType === 'clicked' && typeof data.click === 'object' && data.click
        ? { click: data.click }
        : {}),
      raw: data,
    },
  });

  if (eventType === 'bounced') {
    await db.insert(auditLogs).values({
      orgId: context.orgId,
      actorId: associatedUserId ?? context.ownerId,
      action: 'email_bounce',
      targetId: context.reportId,
      metadata: { recipient, providerId },
    });
  }

  return NextResponse.json({ ok: true });
}
