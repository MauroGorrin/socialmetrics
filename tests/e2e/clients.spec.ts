import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * E1-T6 — client CRUD. Create (top of list), edit (persists across a hard
 * refresh), delete (soft delete: the row stays with `deleted_at` set and drops
 * out of the list).
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
const userEmail = `e2e-clients-${stamp}@e2e-reportes.dev`;
const slug = `e2e-clients-${stamp}`;

let admin: SupabaseClient;
let userId = '';
let orgId = '';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.describe('client CRUD', () => {
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
      .insert({ name: 'E2E Clients Org', slug, owner_id: userId })
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

  test('create, edit, hard-refresh persistence, and soft delete', async ({ page }) => {
    // Sign in.
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', userEmail);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });

    // Empty state.
    await page.goto(`/${slug}/clients`);
    await expect(page.getByText(/Todav[ií]a no cargaste clientes/i)).toBeVisible();

    // Create "Campaña Alfa".
    await page.getByRole('button', { name: 'Agregar cliente' }).click();
    await page.getByRole('dialog').getByLabel('Nombre').fill('Campaña Alfa');
    await page.getByRole('dialog').getByRole('button', { name: 'Crear' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('link', { name: /Campaña Alfa/ })).toBeVisible();

    // Create "Campaña Beta" — must land at the top of the list.
    await page.getByRole('button', { name: 'Agregar cliente' }).click();
    await page.getByRole('dialog').getByLabel('Nombre').fill('Campaña Beta');
    await page.getByRole('dialog').getByRole('button', { name: 'Crear' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    const rows = page.locator('ul li');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('Campaña Beta');
    await expect(rows.nth(1)).toContainText('Campaña Alfa');

    // Open Beta's detail, rename it.
    await page.getByRole('link', { name: /Campaña Beta/ }).click();
    await page.waitForURL(new RegExp(`/${slug}/clients/[0-9a-f-]+$`));
    const detailUrl = page.url();
    const clientId = new URL(detailUrl).pathname.split('/').pop() ?? '';
    expect(clientId).not.toBe('');

    await page.getByLabel('Nombre').fill('Campaña Beta v2');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await page.waitForURL(/\?saved=1$/);
    await expect(page.getByRole('heading', { name: 'Campaña Beta v2' })).toBeVisible();

    // Hard refresh the list — the rename persisted.
    await page.goto(`/${slug}/clients`);
    await expect(page.getByRole('link', { name: /Campaña Beta v2/ })).toBeVisible();

    // Delete it.
    await page.getByRole('link', { name: /Campaña Beta v2/ }).click();
    await page.waitForURL(new RegExp(`/${slug}/clients/${clientId}$`));
    await page.getByRole('button', { name: 'Eliminar cliente' }).click();
    await page.waitForURL(new RegExp(`/${slug}/clients$`));

    await expect(page.getByRole('link', { name: /Campaña Beta v2/ })).toBeHidden();
    await expect(page.getByRole('link', { name: /Campaña Alfa/ })).toBeVisible();

    // Soft delete, not hard: the row is still there with deleted_at set.
    const { data: deletedRow } = await admin
      .from('client')
      .select('id, name, deleted_at')
      .eq('id', clientId)
      .single();
    expect(deletedRow?.id).toBe(clientId);
    expect(deletedRow?.deleted_at).not.toBeNull();
  });
});
