import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * E1-T5 — multi-tenant isolation. Two orgs, A and B. User A must not be able to
 * read, update, or delete anything in org B through the `/api/orgs/[slug]/*`
 * routes, and every rejection must be a 404 that reveals nothing (never 403 —
 * a 403 confirms the org exists).
 *
 * Fixtures are seeded straight into Postgres with the service-role key; user A
 * then signs in through the UI so the browser context carries a real session.
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
const userAEmail = `e2e-tenant-a-${stamp}@e2e-reportes.dev`;
const userBEmail = `e2e-tenant-b-${stamp}@e2e-reportes.dev`;
const slugA = `e2e-a-${stamp}`;
const slugB = `e2e-b-${stamp}`;

let admin: SupabaseClient;
let userAId = '';
let userBId = '';
let orgAId = '';
let orgBId = '';
let clientAId = '';
let clientBId = '';
let metricBId = '';

test.describe.configure({ mode: 'serial', timeout: 120_000 });

async function createConfirmedUser(email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('createUser returned no user');
  return data.user.id;
}

async function seedOrg(slug: string, ownerId: string, ownerEmail: string): Promise<string> {
  await admin.from('user').insert({ id: ownerId, email: ownerEmail });
  const { data: org, error } = await admin
    .from('organization')
    .insert({ name: slug, slug, owner_id: ownerId })
    .select('id')
    .single();
  if (error || !org) throw error ?? new Error('org insert failed');
  await admin
    .from('membership')
    .insert({ org_id: org.id, user_id: ownerId, role: 'owner', accepted_at: new Date().toISOString() });
  return org.id as string;
}

test.describe('tenant isolation', () => {
  test.use({ navigationTimeout: 90_000 });

  test.beforeAll(async () => {
    expect(SUPABASE_URL).not.toBe('');
    expect(SERVICE_ROLE_KEY).not.toBe('');
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    userAId = await createConfirmedUser(userAEmail);
    userBId = await createConfirmedUser(userBEmail);
    orgAId = await seedOrg(slugA, userAId, userAEmail);
    orgBId = await seedOrg(slugB, userBId, userBEmail);

    const { data: clientA } = await admin
      .from('client')
      .insert({ org_id: orgAId, name: 'Org A Client', platform: 'meta', created_by: userAId })
      .select('id')
      .single();
    clientAId = clientA?.id ?? '';

    const { data: clientB } = await admin
      .from('client')
      .insert({ org_id: orgBId, name: 'Org B Secret Client', platform: 'meta', created_by: userBId })
      .select('id')
      .single();
    clientBId = clientB?.id ?? '';

    const { data: metricB } = await admin
      .from('metric')
      .insert({
        org_id: orgBId,
        client_id: clientBId,
        metric_name: 'clicks',
        metric_value: 1234,
        period: '2026-08-01',
        created_by: userBId,
      })
      .select('id')
      .single();
    metricBId = metricB?.id ?? '';

    expect(clientAId, 'org A client seeded').not.toBe('');
    expect(clientBId, 'org B client seeded').not.toBe('');
    expect(metricBId, 'org B metric seeded').not.toBe('');
  });

  test.afterAll(async () => {
    try {
      await admin.from('organization').delete().in('id', [orgAId, orgBId].filter(Boolean));
      await admin.from('user').delete().in('id', [userAId, userBId].filter(Boolean));
      if (userAId) await admin.auth.admin.deleteUser(userAId);
      if (userBId) await admin.auth.admin.deleteUser(userBId);
    } catch {
      // best-effort
    }
  });

  test('org A user cannot read, update, or delete org B data (all 404, no leak)', async ({
    page,
  }) => {
    // Sign in as user A through the UI so the context holds a real session.
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', userAEmail);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/${slugA}/dashboard$`), { timeout: 90_000 });

    // Positive control: A can list A's own clients.
    const ownList = await page.request.get(`/api/orgs/${slugA}/clients`);
    expect(ownList.status()).toBe(200);
    const ownBody = await ownList.json();
    expect(ownBody.data).toHaveLength(1);
    expect(ownBody.data[0].id).toBe(clientAId);

    // 1. Listing org B's clients → 404, nothing revealed.
    const crossList = await page.request.get(`/api/orgs/${slugB}/clients`);
    expect(crossList.status()).toBe(404);
    expect((await crossList.json()).data).toBeUndefined();

    // 2. Updating org B's client → 404.
    const crossUpdate = await page.request.patch(`/api/orgs/${slugB}/clients/${clientBId}`, {
      data: { name: 'pwned' },
    });
    expect(crossUpdate.status()).toBe(404);

    // 3. Deleting org B's metric → 404.
    const crossDelete = await page.request.delete(`/api/orgs/${slugB}/metrics/${metricBId}`);
    expect(crossDelete.status()).toBe(404);

    // 4. Also 404 (not 403) when addressing org B by its own slug with A's session.
    const crossClient = await page.request.get(`/api/orgs/${slugB}/clients/${clientBId}`);
    expect(crossClient.status()).toBe(404);

    // Org B's data is untouched.
    const { data: clientBRow } = await admin
      .from('client')
      .select('name')
      .eq('id', clientBId)
      .single();
    expect(clientBRow?.name).toBe('Org B Secret Client');
    const { data: metricBRow } = await admin
      .from('metric')
      .select('id')
      .eq('id', metricBId)
      .single();
    expect(metricBRow?.id).toBe(metricBId);
  });
});
