import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import ExcelJS from 'exceljs';

/**
 * Bulk metric load via Excel — owner/admin only. Downloads the real template,
 * edits it in memory (no separate fixture file), uploads it, previews, and
 * confirms. A second upload with a bad cell proves the preview blocks the
 * save instead of writing anything partial.
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
const ownerEmail = `e2e-excel-${stamp}@e2e-reportes.dev`;
const slug = `e2e-excel-${stamp}`;

let admin: SupabaseClient;
let ownerId = '';
let orgId = '';
let clientId = '';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test.describe('bulk metric load via Excel', () => {
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
      .insert({ name: 'E2E Excel Org', slug, owner_id: ownerId })
      .select('id')
      .single();
    orgId = org?.id ?? '';
    await admin.from('membership').insert({
      org_id: orgId,
      user_id: ownerId,
      role: 'owner',
      accepted_at: new Date().toISOString(),
    });
    const { data: client } = await admin
      .from('client')
      .insert({ org_id: orgId, name: 'Cliente Excel', platform: 'meta', created_by: ownerId })
      .select('id')
      .single();
    clientId = client?.id ?? '';
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

  async function metricRowsFor(periodMonth: string) {
    const { data } = await admin
      .from('metric')
      .select('metric_name, metric_value')
      .eq('client_id', clientId)
      .eq('period', `${periodMonth}-01`);
    return data ?? [];
  }

  test('download the template, fill it, preview, confirm, and block a bad file', async ({ page }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', ownerEmail);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });

    // Download the real template (3 months, ads profile — the client's default).
    const res = await page.request.get(
      `/api/orgs/${slug}/metrics/template?client=${clientId}&months=3`,
    );
    expect(res.ok()).toBe(true);
    expect(res.headers()['content-type']).toContain('spreadsheetml');

    const downloaded = new ExcelJS.Workbook();
    await downloaded.xlsx.load(await res.body());
    const sheet = downloaded.worksheets[0];
    const headerLabels = [1, 2, 3, 4, 5, 6].map((col) => String(sheet.getRow(2).getCell(col).value));
    expect(headerLabels).toEqual([
      'Mes',
      'Impresiones',
      'Clics',
      'Inversión',
      'Conversiones',
      'Valor de conversión',
    ]);

    const monthOld = String(sheet.getRow(3).getCell(1).value);
    const monthMid = String(sheet.getRow(4).getCell(1).value);
    const monthNew = String(sheet.getRow(5).getCell(1).value);

    // Fill only the middle month; leave the others blank.
    sheet.getRow(4).getCell(2).value = 15000;
    sheet.getRow(4).getCell(3).value = 600;
    sheet.getRow(4).getCell(4).value = 300.5;
    sheet.getRow(4).getCell(5).value = 30;
    sheet.getRow(4).getCell(6).value = 1200;
    const filledBuffer = Buffer.from(await downloaded.xlsx.writeBuffer());

    await page.goto(`/${slug}/metrics?client=${clientId}`);
    await page.setInputFiles('input[type="file"]', {
      name: 'plantilla.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: filledBuffer,
    });
    await page.getByRole('button', { name: 'Previsualizar' }).click();

    await expect(page.getByText('Se van a guardar 1 mes.')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('cell', { name: '15.000' })).toBeVisible();

    await page.getByRole('button', { name: 'Confirmar y guardar' }).click();
    await expect(page.getByText('Métricas guardadas.')).toBeVisible({ timeout: 15_000 });

    await expect.poll(async () => (await metricRowsFor(monthMid)).length).toBe(5);
    const midRows = await metricRowsFor(monthMid);
    expect(Number(midRows.find((r) => r.metric_name === 'impressions')?.metric_value)).toBe(15000);
    // Blank rows are skipped, not written as zeros.
    expect(await metricRowsFor(monthOld)).toHaveLength(0);
    expect(await metricRowsFor(monthNew)).toHaveLength(0);

    // A second file with a bad cell must block the save entirely.
    await page.getByRole('button', { name: 'Cargar otro archivo' }).click();
    const broken = new ExcelJS.Workbook();
    await broken.xlsx.load(filledBuffer);
    const brokenSheet = broken.worksheets[0];
    brokenSheet.getRow(3).getCell(2).value = 'texto invalido';
    const brokenBuffer = Buffer.from(await broken.xlsx.writeBuffer());

    await page.setInputFiles('input[type="file"]', {
      name: 'plantilla-rota.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: brokenBuffer,
    });
    await page.getByRole('button', { name: 'Previsualizar' }).click();

    await expect(page.getByText(/no es un número válido/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Confirmar y guardar' })).toBeDisabled();

    // Nothing changed from the blocked attempt.
    expect(await metricRowsFor(monthOld)).toHaveLength(0);
    const midRowsAfter = await metricRowsFor(monthMid);
    expect(midRowsAfter).toHaveLength(5);
  });
});
