import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * E1-T4 — signup → auto-created org → session → login.
 *
 * The MVP signup is frictionless: no verification email. `signUpAction` creates
 * the Supabase user with the email already confirmed, signs them in, bootstraps
 * a personal organization, and lands them in the onboarding wizard.
 *
 * The Playwright process does not load `.env.local` (only `pnpm dev` does), so
 * we parse it here for the Supabase keys.
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
    // env already present in the environment
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const PASSWORD = 'E2e-Passw0rd-8chars';
const email = `e2e-auth-${Date.now()}@e2e-reportes.dev`;

let admin: SupabaseClient;
let userId: string | null = null;
let orgSlug: string | null = null;

test.describe.configure({ mode: 'serial', timeout: 120_000 });

test.describe('auth flow', () => {
  test.use({ navigationTimeout: 90_000 });

  test.beforeAll(() => {
    expect(SUPABASE_URL, 'SUPABASE_URL must be set').not.toBe('');
    expect(SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY must be set').not.toBe('');
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  test.afterAll(async () => {
    if (!userId) return;
    try {
      await admin.from('organization').delete().eq('owner_id', userId);
      await admin.from('user').delete().eq('id', userId);
      await admin.auth.admin.deleteUser(userId);
    } catch {
      // best-effort cleanup
    }
  });

  async function findAuthUser(target: string) {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    return data.users.find((u) => u.email === target) ?? null;
  }

  test('signup creates a confirmed user, a personal org, and enters onboarding', async ({
    page,
  }) => {
    await page.goto('/auth/signup');
    await page.fill('input[name="name"]', 'E2E Tester');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');

    // criterion: frictionless — straight into the wizard, no "check your email"
    await page.waitForURL(/\/onboarding(\/step-1)?$/, { timeout: 90_000 });

    const created = await findAuthUser(email);
    expect(created, 'signup should have created a Supabase auth user').toBeTruthy();
    expect(created?.email_confirmed_at ?? null, 'user should be confirmed').not.toBeNull();
    userId = created?.id ?? null;

    const { data: orgs } = await admin
      .from('organization')
      .select('id, slug, owner_id')
      .eq('owner_id', userId ?? '');
    expect(orgs?.length, 'exactly one personal org should exist').toBe(1);
    orgSlug = orgs?.[0]?.slug ?? null;
    expect(orgSlug).toBeTruthy();

    const { data: members } = await admin
      .from('membership')
      .select('role')
      .eq('user_id', userId ?? '');
    expect(members?.length).toBe(1);
    expect(members?.[0]?.role).toBe('owner');
  });

  test('a duplicate signup is rejected with a visible error', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.fill('input[name="name"]', 'E2E Tester');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');

    await page.waitForURL(/\/auth\/signup\?error=exists/, { timeout: 90_000 });
    await expect(page.locator('p[role="alert"]')).toBeVisible();
  });

  test('login sets an HTTP-only session cookie, survives navigation, and clears on logout', async ({
    page,
    context,
  }) => {
    await context.clearCookies();

    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');

    // criterion 3: session cookie set, redirect to the org dashboard
    await page.waitForURL(new RegExp(`/${orgSlug}/dashboard$`), { timeout: 90_000 });
    const cookies = await context.cookies();
    const authCookie = cookies.find((c) => c.name.includes('auth-token'));
    expect(authCookie, 'a Supabase auth cookie should be set').toBeTruthy();
    expect(authCookie?.httpOnly).toBe(true);

    // criterion 4: navigating away and back keeps the session (middleware refresh path)
    await page.goto('/dashboard');
    await expect(page).toHaveURL(new RegExp(`/${orgSlug}/dashboard$`));

    // logout clears the cookie and re-protects the app
    await page.click('button:has-text("Cerrar sesión")');
    await page.waitForURL(/localhost:3000\/$/);
    await page.goto('/dashboard');
    await page.waitForURL(/\/auth\/signin/);
  });
});
