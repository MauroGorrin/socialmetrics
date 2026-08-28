import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * E3-T1 — branding: upload a logo (stored on Supabase Storage), see it embedded
 * when a report is (re)generated and on the public report view, with the org's
 * footer text; changing the logo regenerates pending reports.
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
const FOOTER = 'Mi Agencia LLC';

// 1x1 transparent PNG.
const LOGO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const stamp = Date.now();
const ownerEmail = `e3-brand-${stamp}@e2e-reportes.dev`;
const slug = `e3-brand-${stamp}`;

let admin: SupabaseClient;
let ownerId = '';
let orgId = '';
let reportId = '';
let token = '';

test.describe.configure({ mode: 'serial', timeout: 150_000 });

test.describe('branding', () => {
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

    const { data: org } = await admin
      .from('organization')
      .insert({ name: 'E3 Brand Org', slug, owner_id: ownerId })
      .select('id')
      .single();
    orgId = org?.id as string;
    await admin
      .from('membership')
      .insert({ org_id: orgId, user_id: ownerId, role: 'owner', accepted_at: new Date().toISOString() });

    const { data: client } = await admin
      .from('client')
      .insert({ org_id: orgId, name: 'Brand Cliente', platform: 'meta', created_by: ownerId })
      .select('id')
      .single();
    await admin.from('metric').insert({
      org_id: orgId,
      client_id: client?.id,
      metric_name: 'clicks',
      metric_value: 10,
      period: '2026-08-05',
      created_by: ownerId,
    });

    const { data: report } = await admin
      .from('report')
      .insert({
        org_id: orgId,
        period_month: '2026-08',
        status: 'generated',
        generated_at: new Date(Date.now() - 60_000).toISOString(),
      })
      .select('id')
      .single();
    reportId = report?.id as string;
    token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    await admin.storage
      .from('reports')
      .upload(`${orgId}/${reportId}.pdf`, Buffer.from('%PDF-1.4\n% placeholder\n%%EOF'), {
        contentType: 'application/pdf',
        upsert: true,
      });
    await admin
      .from('report')
      .update({
        pdf_url: `${orgId}/${reportId}.pdf`,
        shared_token: token,
        shared_at: new Date().toISOString(),
        shared_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .eq('id', reportId);
  });

  test.afterAll(async () => {
    try {
      await admin.storage.from('reports').remove([`${orgId}/${reportId}.pdf`]);
      await admin.storage
        .from('branding')
        .remove(['png', 'jpg', 'svg', 'webp'].map((ext) => `${orgId}/logo.${ext}`));
      if (orgId) await admin.from('organization').delete().eq('id', orgId);
      if (ownerId) {
        await admin.from('user').delete().eq('id', ownerId);
        await admin.auth.admin.deleteUser(ownerId);
      }
    } catch {
      // best-effort
    }
  });

  test('upload logo → stored, embedded in report + public view, pending report regenerated', async ({
    page,
    browser,
  }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', ownerEmail);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });

    const { data: before } = await admin
      .from('report')
      .select('generated_at')
      .eq('id', reportId)
      .single();

    // Upload logo + footer text.
    await page.goto(`/${slug}/settings/branding`);
    await page.setInputFiles('input[name="logo"]', {
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: LOGO_PNG,
    });
    await page.fill('input[name="footerText"]', FOOTER);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await page.waitForURL(/\?saved=1$/, { timeout: 90_000 });

    // Criterion 1: stored on Supabase Storage, org row updated.
    const { data: org } = await admin
      .from('organization')
      .select('logo_url, footer_text')
      .eq('id', orgId)
      .single();
    expect(org?.logo_url).toContain('/branding/');
    expect(org?.footer_text).toBe(FOOTER);
    const stored = await admin.storage.from('branding').download(`${orgId}/logo.png`);
    expect(stored.error).toBeNull();

    // Criterion 4: the pending report was regenerated.
    const { data: after } = await admin
      .from('report')
      .select('generated_at')
      .eq('id', reportId)
      .single();
    expect(new Date(after?.generated_at ?? 0).getTime()).toBeGreaterThan(
      new Date(before?.generated_at ?? 0).getTime(),
    );
    const pdf = await admin.storage.from('reports').download(`${orgId}/${reportId}.pdf`);
    const pdfBytes = Buffer.from(await pdf.data!.arrayBuffer());
    expect(pdfBytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdfBytes.length).toBeGreaterThan(2000); // real render, not the placeholder

    // Criterion 2/3: report view shows the logo + footer.
    await page.goto(`/${slug}/reports/${reportId}`);
    await expect(page.locator('img.report-logo')).toBeVisible();
    await expect(page.locator('.report-footer')).toHaveText(FOOTER);

    // Criterion 3: public view shows the logo + footer, no auth.
    const publicCtx = await browser.newContext();
    const publicPage = await publicCtx.newPage();
    const res = await publicPage.goto(`/public/reports/${token}`);
    expect(res?.status()).toBe(200);
    const logo = publicPage.locator('img.report-logo');
    await expect(logo).toBeVisible();
    expect(await logo.getAttribute('src')).toContain('/branding/');
    await expect(publicPage.locator('.report-footer')).toHaveText(FOOTER);
    await publicCtx.close();
  });
});
