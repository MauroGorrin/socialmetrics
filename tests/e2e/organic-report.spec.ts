import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * Profile-aware reports: an organic client's monthly report renders the organic
 * template — community-growth hero, engagement KPIs, published content, the best
 * posts — and not the ads KPI grid.
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
const PERIOD = '2026-08';

const stamp = Date.now();
const ownerEmail = `e2e-organic-${stamp}@e2e-reportes.dev`;
const slug = `e2e-organic-${stamp}`;

let admin: SupabaseClient;
let ownerId = '';
let orgId = '';
let clientId = '';
let reportId = '';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.describe('organic report', () => {
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
      .insert({ name: 'E2E Organic Org', slug, owner_id: ownerId })
      .select('id')
      .single();
    orgId = org?.id as string;
    await admin.from('membership').insert({
      org_id: orgId,
      user_id: ownerId,
      role: 'owner',
      accepted_at: new Date().toISOString(),
    });

    const { data: client } = await admin
      .from('client')
      .insert({
        org_id: orgId,
        name: 'Marca Orgánica',
        platform: 'instagram',
        report_profile: 'organic',
        created_by: ownerId,
      })
      .select('id')
      .single();
    clientId = client?.id as string;

    const monthly: Array<[string, number]> = [
      ['followers_start', 4000],
      ['followers_end', 4520],
      ['reach', 41_000],
      ['impressions', 65_000],
      ['interactions', 3200],
      ['profile_visits', 2100],
      ['link_clicks', 480],
      ['posts_published', 12],
      ['stories_published', 40],
      ['video_views', 21_000],
    ];
    await admin.from('metric').insert(
      monthly.map(([metric_name, metric_value]) => ({
        org_id: orgId,
        client_id: clientId,
        metric_name,
        metric_value,
        period: `${PERIOD}-01`,
        created_by: ownerId,
      })),
    );
    await admin.from('report_post').insert([
      {
        org_id: orgId,
        client_id: clientId,
        period: `${PERIOD}-01`,
        url: 'https://instagram.com/p/aaa',
        format: 'reel',
        reach: 18_000,
        interactions: 1500,
        created_by: ownerId,
      },
      {
        org_id: orgId,
        client_id: clientId,
        period: `${PERIOD}-01`,
        url: 'https://instagram.com/p/bbb',
        format: 'carousel',
        reach: 9000,
        interactions: 640,
        created_by: ownerId,
      },
    ]);
  });

  test.afterAll(async () => {
    try {
      if (orgId && reportId) {
        await admin.storage.from('reports').remove([`${orgId}/${reportId}.pdf`]);
      }
      if (orgId) await admin.from('organization').delete().eq('id', orgId);
      if (ownerId) {
        await admin.from('user').delete().eq('id', ownerId);
        await admin.auth.admin.deleteUser(ownerId);
      }
    } catch {
      // best-effort
    }
  });

  test('generate → organic sections, best posts, no ads KPI grid', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', ownerEmail);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });

    const res = await page.request.post('/api/reports/generate', {
      data: { orgSlug: slug, periodMonth: PERIOD, clientId },
    });
    expect(res.status(), await res.text()).toBe(201);
    reportId = (await res.json()).data.reportId;
    expect(reportId).toBeTruthy();

    const { data: row } = await admin
      .from('report')
      .select('profile, client_id, status')
      .eq('id', reportId)
      .single();
    expect(row?.profile).toBe('organic');
    expect(row?.client_id).toBe(clientId);
    expect(row?.status).toBe('generated');

    await page.goto(`/${slug}/reports/${reportId}`);
    for (const section of [
      'organico-resumen',
      'organico-contenido',
      'organico-posts',
      'organico-tendencia',
    ]) {
      await expect(page.locator(`[data-section="${section}"]`)).toBeVisible();
    }
    // organic KPIs present, ads KPI grid absent
    await expect(page.locator('[data-kpi="follower_growth"]')).toBeVisible();
    await expect(page.locator('[data-kpi="engagement_rate"]')).toBeVisible();
    await expect(page.locator('[data-section="kpis"]')).toHaveCount(0);
    // best posts, most interactions first
    const postRows = page.locator('[data-section="organico-posts"] tbody tr');
    await expect(postRows).toHaveCount(2);
    await expect(postRows.first()).toContainText('instagram.com/p/aaa');
  });
});
