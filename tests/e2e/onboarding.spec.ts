import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * E3-T3 — onboarding wizard: forward steps are sequential (no skipping),
 * entered data is retained on "back", and finishing creates the org name, a
 * client, 30 seed metrics and a generated report, then lands on the report.
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
const ORG_NAME = 'Agencia Onboarding';

const stamp = Date.now();
const email = `e3-onb-${stamp}@e2e-reportes.dev`;
const slug = `onb-${stamp}`;

let admin: SupabaseClient;
let userId = '';
let orgId = '';

test.describe.configure({ mode: 'serial', timeout: 150_000 });

test.describe('onboarding wizard', () => {
  test.use({ navigationTimeout: 90_000 });

  test.beforeAll(async () => {
    expect(SUPABASE_URL).not.toBe('');
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error('createUser failed');
    userId = data.user.id;
    await admin.from('user').insert({ id: userId, email });
    const { data: org } = await admin
      .from('organization')
      .insert({ name: 'Sin configurar', slug, owner_id: userId })
      .select('id')
      .single();
    orgId = org?.id as string;
    await admin
      .from('membership')
      .insert({ org_id: orgId, user_id: userId, role: 'owner', accepted_at: new Date().toISOString() });
  });

  test.afterAll(async () => {
    try {
      const { data: reports } = await admin.from('report').select('id').eq('org_id', orgId);
      for (const report of reports ?? []) {
        await admin.storage.from('reports').remove([`${orgId}/${report.id}.pdf`]);
      }
      if (orgId) await admin.from('organization').delete().eq('id', orgId);
      if (userId) {
        await admin.from('user').delete().eq('id', userId);
        await admin.auth.admin.deleteUser(userId);
      }
    } catch {
      // best-effort
    }
  });

  test('sequential steps, data retention, and a generated first report', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });

    // Criterion 3: cannot jump ahead.
    await page.goto('/onboarding/step-3');
    await expect(page).toHaveURL(/\/onboarding\/step-1$/);

    // Step 1 — org name.
    await page.fill('input[name="orgName"]', ORG_NAME);
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page).toHaveURL(/\/onboarding\/step-2$/);

    // Criterion 2: back retains the org name.
    await page.getByRole('link', { name: /Atrás/ }).click();
    await expect(page).toHaveURL(/\/onboarding\/step-1$/);
    await expect(page.locator('input[name="orgName"]')).toHaveValue(ORG_NAME);
    await page.getByRole('button', { name: 'Siguiente' }).click();

    // Step 2 — client.
    await expect(page).toHaveURL(/\/onboarding\/step-2$/);
    await page.fill('input[name="clientName"]', 'Cliente Onboarding');
    await page.selectOption('select[name="clientPlatform"]', 'meta');
    await page.getByRole('button', { name: 'Siguiente' }).click();
    await expect(page).toHaveURL(/\/onboarding\/step-3$/);

    // Criterion 2 again: back retains the client name.
    await page.getByRole('link', { name: /Atrás/ }).click();
    await expect(page.locator('input[name="clientName"]')).toHaveValue('Cliente Onboarding');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    // Step 3 — seed 30 metrics.
    await expect(page).toHaveURL(/\/onboarding\/step-3$/);
    await page.getByRole('button', { name: 'Cargar 30 métricas' }).click();
    await expect(page).toHaveURL(/\/onboarding\/step-4$/);

    const { data: client } = await admin
      .from('client')
      .select('id')
      .eq('org_id', orgId)
      .single();
    const { count } = await admin
      .from('metric')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client?.id ?? '');
    expect(count).toBe(30);

    // Step 4 — generate.
    await page.getByRole('button', { name: 'Generar reporte' }).click();
    await page.waitForURL(/\/onboarding\/step-5$/, { timeout: 90_000 });

    // Step 5 — finish → report view.
    await page.getByRole('button', { name: 'Ver reporte' }).click();
    await page.waitForURL(new RegExp(`/${slug}/reports/[0-9a-f-]+$`), { timeout: 90_000 });
    const reportId = new URL(page.url()).pathname.split('/').pop();
    expect(reportId).toBeTruthy();
    await expect(page.locator('[data-section="kpis"]')).toBeVisible();

    // Criterion 1: org renamed, client + 30 metrics + report all created.
    const { data: finalOrg } = await admin
      .from('organization')
      .select('name')
      .eq('id', orgId)
      .single();
    expect(finalOrg?.name).toBe(ORG_NAME);
    const { data: report } = await admin
      .from('report')
      .select('status')
      .eq('id', reportId ?? '')
      .single();
    expect(report?.status).toBe('generated');
  });
});
