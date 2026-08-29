import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

/**
 * E2-T2 — members & invitations: invite (48h token), redeem once (one
 * membership row, error on the second redeem), owner changes a role, owner
 * removes a member.
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
const ownerEmail = `e2e-owner-${stamp}@e2e-reportes.dev`;
const inviteeEmail = `e2e-invitee-${stamp}@e2e-reportes.dev`;
const slug = `e2e-members-${stamp}`;

let admin: SupabaseClient;
let ownerId = '';
let orgId = '';
let inviteeId = '';

test.describe.configure({ mode: 'serial', timeout: 150_000 });

test.describe('members & invitations', () => {
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
    const { data: org, error: orgErr } = await admin
      .from('organization')
      .insert({ name: 'E2E Members Org', slug, owner_id: ownerId })
      .select('id')
      .single();
    if (orgErr || !org) throw orgErr ?? new Error('org insert failed');
    orgId = org.id;
    await admin.from('membership').insert({
      org_id: orgId,
      user_id: ownerId,
      role: 'owner',
      accepted_at: new Date().toISOString(),
    });
  });

  test.afterAll(async () => {
    try {
      if (orgId) await admin.from('organization').delete().eq('id', orgId);
      for (const id of [ownerId, inviteeId].filter(Boolean)) {
        await admin.from('user').delete().eq('id', id);
        await admin.auth.admin.deleteUser(id);
      }
    } catch {
      // best-effort
    }
  });

  test('invite, redeem once, change role, remove', async ({ page, browser }) => {
    await page.goto('/auth/signin');
    await page.fill('input[name="email"]', ownerEmail);
    await page.fill('input[name="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });

    await page.goto(`/${slug}/settings/members`);
    await expect(page.getByRole('cell', { name: ownerEmail })).toBeVisible();

    // Invite.
    await page.getByRole('button', { name: 'Invitar miembro' }).click();
    await page.getByRole('dialog').getByLabel('Email').fill(inviteeEmail);
    await page.getByRole('dialog').getByLabel('Rol').selectOption('manager');
    await page.getByRole('dialog').getByRole('button', { name: 'Enviar invitación' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByRole('cell', { name: inviteeEmail })).toBeVisible();

    // Criterion 1: a pending row with a 48h token.
    const { data: pendingRows } = await admin
      .from('membership')
      .select('user_id, invite_token, invite_expires_at, accepted_at')
      .eq('org_id', orgId)
      .is('accepted_at', null);
    expect(pendingRows).toHaveLength(1);
    const invite = pendingRows?.[0];
    inviteeId = invite?.user_id ?? '';
    expect(invite?.invite_token, 'invite token set').toBeTruthy();
    const ttlHours = (new Date(invite?.invite_expires_at ?? 0).getTime() - Date.now()) / 3_600_000;
    expect(ttlHours).toBeGreaterThan(47);
    expect(ttlHours).toBeLessThan(49);

    const token = invite?.invite_token as string;

    // Criterion 2: redeem once → exactly one membership row.
    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    await inviteePage.goto(`/invite/${token}`);
    await expect(inviteePage.getByRole('heading', { name: /Unirte a/i })).toBeVisible();
    await inviteePage.getByLabel('Elige una contraseña').fill(PASSWORD);
    await inviteePage.getByRole('button', { name: 'Aceptar y entrar' }).click();
    await inviteePage.waitForURL(new RegExp(`/${slug}/dashboard$`), { timeout: 90_000 });

    const { data: afterAccept } = await admin
      .from('membership')
      .select('id, role, accepted_at, invite_token')
      .eq('org_id', orgId)
      .eq('user_id', inviteeId);
    expect(afterAccept).toHaveLength(1);
    expect(afterAccept?.[0]?.accepted_at).not.toBeNull();
    expect(afterAccept?.[0]?.invite_token).toBeNull();

    // Second redeem → error, still one row.
    await inviteePage.goto(`/invite/${token}`);
    await expect(inviteePage.getByText(/Invitaci[oó]n no disponible/i)).toBeVisible();
    const { data: afterSecond } = await admin
      .from('membership')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', inviteeId);
    expect(afterSecond).toHaveLength(1);
    await inviteeContext.close();

    // Criterion 3: owner changes role manager → admin.
    await page.goto(`/${slug}/settings/members`);
    const inviteeRow = page.locator('tr', { hasText: inviteeEmail });
    await inviteeRow.getByRole('combobox').selectOption('admin');
    await inviteeRow.getByRole('button', { name: 'Guardar' }).click();
    await page.waitForURL(/\?ok=role$/);
    const { data: afterRole } = await admin
      .from('membership')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', inviteeId)
      .single();
    expect(afterRole?.role).toBe('admin');

    // Criterion 4: owner removes the member.
    await page.locator('tr', { hasText: inviteeEmail }).getByRole('button', { name: 'Quitar' }).click();
    await page.waitForURL(/\?ok=removed$/);
    const { data: afterRemove } = await admin
      .from('membership')
      .select('id')
      .eq('org_id', orgId)
      .eq('user_id', inviteeId);
    expect(afterRemove).toHaveLength(0);
  });
});
