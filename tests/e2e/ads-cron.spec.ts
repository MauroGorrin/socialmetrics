import { createCipheriv, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * POST /api/cron/sync-ads — bearer auth, and "API pisa todo" overwrite of a
 * connected client's current month. Provider stubbed (playwright.config.ts).
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
const CRON_SECRET = 'e2e-cron-secret'; // mirrors playwright.config.ts webServer.env
const TOKEN_KEY = Buffer.from('e2e-e2e-e2e-e2e-e2e-e2e-e2e-e2e-');

function encToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', TOKEN_KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64')).join('.');
}

function firstOfThisMonth(): string {
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

const stamp = Date.now();
const email = `e2e-adscron-${stamp}@e2e-reportes.dev`;
const slug = `e2e-adscron-${stamp}`;

let admin: SupabaseClient;
let userId = '';
let orgId = '';
let clientId = '';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.describe('ads cron', () => {
  test.beforeAll(async () => {
    expect(SUPABASE_URL).not.toBe('');
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: 'E2e-Passw0rd-8chars',
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error('createUser failed');
    userId = data.user.id;
    await admin.from('user').insert({ id: userId, email });

    const { data: org } = await admin
      .from('organization')
      .insert({ name: 'E2E Ads Cron Org', slug, owner_id: userId })
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
      .insert({ org_id: orgId, name: 'Cliente Cron', report_profile: 'ads', created_by: userId })
      .select('id')
      .single();
    clientId = client?.id ?? '';

    await admin.from('platform_connection').insert({
      org_id: orgId,
      client_id: clientId,
      platform: 'meta',
      status: 'connected',
      external_account_id: 'stub-account-1',
      access_token_encrypted: encToken('stub-access'),
      refresh_token_encrypted: encToken('stub-refresh'),
      connected_by: userId,
    });

    // A stale synced row the cron must overwrite.
    await admin.from('metric').insert({
      org_id: orgId,
      client_id: clientId,
      metric_name: 'spend',
      metric_value: '999.00',
      period: firstOfThisMonth(),
      source: 'meta',
      created_by: userId,
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

  test('401 without the bearer, 200 with it, and the month is overwritten', async ({ request }) => {
    const noAuth = await request.post('/api/cron/sync-ads');
    expect(noAuth.status()).toBe(401);

    const ok = await request.post('/api/cron/sync-ads', {
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });
    expect(ok.status()).toBe(200);
    const body = await ok.json();
    expect(body.errors).toEqual([]);
    expect(body.synced).toBeGreaterThanOrEqual(1);

    // The stale 999 row for this month is gone; the month holds the stub's figures.
    const { data: rows } = await admin
      .from('metric')
      .select('metric_value')
      .eq('client_id', clientId)
      .eq('source', 'meta')
      .eq('metric_name', 'spend')
      .eq('period', firstOfThisMonth());
    // Either replaced with a stub value or dropped (the stub dates rows at
    // `from`/`to`, not necessarily the 1st) — never the stale 999.
    for (const r of rows ?? []) expect(Number(r.metric_value)).not.toBe(999);
  });
});
