import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * E3-T4 — report history: list newest-first, filter by month, download a stored
 * PDF with no regeneration, and a draft (no PDF) offers "Generar" not
 * "Descargar".
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
const ownerEmail = `e3-hist-${stamp}@e2e-reportes.dev`;
const slug = `e3-hist-${stamp}`;

let admin: SupabaseClient;
let ownerId = '';
let orgId = '';
const reportIds: Record<string, string> = {};

test.describe.configure({ mode: 'serial', timeout: 150_000 });

async function seedReport(month: string, minutesAgo: number, withPdf: boolean) {
  const createdAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const { data } = await admin
    .from('report')
    .insert({
      org_id: orgId,
      period_month: month,
      status: withPdf ? 'generated' : 'draft',
      created_at: createdAt,
      generated_at: withPdf ? createdAt : null,
    })
    .select('id')
    .single();
  const id = data?.id as string;
  if (withPdf) {
    await admin.storage
      .from('reports')
      .upload(`${orgId}/${id}.pdf`, Buffer.from(`%PDF-1.4\n% ${month}\n%%EOF`), {
        contentType: 'application/pdf',
        upsert: true,
      });
    await admin.from('report').update({ pdf_url: `${orgId}/${id}.pdf` }).eq('id', id);
  }
  reportIds[month] = id;
}

test.describe('report history', () => {
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
      .insert({ name: 'E3 History Org', slug, owner_id: ownerId })
      .select('id')
      .single();
    orgId = org?.id as string;
    await admin
      .from('membership')
      .insert({ org_id: orgId, user_id: ownerId, role: 'owner', accepted_at: new Date().toISOString() });

    await seedReport('2026-08', 1, true);
    await seedReport('2026-07', 10, true);
    await seedReport('2026-06', 20, false);
  });

  test.afterAll(async () => {
    try {
      for (const id of Object.values(reportIds)) {
        await admin.storage.from('reports').remove([`${orgId}/${id}.pdf`]);
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

  test('newest-first list, month filter, no-regeneration download, draft shows Generar', async ({
    page,
  }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', ownerEmail);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });

    await page.goto(`/${slug}/reports`);

    // Criterion 1: sorted by created_at DESC.
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(3);
    const monthCol = await rows.locator('td:first-child').allInnerTexts();
    expect(monthCol).toEqual(['2026-08', '2026-07', '2026-06']);

    // Criterion 4: the draft row offers Generar, not Descargar.
    const draftRow = page.locator('tr', { hasText: '2026-06' });
    await expect(draftRow.getByRole('button', { name: 'Generar' })).toBeVisible();
    await expect(draftRow.getByRole('link', { name: 'Descargar' })).toHaveCount(0);

    // Criterion 3: download serves the stored PDF, no regeneration.
    const { data: beforeRow } = await admin
      .from('report')
      .select('generated_at')
      .eq('id', reportIds['2026-08'])
      .single();
    const dl = await page.request.get(`/api/reports/${reportIds['2026-08']}/download`);
    expect(dl.status()).toBe(200);
    const bytes = Buffer.from(await dl.body());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const { data: afterRow } = await admin
      .from('report')
      .select('generated_at')
      .eq('id', reportIds['2026-08'])
      .single();
    expect(afterRow?.generated_at).toBe(beforeRow?.generated_at);

    // Criterion 2: filter by month.
    await page.selectOption('form[method="get"] select[name="month"]', '2026-07');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForURL(/month=2026-07/);
    const filtered = page.locator('tbody tr');
    await expect(filtered).toHaveCount(1);
    await expect(filtered.first()).toContainText('2026-07');
  });
});
