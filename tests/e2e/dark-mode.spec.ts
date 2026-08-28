import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { expect, type Page, test } from '@playwright/test';

/**
 * E3-T2 — dark mode: the toggle swaps colors with no reload, the choice
 * survives a reload, OS dark preference auto-activates on first visit with no
 * stored choice, and `prefers-reduced-motion` zeroes transitions.
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
const email = `e3-theme-${stamp}@e2e-reportes.dev`;
const slug = `e3-theme-${stamp}`;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
let userId = '';
let orgId = '';

test.describe.configure({ mode: 'serial', timeout: 150_000 });

async function signIn(page: Page): Promise<void> {
  await page.goto('/auth/signin');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });
}

const rootTheme = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.theme ?? null);
const bgVar = (page: Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--background').trim(),
  );

test.describe('dark mode', () => {
  test.use({ navigationTimeout: 90_000 });

  test.beforeAll(async () => {
    expect(SUPABASE_URL).not.toBe('');
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
      .insert({ name: 'E3 Theme Org', slug, owner_id: userId })
      .select('id')
      .single();
    orgId = org?.id as string;
    await admin
      .from('membership')
      .insert({ org_id: orgId, user_id: userId, role: 'owner', accepted_at: new Date().toISOString() });
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

  test('toggle inverts colors without reload and the choice persists', async ({ page }) => {
    await signIn(page);

    const before = await rootTheme(page);
    const bgBefore = await bgVar(page);

    await page.getByRole('button', { name: /Cambiar a tema/ }).click();

    await expect
      .poll(() => rootTheme(page))
      .toBe(before === 'dark' ? 'light' : 'dark');
    expect(await bgVar(page)).not.toBe(bgBefore);
    expect(await page.evaluate(() => localStorage.getItem('reportes-theme'))).toBe(
      before === 'dark' ? 'light' : 'dark',
    );

    const afterToggle = await rootTheme(page);
    await page.reload();
    expect(await rootTheme(page)).toBe(afterToggle);
  });

  test('OS dark preference auto-activates on first visit with no stored choice', async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await signIn(page);

    expect(await rootTheme(page)).toBe('dark');
    expect(await page.evaluate(() => localStorage.getItem('reportes-theme'))).toBeNull();
    await context.close();
  });

  test('prefers-reduced-motion zeroes transitions', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await signIn(page);

    const duration = await page
      .locator('aside nav a')
      .first()
      .evaluate((el) => getComputedStyle(el).transitionDuration);
    // `transition-colors duration-150` would be 0.15s without the reduced-motion override.
    expect(Number.parseFloat(duration)).toBeLessThan(0.05);
    await context.close();
  });
});
