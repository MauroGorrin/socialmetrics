import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * E2-T3 — report generation: generate a monthly PDF for 3 clients within 30s,
 * find it in Supabase Storage at `{orgId}/{reportId}.pdf`, see all six charts
 * on the report view, and regenerate (same row, PDF overwritten) after a
 * metric changes.
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
const PERIOD = '2026-08';
const METRIC_KEYS = ['impressions', 'clicks', 'spend', 'roas', 'ctr', 'cpl'] as const;

const stamp = Date.now();
const ownerEmail = `e2e-report-${stamp}@e2e-reportes.dev`;
const slug = `e2e-report-${stamp}`;

let admin: SupabaseClient;
let ownerId = '';
let orgId = '';
let reportId = '';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.describe('report generation', () => {
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
      .insert({ name: 'E2E Report Org', slug, owner_id: ownerId })
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

    const { data: seededClients } = await admin
      .from('client')
      .insert([
        { org_id: orgId, name: 'Cliente A', platform: 'meta', created_by: ownerId },
        { org_id: orgId, name: 'Cliente B', platform: 'google_ads', created_by: ownerId },
        { org_id: orgId, name: 'Cliente C', platform: 'tiktok', created_by: ownerId },
      ])
      .select('id');

    const metricRows = (seededClients ?? []).flatMap((client, ci) =>
      METRIC_KEYS.map((key, mi) => ({
        org_id: orgId,
        client_id: client.id,
        metric_name: key,
        metric_value: 100 * (ci + 1) + mi,
        period: `${PERIOD}-1${ci}`,
        created_by: ownerId,
      })),
    );
    expect((await admin.from('metric').insert(metricRows)).error).toBeNull();
  });

  test.afterAll(async () => {
    try {
      if (orgId && reportId) {
        await admin.storage.from('reports').remove([`${orgId}/${reportId}.pdf`]);
      }
      if (orgId) await admin.from('organization').delete().eq('id', orgId);
      if (ownerId) {
        await admin.from('user').delete().eq('id', ownerId);
        await admin.auth.admin.deleteUser(ownerId);
      }
    } catch {
      // best-effort
    }
  });

  test('generate → storage → charts → regenerate', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', ownerEmail);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });

    // Criterion 1: generate within 30s.
    const started = Date.now();
    const res = await page.request.post('/api/reports/generate', {
      data: { orgSlug: slug, periodMonth: PERIOD },
    });
    expect(res.status(), await res.text()).toBe(201);
    expect(Date.now() - started).toBeLessThan(30_000);
    reportId = (await res.json()).data.reportId;
    expect(reportId).toBeTruthy();

    // Criterion 2: the PDF exists in storage at the expected path.
    const download = await admin.storage.from('reports').download(`${orgId}/${reportId}.pdf`);
    expect(download.error).toBeNull();
    const bytes = Buffer.from(await download.data!.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(1000);

    const { data: firstRow } = await admin
      .from('report')
      .select('generated_at, pdf_url, status')
      .eq('id', reportId)
      .single();
    expect(firstRow?.pdf_url).toBe(`${orgId}/${reportId}.pdf`);
    expect(firstRow?.status).toBe('generated');
    const firstGeneratedAt = firstRow?.generated_at as string;

    // Criterion 3: the report view shows all six charts.
    await page.goto(`/${slug}/reports/${reportId}`);
    for (const key of METRIC_KEYS) {
      await expect(page.locator(`[data-section="${key}"]`)).toBeVisible();
    }
    expect(await page.locator('svg[data-metric]').count()).toBe(METRIC_KEYS.length);

    // Criterion 4: a metric changes → regenerate reuses the row and overwrites.
    await new Promise((r) => setTimeout(r, 1100));
    const { data: clientA } = await admin
      .from('client')
      .select('id')
      .eq('org_id', orgId)
      .eq('name', 'Cliente A')
      .single();
    await admin.from('metric').insert({
      org_id: orgId,
      client_id: clientA?.id,
      metric_name: 'impressions',
      metric_value: 99999,
      period: `${PERIOD}-15`,
      created_by: ownerId,
    });

    const res2 = await page.request.post('/api/reports/generate', {
      data: { orgSlug: slug, periodMonth: PERIOD },
    });
    expect(res2.status()).toBe(201);
    expect((await res2.json()).data.reportId).toBe(reportId);

    const { data: secondRow } = await admin
      .from('report')
      .select('generated_at')
      .eq('id', reportId)
      .single();
    expect(new Date(secondRow?.generated_at ?? 0).getTime()).toBeGreaterThan(
      new Date(firstGeneratedAt).getTime(),
    );

    const regenerated = await admin.storage.from('reports').download(`${orgId}/${reportId}.pdf`);
    const regenBytes = Buffer.from(await regenerated.data!.arrayBuffer());
    expect(regenBytes.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
