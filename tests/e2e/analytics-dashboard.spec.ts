import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, type Page, test } from '@playwright/test';

/**
 * Full BrightBean dashboard anatomy against a client with real data: the
 * client-switcher pill, the range pill-group, the hero row (stat cards with
 * sparklines + the grouped card), the metric-toggle hero chart, and the
 * dark-mode toggle.
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
const MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const REF = '2026-09';

const stamp = Date.now();
const userEmail = `e2e-adash-${stamp}@e2e-reportes.dev`;
const slug = `e2e-adash-${stamp}`;

let admin: SupabaseClient;
let userId = '';
let orgId = '';
let clientId = '';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

async function signIn(page: Page): Promise<void> {
  await page.goto('/auth/signin');
  await page.fill('input[name="email"]', userEmail);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });
}

test.describe('analytics dashboard — full anatomy', () => {
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
      .insert({ name: 'E2E Analytics Org', slug, owner_id: userId })
      .select('id')
      .single();
    orgId = org?.id ?? '';
    await admin.from('membership').insert({
      org_id: orgId,
      user_id: userId,
      role: 'owner',
      accepted_at: new Date().toISOString(),
    });

    const { data: c } = await admin
      .from('client')
      .insert({ org_id: orgId, name: 'Cliente Datos', platform: 'meta', created_by: userId })
      .select('id')
      .single();
    clientId = c?.id ?? '';
    expect(clientId).not.toBe('');

    const rows = MONTHS.flatMap((month, i) => {
      const base = 1000 * (i + 1);
      return [
        { metric_name: 'impressions', metric_value: base * 10 },
        { metric_name: 'clicks', metric_value: base * (0.3 + i * 0.05) },
        { metric_name: 'spend', metric_value: base * 0.25 },
        { metric_name: 'conversions', metric_value: 20 + i * 5 },
        // conv_value grows faster than spend so ROAS varies month to month
        { metric_name: 'conversion_value', metric_value: base * (1.3 + i * 0.25) },
      ].map((r) => ({
        org_id: orgId,
        client_id: clientId,
        metric_name: r.metric_name,
        metric_value: r.metric_value,
        period: `${month}-01`,
        created_by: userId,
      }));
    });
    await admin.from('metric').insert(rows);
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

  test('client switcher lists the seeded client', async ({ page }) => {
    await signIn(page);
    await page.goto(`/${slug}/dashboard?month=${REF}&period=6`);

    const trigger = page.getByRole('button', { name: /Todos los clientes/ });
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.getByRole('option', { name: /Cliente Datos/ })).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('range pill-group changes the period param', async ({ page }) => {
    await signIn(page);
    await page.goto(`/${slug}/dashboard?month=${REF}&period=6`);

    await page.getByRole('button', { name: '12M', exact: true }).click();
    await page.waitForURL(/period=12/);
  });

  test('hero row shows sparkline SVGs and the grouped card', async ({ page }) => {
    await signIn(page);
    await page.goto(`/${slug}/dashboard?month=${REF}&period=6`);

    // 3 stat-card sparklines + the grouped card's feature sparkline.
    await expect
      .poll(() => page.locator('svg[preserveAspectRatio="none"]').count())
      .toBeGreaterThanOrEqual(4);
    // The grouped card feature (ROAS) is present as a heading-sized value.
    await expect(page.getByText('ROAS', { exact: true }).first()).toBeVisible();
  });

  test('metric-toggle chip changes chart_metric and the chart header', async ({ page }) => {
    await signIn(page);
    await page.goto(`/${slug}/dashboard?month=${REF}&period=6`);

    await expect(page.getByText(/Impresiones · últimos \d+ meses/)).toBeVisible();
    await page.getByRole('button', { name: 'ROAS', exact: true }).click();
    await page.waitForURL(/chart_metric=roas/);
    await expect(page.getByText(/ROAS · últimos \d+ meses/)).toBeVisible();
  });

  test('theme toggle flips data-theme and persists to localStorage', async ({ page }) => {
    await signIn(page);
    await page.goto(`/${slug}/dashboard?month=${REF}`);

    const before = await page.evaluate(() => document.documentElement.dataset.theme ?? 'light');
    await page.getByRole('button', { name: /Cambiar a tema/ }).click();

    const want = before === 'dark' ? 'light' : 'dark';
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe(want);
    expect(await page.evaluate(() => localStorage.getItem('reportes-theme'))).toBe(want);
  });
});
