import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * E3-T6 — hardening: sign-in is rate-limited per client IP (11th attempt in a
 * minute → 429), an unhandled render error hits the boundary with a friendly
 * message and a reference (no stack trace), and a deliberate error is logged
 * with a request id.
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
const ownerEmail = `e3-hard-${stamp}@e2e-reportes.dev`;
const slug = `e3-hard-${stamp}`;
const FAKE_IP = '203.0.113.77';

let admin: SupabaseClient;
let ownerId = '';
let orgId = '';

test.describe.configure({ mode: 'serial', timeout: 150_000 });

test.describe('hardening', () => {
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
      .insert({ name: 'E3 Hardening Org', slug, owner_id: ownerId })
      .select('id')
      .single();
    orgId = org?.id as string;
    await admin
      .from('membership')
      .insert({ org_id: orgId, user_id: ownerId, role: 'owner', accepted_at: new Date().toISOString() });
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

  test('sign-in rate limit, error boundary, and logged request id', async ({ page }) => {
    // Criterion 1: the 11th sign-in POST from one IP in a minute → 429. The
    // middleware short-circuits on method+path+IP, so a bodyless probe is enough
    // (and avoids hammering the real auth endpoint).
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await page.request.fetch('/auth/signin', {
        method: 'POST',
        headers: { 'x-forwarded-for': FAKE_IP, 'content-type': 'application/json' },
        data: JSON.stringify({ probe: i }),
        maxRedirects: 0,
        failOnStatusCode: false,
      });
      statuses.push(res.status());
      if (i === 10) {
        expect(res.status()).toBe(429);
        expect(await res.text()).toContain('Too many attempts');
      }
    }
    expect(statuses.slice(0, 10).every((s) => s !== 429)).toBe(true);

    // Sign in for the authenticated checks (page login carries no forwarded IP).
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', ownerEmail);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });

    // Criteria 2 & 6: an unhandled render error → friendly boundary, no stack trace.
    await page.goto(`/${slug}/dev-error`);
    await expect(page.getByRole('heading', { name: 'Algo salió mal' })).toBeVisible();
    await expect(page.getByText(/Referencia:/)).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain('Deliberate render error');
    expect(html).not.toContain('dev-error/page');

    // Criteria 3 & 4: deliberate error is captured with a request id.
    const debug = await page.request.get('/api/debug/error', { failOnStatusCode: false });
    expect(debug.status()).toBe(500);
    const body = await debug.json();
    expect(String(body.requestId)).toMatch(/[0-9a-f-]{8,}/);
  });
});
