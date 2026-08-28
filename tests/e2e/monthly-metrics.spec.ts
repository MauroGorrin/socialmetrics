import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * Monthly metric entry grid — one total per base metric, per client, per month.
 * Saving replaces the whole month (no duplicate rows), CTR/CPL/ROAS are derived,
 * and the report picks the figures up.
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
const ownerEmail = `e2e-metrics-${stamp}@e2e-reportes.dev`;
const slug = `e2e-metrics-${stamp}`;

let admin: SupabaseClient;
let ownerId = '';
let orgId = '';
let clientId = '';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.describe('monthly metric entry', () => {
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
      .insert({ name: 'E2E Metrics Org', slug, owner_id: ownerId })
      .select('id')
      .single();
    orgId = org?.id ?? '';
    await admin.from('membership').insert({
      org_id: orgId,
      user_id: ownerId,
      role: 'owner',
      accepted_at: new Date().toISOString(),
    });
    const { data: client } = await admin
      .from('client')
      .insert({ org_id: orgId, name: 'Cliente Mensual', platform: 'meta', created_by: ownerId })
      .select('id')
      .single();
    clientId = client?.id ?? '';
  });

  test.afterAll(async () => {
    try {
      if (orgId) await admin.from('organization').delete().eq('id', orgId);
      if (ownerId) {
        await admin.from('user').delete().eq('id', ownerId);
        await admin.auth.admin.deleteUser(ownerId);
      }
    } catch {
      // best-effort
    }
  });

  async function monthRows() {
    const { data } = await admin
      .from('metric')
      .select('metric_name, metric_value, period')
      .eq('client_id', clientId)
      .gte('period', `${MONTH}-01`)
      .lt('period', '2026-10-01');
    return data ?? [];
  }

  test('save the month, re-save without duplicating, and derive the ratios', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', ownerEmail);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });

    // Enter the month's totals.
    await page.goto(`/${slug}/metrics?client=${clientId}&month=${MONTH}`);
    await page.fill('input[name="impressions"]', '10000');
    await page.fill('input[name="clicks"]', '400');
    await page.fill('input[name="spend"]', '200');
    await page.fill('input[name="conversions"]', '20');
    await page.fill('input[name="conversion_value"]', '800');
    await page.getByRole('button', { name: 'Guardar el mes' }).click();

    await page.waitForURL(/saved=1/, { timeout: 90_000 });
    await expect(page.getByText('Métricas del mes guardadas.')).toBeVisible();

    // Five base-metric rows, all on the first of the month.
    await expect.poll(async () => (await monthRows()).length).toBe(5);
    let rows = await monthRows();
    expect(new Set(rows.map((r) => r.period))).toEqual(new Set([`${MONTH}-01`]));
    expect(Number(rows.find((r) => r.metric_name === 'impressions')?.metric_value)).toBe(10000);

    // The grid is pre-filled from the saved month. Reload to a clean URL (no
    // `saved=1`) so the next save's redirect is an observable change.
    await page.goto(`/${slug}/metrics?client=${clientId}&month=${MONTH}`);
    await expect(page.locator('input[name="impressions"]')).toHaveValue('10000');

    // Re-saving with a changed figure updates in place — still five rows.
    await page.fill('input[name="impressions"]', '12000');
    await page.getByRole('button', { name: 'Guardar el mes' }).click();
    await page.waitForURL(/saved=1/, { timeout: 90_000 });
    await page.goto(`/${slug}/metrics?client=${clientId}&month=${MONTH}`);
    await expect(page.locator('input[name="impressions"]')).toHaveValue('12000');

    await expect
      .poll(async () =>
        Number((await monthRows()).find((r) => r.metric_name === 'impressions')?.metric_value),
      )
      .toBe(12000);
    rows = await monthRows();
    expect(rows.length).toBe(5);
    // ctr / cpl / roas are never written — they are derived.
    expect(rows.some((r) => ['ctr', 'cpl', 'roas'].includes(r.metric_name))).toBe(false);

    // The report for that month reflects the entered figures with computed CTR.
    const res = await page.request.post('/api/reports/generate', {
      data: { orgSlug: slug, periodMonth: MONTH },
    });
    expect(res.status(), await res.text()).toBe(201);
    const reportId = (await res.json()).data.reportId;

    await page.goto(`/${slug}/reports/${reportId}`);
    const impressionsKpi = page.locator('[data-kpi="impressions"]');
    await expect(impressionsKpi).toContainText('12.000');
    await expect(page.locator('[data-kpi="ctr"]')).toContainText('3,33%'); // 400 / 12000
  });
});
