import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * E2-T5 — public share links: create a link (unique token + URL), open it with
 * no session, 404 on an expired link, 404 on an unknown token, and a second
 * org's token only ever renders that org's report.
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
const ownerEmail = `e2e-share-${stamp}@e2e-reportes.dev`;
const slugA = `e2e-share-a-${stamp}`;
const slugB = `e2e-share-b-${stamp}`;

let admin: SupabaseClient;
let ownerId = '';
let orgAId = '';
let orgBId = '';
let reportAId = '';
let tokenB = '';

test.describe.configure({ mode: 'serial', timeout: 150_000 });

async function seedOrgWithReport(name: string, slug: string, ownerId: string) {
  const { data: org } = await admin
    .from('organization')
    .insert({ name, slug, owner_id: ownerId })
    .select('id')
    .single();
  const orgId = org?.id as string;
  await admin
    .from('membership')
    .insert({ org_id: orgId, user_id: ownerId, role: 'owner', accepted_at: new Date().toISOString() });
  const { data: client } = await admin
    .from('client')
    .insert({ org_id: orgId, name: `${name} Cliente`, platform: 'meta', created_by: ownerId })
    .select('id')
    .single();
  await admin.from('metric').insert({
    org_id: orgId,
    client_id: client?.id,
    metric_name: 'clicks',
    metric_value: 42,
    period: '2026-08-05',
    created_by: ownerId,
  });
  const { data: report } = await admin
    .from('report')
    .insert({ org_id: orgId, period_month: '2026-08', status: 'generated', generated_at: new Date().toISOString() })
    .select('id')
    .single();
  return { orgId, reportId: report?.id as string };
}

test.describe('public share', () => {
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

    const a = await seedOrgWithReport('Org A Share', slugA, ownerId);
    orgAId = a.orgId;
    reportAId = a.reportId;

    const b = await seedOrgWithReport('Org B Share', slugB, ownerId);
    orgBId = b.orgId;
    tokenB = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    await admin
      .from('report')
      .update({
        shared_token: tokenB,
        shared_at: new Date().toISOString(),
        shared_expires_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .eq('id', b.reportId);
  });

  test.afterAll(async () => {
    try {
      for (const id of [orgAId, orgBId].filter(Boolean)) {
        await admin.from('organization').delete().eq('id', id);
      }
      if (ownerId) {
        await admin.from('user').delete().eq('id', ownerId);
        await admin.auth.admin.deleteUser(ownerId);
      }
    } catch {
      // best-effort
    }
  });

  test('create link, open without auth, 404 on expired / unknown / cross-org', async ({
    page,
    browser,
  }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', ownerEmail);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/${slugA}/dashboard$`), { timeout: 90_000 });

    // Criterion 1: create a share link.
    await page.goto(`/${slugA}/reports/${reportAId}`);
    await page.getByRole('button', { name: 'Compartir' }).click();
    await page.waitForURL(/\?shared=[a-f0-9]{40,}/);
    const tokenA = new URL(page.url()).searchParams.get('shared') ?? '';
    expect(tokenA.length).toBeGreaterThan(30);
    await expect(page.getByText(`/public/reports/${tokenA}`, { exact: false })).toBeVisible();

    // Criterion 2: open it with a fresh, unauthenticated context.
    const publicCtx = await browser.newContext();
    const publicPage = await publicCtx.newPage();
    const ok = await publicPage.goto(`/public/reports/${tokenA}`);
    expect(ok?.status()).toBe(200);
    expect(publicPage.url()).not.toContain('/auth/signin');
    await expect(publicPage.getByRole('heading', { name: 'Org A Share' })).toBeVisible();
    await expect(publicPage.locator('[data-section="kpis"]')).toBeVisible();
    await expect(publicPage.getByText('Org A Share · Reporte compartido')).toBeVisible();

    // Criterion 3: expired link → 404.
    await admin
      .from('report')
      .update({ shared_expires_at: new Date(Date.now() - 1000).toISOString() })
      .eq('id', reportAId);
    const expired = await publicPage.goto(`/public/reports/${tokenA}`);
    expect(expired?.status()).toBe(404);

    // Criterion 4: unknown token → 404; org B's token renders only org B.
    const unknown = await publicPage.goto(`/public/reports/${'z'.repeat(48)}`);
    expect(unknown?.status()).toBe(404);

    const orgBView = await publicPage.goto(`/public/reports/${tokenB}`);
    expect(orgBView?.status()).toBe(200);
    await expect(publicPage.getByRole('heading', { name: 'Org B Share' })).toBeVisible();
    await expect(publicPage.getByText('Org A Share')).toHaveCount(0);

    await publicCtx.close();
  });
});
