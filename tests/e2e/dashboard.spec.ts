import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * E2-T1 — metrics dashboard: empty state, single-row display, pagination past
 * one page (page size 100), and the client filter. One test: each Playwright
 * test gets a fresh context, so the sign-in has to live with the assertions.
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
const PAGE_SIZE = 100;

const stamp = Date.now();
const userEmail = `e2e-dash-${stamp}@e2e-reportes.dev`;
const slug = `e2e-dash-${stamp}`;

let admin: SupabaseClient;
let userId = '';
let orgId = '';
let clientUnoId = '';
let clientDosId = '';

test.describe.configure({ mode: 'serial', timeout: 150_000 });

test.describe('metrics dashboard', () => {
  test.use({ navigationTimeout: 90_000 });

  test.beforeAll(async () => {
    expect(SUPABASE_URL).not.toBe('');
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.auth.admin.createUser({
      email: userEmail,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error('createUser failed');
    userId = data.user.id;

    await admin.from('user').insert({ id: userId, email: userEmail });
    const { data: org, error: orgErr } = await admin
      .from('organization')
      .insert({ name: 'E2E Dash Org', slug, owner_id: userId })
      .select('id')
      .single();
    if (orgErr || !org) throw orgErr ?? new Error('org insert failed');
    orgId = org.id;
    await admin.from('membership').insert({
      org_id: orgId,
      user_id: userId,
      role: 'owner',
      accepted_at: new Date().toISOString(),
    });

    const { data: seeded } = await admin
      .from('client')
      .insert([
        { org_id: orgId, name: 'Cliente Uno', platform: 'meta', created_by: userId },
        { org_id: orgId, name: 'Cliente Dos', platform: 'google_ads', created_by: userId },
      ])
      .select('id, name');
    clientUnoId = seeded?.find((c) => c.name === 'Cliente Uno')?.id ?? '';
    clientDosId = seeded?.find((c) => c.name === 'Cliente Dos')?.id ?? '';
    expect(clientUnoId).not.toBe('');
    expect(clientDosId).not.toBe('');
  });

  test.afterAll(async () => {
    try {
      if (orgId) await admin.from('organization').delete().eq('id', orgId);
      if (userId) {
        await admin.from('user').delete().eq('id', userId);
        await admin.auth.admin.deleteUser(userId);
      }
    } catch {
      // best-effort
    }
  });

  test('empty state, single-row entry, pagination, and client filter', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', userEmail);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });

    // 1. Empty state.
    await expect(page.getByText('No metrics yet')).toBeVisible();

    // 2. Add one metric via the form → one table row.
    await page.selectOption('select[name="clientId"]', { label: 'Cliente Uno' });
    await page.selectOption('select[name="metricName"]', 'clicks');
    await page.fill('input[name="metricValue"]', '50');
    await page.getByRole('button', { name: 'Agregar métrica' }).click();

    await expect(page.getByText('No metrics yet')).toBeHidden();
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Cliente Uno');
    await expect(rows.first()).toContainText('Clics');
    await expect(rows.first()).toContainText('50');

    // 3. Pagination once metrics exceed one page.
    const bulk = Array.from({ length: 200 }, (_, i) => ({
      org_id: orgId,
      client_id: clientUnoId,
      metric_name: 'impressions',
      metric_value: 100 + i,
      period: '2026-08-01',
      created_by: userId,
    }));
    expect((await admin.from('metric').insert(bulk)).error).toBeNull();

    await page.goto(`/${slug}/dashboard`);
    await expect(page.locator('tbody tr')).toHaveCount(PAGE_SIZE);
    const next = page.getByRole('link', { name: 'Siguiente' });
    await expect(next).toBeVisible();
    await next.click();
    await page.waitForURL(/\?page=2$/);
    await expect(page.locator('tbody tr')).toHaveCount(PAGE_SIZE);
    await expect(page.getByRole('link', { name: 'Anterior' })).toBeVisible();

    // 4. Filter by client.
    expect(
      (
        await admin.from('metric').insert([
          { org_id: orgId, client_id: clientDosId, metric_name: 'spend', metric_value: 10, period: '2026-08-02', created_by: userId },
          { org_id: orgId, client_id: clientDosId, metric_name: 'spend', metric_value: 20, period: '2026-08-03', created_by: userId },
          { org_id: orgId, client_id: clientDosId, metric_name: 'clicks', metric_value: 5, period: '2026-08-04', created_by: userId },
        ])
      ).error,
    ).toBeNull();

    await page.goto(`/${slug}/dashboard`);
    await page.selectOption('form[method="get"] select[name="client"]', { label: 'Cliente Dos' });
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForURL(new RegExp(`client=${clientDosId}`));

    const filtered = page.locator('tbody tr');
    await expect(filtered).toHaveCount(3);
    const firstCells = await filtered.locator('td:first-child').allInnerTexts();
    expect(firstCells).toEqual(['Cliente Dos', 'Cliente Dos', 'Cliente Dos']);
    await expect(page.locator('tbody')).not.toContainText('Cliente Uno');
  });
});
