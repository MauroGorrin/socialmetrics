import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * E3-T5 — audit logging: saving a month of metrics logs an entry with actor +
 * metadata, deleting a metric logs the before-values, the admin viewer shows
 * actor + time, and the action-type filter narrows the list.
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
const ownerEmail = `e3-audit-${stamp}@e2e-reportes.dev`;
const slug = `e3-audit-${stamp}`;

let admin: SupabaseClient;
let ownerId = '';
let orgId = '';
let clientId = '';

test.describe.configure({ mode: 'serial', timeout: 150_000 });

test.describe('audit logging', () => {
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
      .insert({ name: 'E3 Audit Org', slug, owner_id: ownerId })
      .select('id')
      .single();
    orgId = org?.id as string;
    await admin
      .from('membership')
      .insert({ org_id: orgId, user_id: ownerId, role: 'owner', accepted_at: new Date().toISOString() });
    const { data: client } = await admin
      .from('client')
      .insert({ org_id: orgId, name: 'Audit Cliente', platform: 'meta', created_by: ownerId })
      .select('id')
      .single();
    clientId = client?.id as string;
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

  test('save + delete metric are logged; viewer shows actor and filters by action', async ({
    page,
  }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', ownerEmail);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });

    // Save a month of metrics through the grid (→ audit 'metric.month.save').
    await page.goto(`/${slug}/metrics?client=${clientId}&month=2026-09`);
    await page.fill('input[name="clicks"]', '77');
    await page.fill('input[name="impressions"]', '2000');
    await page.getByRole('button', { name: 'Guardar el mes' }).click();
    await page.waitForURL(/saved=1/, { timeout: 90_000 });

    await expect
      .poll(async () => {
        const { count } = await admin
          .from('audit_log')
          .select('id', { count: 'exact', head: true })
          .eq('org_id', orgId)
          .eq('action', 'metric.month.save');
        return count;
      })
      .toBe(1);

    // Delete one row through the org API (→ audit 'metric.delete' with before-values).
    const { data: seededMetric } = await admin
      .from('metric')
      .select('id')
      .eq('org_id', orgId)
      .eq('metric_name', 'clicks')
      .single();
    const del = await page.request.delete(`/api/orgs/${slug}/metrics/${seededMetric?.id}`);
    expect(del.status()).toBe(200);

    // Criterion 3: the delete entry carries the before-values.
    const { data: deleteEntry } = await admin
      .from('audit_log')
      .select('metadata')
      .eq('org_id', orgId)
      .eq('action', 'metric.delete')
      .single();
    const before = (deleteEntry?.metadata as { before?: Record<string, unknown> })?.before;
    expect(before?.metricName).toBe('clicks');
    expect(String(before?.metricValue)).toContain('77');

    // Criterion 2: the viewer shows both entries with actor + timestamp.
    await page.goto(`/${slug}/settings/audit`);
    const saveRow = page.locator('tr[data-action="metric.month.save"]');
    const deleteRow = page.locator('tr[data-action="metric.delete"]');
    await expect(saveRow).toHaveCount(1);
    await expect(deleteRow).toHaveCount(1);
    await expect(saveRow).toContainText(ownerEmail);
    await expect(saveRow.locator('td').first()).not.toBeEmpty();

    // Criterion 4: filter to one action type.
    await page.selectOption('select[name="action"]', 'metric.month.save');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForURL(/action=metric\.month\.save/);
    await expect(page.locator('tr[data-action="metric.month.save"]')).toHaveCount(1);
    await expect(page.locator('tr[data-action="metric.delete"]')).toHaveCount(0);
  });
});
