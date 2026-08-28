import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * Dashboard — the per-client overview: a card per client showing the selected
 * month's KPIs (with a delta once there's a prior month), the month picker, and
 * the report-of-the-month row.
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
const MONTH = '2026-09';

const stamp = Date.now();
const userEmail = `e2e-dash-${stamp}@e2e-reportes.dev`;
const slug = `e2e-dash-${stamp}`;

let admin: SupabaseClient;
let userId = '';
let orgId = '';
let clientUnoId = '';

test.describe.configure({ mode: 'serial', timeout: 150_000 });

test.describe('dashboard overview', () => {
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
    const { data: org } = await admin
      .from('organization')
      .insert({ name: 'E2E Dash Org', slug, owner_id: userId })
      .select('id')
      .single();
    orgId = org?.id ?? '';
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
    expect(clientUnoId).not.toBe('');
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

  test('client cards, no-data state, month picker, and report row', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', userEmail);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });

    // A card per client; no metrics yet → the no-data state + report "Sin generar".
    await page.goto(`/${slug}/dashboard?month=${MONTH}`);
    const cards = page.locator('article');
    await expect(cards).toHaveCount(2);
    await expect(page.getByText('Cliente Uno')).toBeVisible();
    await expect(page.getByText('Sin datos cargados para este mes').first()).toBeVisible();
    await expect(page.getByText('Sin generar')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Generar reporte' })).toBeVisible();

    // Seed one client's month → its card shows the figures.
    await admin.from('metric').insert([
      { org_id: orgId, client_id: clientUnoId, metric_name: 'impressions', metric_value: 12000, period: `${MONTH}-01`, created_by: userId },
      { org_id: orgId, client_id: clientUnoId, metric_name: 'clicks', metric_value: 480, period: `${MONTH}-01`, created_by: userId },
      { org_id: orgId, client_id: clientUnoId, metric_name: 'spend', metric_value: 300, period: `${MONTH}-01`, created_by: userId },
    ]);

    await page.goto(`/${slug}/dashboard?month=${MONTH}`);
    const unoCard = page.locator('article', { hasText: 'Cliente Uno' });
    await expect(unoCard).toContainText('12.000');
    await expect(unoCard).toContainText('4%'); // CTR 480 / 12000
    await expect(unoCard.getByRole('link', { name: 'Editar datos' })).toBeVisible();

    // Month picker moves the view.
    await page.goto(`/${slug}/dashboard`);
    await page.fill('input[name="month"]', MONTH);
    await page.getByRole('button', { name: 'Ver' }).click();
    await page.waitForURL(new RegExp(`month=${MONTH}`));
  });
});
