import { createCipheriv, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * Ad-platform connect → pick account → backfill → grid read-only.
 *
 * The provider is stubbed at `getProvider` (playwright.config.ts sets
 * `ADS_PROVIDER_STUB=1` on the web server), so nothing leaves the machine. The
 * stub's TOKEN_ENCRYPTION_KEY is mirrored here to seed a decryptable pending
 * connection.
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

// Mirrors playwright.config.ts webServer.env.TOKEN_ENCRYPTION_KEY (32 bytes).
const TOKEN_KEY = Buffer.from('e2e-e2e-e2e-e2e-e2e-e2e-e2e-e2e-');

function encToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', TOKEN_KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64')).join('.');
}

const stamp = Date.now();
const email = `e2e-adsint-${stamp}@e2e-reportes.dev`;
const slug = `e2e-adsint-${stamp}`;

let admin: SupabaseClient;
let userId = '';
let orgId = '';
let clientId = '';
let connectionId = '';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.describe('ads integration — connect + backfill + grid lock', () => {
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
      .insert({ name: 'E2E Ads Int Org', slug, owner_id: userId })
      .select('id')
      .single();
    orgId = org?.id ?? '';
    await admin.from('membership').insert({
      org_id: orgId,
      user_id: userId,
      role: 'owner',
      accepted_at: new Date().toISOString(),
    });

    const { data: client } = await admin
      .from('client')
      .insert({ org_id: orgId, name: 'Cliente Ads', report_profile: 'ads', created_by: userId })
      .select('id')
      .single();
    clientId = client?.id ?? '';

    const { data: conn } = await admin
      .from('platform_connection')
      .insert({
        org_id: orgId,
        client_id: clientId,
        platform: 'meta',
        status: 'pending',
        access_token_encrypted: encToken('stub-access'),
        refresh_token_encrypted: encToken('stub-refresh'),
        connected_by: userId,
      })
      .select('id')
      .single();
    connectionId = conn?.id ?? '';
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

  test('pick account → backfill writes source=meta rows → grid ads fields disabled', async ({
    page,
  }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });

    // Account picker (stub returns one account).
    await page.goto(`/${slug}/clients/${clientId}/integrations/meta`);
    await expect(page.getByText('Cuenta de prueba')).toBeVisible();
    await page.getByRole('button', { name: 'Conectar y sincronizar' }).click();
    await page.waitForURL(new RegExp(`/${slug}/clients/${clientId}\\?connected=1$`));

    // Backfill wrote source=meta rows spanning ~12 months.
    const { data: rows } = await admin
      .from('metric')
      .select('period, metric_name, metric_value')
      .eq('client_id', clientId)
      .eq('source', 'meta')
      .order('period', { ascending: true });
    expect((rows ?? []).length).toBeGreaterThan(0);
    const earliest = new Date(`${rows?.[0].period}T00:00:00Z`);
    const monthsBack =
      (Date.now() - earliest.getTime()) / (1000 * 60 * 60 * 24 * 30);
    expect(monthsBack).toBeGreaterThan(9);

    // The connection is now connected.
    const { data: conn } = await admin
      .from('platform_connection')
      .select('status, external_account_id')
      .eq('id', connectionId)
      .single();
    expect(conn?.status).toBe('connected');
    expect(conn?.external_account_id).toBe('stub-account-1');

    // The metrics grid renders the ad inputs read-only.
    await page.goto(`/${slug}/metrics?client=${clientId}`);
    await expect(page.getByText(/se sincronizan desde Meta Ads/i)).toBeVisible();
    await expect(page.locator('input[name="spend"]')).toBeDisabled();

    // The client page shows the connected card.
    await page.goto(`/${slug}/clients/${clientId}`);
    await expect(page.getByRole('button', { name: 'Desconectar' })).toBeVisible();
  });

  test('a second client reuses the agency grant — straight to the picker, no OAuth', async ({
    page,
  }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });

    const { data: client2 } = await admin
      .from('client')
      .insert({ org_id: orgId, name: 'Cliente Ads 2', report_profile: 'ads', created_by: userId })
      .select('id')
      .single();
    const client2Id = client2?.id ?? '';

    // The connect endpoint should not bounce to Facebook — the org already has a
    // grant from the first client (finalized to `connected` in the test above).
    await page.goto(`/api/integrations/meta/connect?clientId=${client2Id}`);
    await page.waitForURL(
      new RegExp(`/${slug}/clients/${client2Id}/integrations/meta$`),
      { timeout: 30_000 },
    );
    expect(page.url()).not.toContain('facebook.com');

    const { data: conn2 } = await admin
      .from('platform_connection')
      .select('status, access_token_encrypted')
      .eq('client_id', client2Id)
      .eq('platform', 'meta')
      .single();
    expect(conn2?.status).toBe('pending');
    expect(conn2?.access_token_encrypted).toBeTruthy();
  });
});
