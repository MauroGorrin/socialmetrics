import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * E2-T4 — email integration: send a report (Resend called with the PDF
 * attachment, one email_event row per recipient), then Resend webhook events
 * (delivered / bounced / opened / clicked) land in email_event, a bounce also
 * writes an audit row, and a click for a known recipient is associated to the
 * user.
 *
 * RESEND_API_KEY is a placeholder here, so the real send is rejected and rows
 * are recorded as `send_failed` with the assembled attachment size — the
 * observable proof the API was called with the PDF.
 */

function loadEnvLocal(): void {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // env already present
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const PASSWORD = 'E2e-Passw0rd-8chars';

const stamp = Date.now();
const ownerEmail = `e2e-mail-${stamp}@e2e-reportes.dev`;
const bounceEmail = `bounce-${stamp}@e2e-reportes.dev`;
const openEmail = `open-${stamp}@e2e-reportes.dev`;

const slug = `e2e-mail-${stamp}`;

let admin: SupabaseClient;
let ownerId = '';
let orgId = '';
let reportId = '';
let pdfPath = '';

test.describe.configure({ mode: 'serial', timeout: 150_000 });

async function webhook(page: import('@playwright/test').Page, type: string, data: unknown) {
  const res = await page.request.post('/api/webhooks/resend', { data: { type, data } });
  expect(res.status(), await res.text()).toBe(200);
}

test.describe('email integration', () => {
  test.use({ navigationTimeout: 90_000 });

  test.beforeAll(async () => {
    expect(SUPABASE_URL).not.toBe('');
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.auth.admin.createUser({
      email: ownerEmail,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error('createUser failed');
    ownerId = data.user.id;

    await admin.from('user').insert({ id: ownerId, email: ownerEmail });
    const { data: org, error: orgErr } = await admin
      .from('organization')
      .insert({ name: 'E2E Mail Org', slug, owner_id: ownerId })
      .select('id')
      .single();
    if (orgErr || !org) throw orgErr ?? new Error('org insert failed');
    orgId = org.id;
    await admin.from('membership').insert({
      org_id: orgId,
      user_id: ownerId,
      role: 'owner',
      accepted_at: new Date().toISOString(),
    });

    const { data: report } = await admin
      .from('report')
      .insert({ org_id: orgId, period_month: '2026-08', status: 'generated' })
      .select('id')
      .single();
    reportId = report?.id ?? '';
    pdfPath = `${orgId}/${reportId}.pdf`;
    await admin.storage
      .from('reports')
      .upload(pdfPath, Buffer.from('%PDF-1.4\n% e2e report fixture\n%%EOF'), {
        contentType: 'application/pdf',
        upsert: true,
      });
    await admin.from('report').update({ pdf_url: pdfPath }).eq('id', reportId);
  });

  test.afterAll(async () => {
    try {
      if (pdfPath) await admin.storage.from('reports').remove([pdfPath]);
      if (orgId) await admin.from('organization').delete().eq('id', orgId);
      if (ownerId) {
        await admin.from('user').delete().eq('id', ownerId);
        await admin.auth.admin.deleteUser(ownerId);
      }
    } catch {
      // best-effort
    }
  });

  test('send report → email_event rows → webhook events → bounce audit + click association', async ({
    page,
  }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', ownerEmail);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });

    // Send.
    await page.goto(`/${slug}/reports/${reportId}`);
    await page.getByRole('button', { name: 'Enviar por email' }).click();
    await page
      .getByRole('dialog')
      .getByLabel(/Destinatarios/i)
      .fill(`${ownerEmail}\n${bounceEmail}\n${openEmail}`);
    await page.getByRole('dialog').getByRole('button', { name: 'Enviar' }).click();
    // Placeholder Resend key → the send is recorded with a warning, dialog stays open.
    await expect(page.getByText(/qued[óo] registrado/i)).toBeVisible();

    // Criterion 1: one send row per recipient, each carrying the PDF attachment.
    const { data: sends } = await admin
      .from('email_event')
      .select('recipient, event_type, provider_id, metadata')
      .eq('report_id', reportId)
      .in('event_type', ['sent', 'send_failed']);
    expect(sends).toHaveLength(3);
    for (const row of sends ?? []) {
      expect((row.metadata as { attachmentBytes?: number }).attachmentBytes ?? 0).toBeGreaterThan(0);
    }
    const providerId = sends?.[0]?.provider_id as string;
    expect(providerId).toBeTruthy();

    // Criterion 2: delivered / opened webhook events are logged.
    await webhook(page, 'email.delivered', { email_id: providerId, to: [ownerEmail] });
    await webhook(page, 'email.opened', { email_id: providerId, to: [openEmail] });

    // Criterion 3: a bounce is logged and written to the audit log.
    await webhook(page, 'email.bounced', { email_id: providerId, to: [bounceEmail] });

    // Criterion 4: a click for a known recipient is associated with the user.
    await webhook(page, 'email.clicked', {
      email_id: providerId,
      to: [ownerEmail],
      click: { link: 'https://reportes.app/e2e' },
    });

    const { data: events } = await admin
      .from('email_event')
      .select('event_type, recipient, metadata')
      .eq('provider_id', providerId);
    const byType = new Map((events ?? []).map((e) => [e.event_type, e]));
    expect(byType.has('delivered')).toBe(true);
    expect(byType.has('opened')).toBe(true);
    expect(byType.has('bounced')).toBe(true);

    const click = byType.get('clicked');
    expect(click, 'click event recorded').toBeTruthy();
    expect((click?.metadata as { userId?: string }).userId).toBe(ownerId);
    expect((click?.metadata as { click?: { link?: string } }).click?.link).toBe(
      'https://reportes.app/e2e',
    );

    const { data: bounceAudit } = await admin
      .from('audit_log')
      .select('action, metadata')
      .eq('org_id', orgId)
      .eq('action', 'email_bounce');
    expect(bounceAudit).toHaveLength(1);
    expect((bounceAudit?.[0]?.metadata as { recipient?: string }).recipient).toBe(bounceEmail);
  });
});
