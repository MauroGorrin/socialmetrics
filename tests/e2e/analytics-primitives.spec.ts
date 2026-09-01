import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, type Page, test } from '@playwright/test';

/**
 * Behavioural + accessibility contract for the dashboard primitives: the
 * empty states of the hero chart and stat-card sparklines, the "nuevo" delta
 * for a metric with no prior value, `aria-pressed` on the range pill-group,
 * and the keyboard-operable client switcher.
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
const userEmail = `e2e-prim-${stamp}@e2e-reportes.dev`;
const slug = `e2e-prim-${stamp}`;

let admin: SupabaseClient;
let userId = '';
let orgId = '';
let clientId = '';

test.describe.configure({ mode: 'serial', timeout: 150_000 });

async function signIn(page: Page): Promise<void> {
  await page.goto('/auth/signin');
  await page.fill('input[name="email"]', userEmail);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });
}

test.describe('dashboard primitives — empty states + a11y', () => {
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
      .insert({ name: 'E2E Primitives Org', slug, owner_id: userId })
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
      .insert({ org_id: orgId, name: 'Cliente Sin Datos', platform: 'meta', created_by: userId })
      .select('id')
      .single();
    clientId = c?.id ?? '';
    expect(clientId).not.toBe('');
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

  test('hero chart + sparklines render their empty state with no thrown error', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await signIn(page);
    await page.goto(`/${slug}/dashboard?period=6`);

    // Hero chart empty state.
    await expect(page.getByText('Sin datos en este período').first()).toBeVisible();

    // No sparkline SVG anywhere — InlineSparkline renders null for a flat series.
    await expect(page.locator('svg[preserveAspectRatio="none"]')).toHaveCount(0);

    // A metric with no prior value shows "nuevo", not a delta pill.
    await expect(page.getByText('nuevo').first()).toBeVisible();

    expect(pageErrors).toEqual([]);
  });

  test('range pill-group exposes aria-pressed on exactly the active pill', async ({ page }) => {
    await signIn(page);
    await page.goto(`/${slug}/dashboard?period=6`);

    await expect(page.getByRole('button', { name: '6M', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    for (const label of ['1M', '3M', '12M']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    }
  });

  test('client switcher opens with Enter, closes with Escape, and clears the client param', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto(`/${slug}/dashboard?client=${clientId}`);

    const trigger = page.getByRole('button', { name: /Cliente Sin Datos/ });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('listbox')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // Re-open and pick "Todos los clientes" → the client param is dropped.
    await trigger.click();
    await page.getByRole('option', { name: 'Todos los clientes' }).click();
    await page.waitForURL((url) => !url.searchParams.has('client'));
  });
});
