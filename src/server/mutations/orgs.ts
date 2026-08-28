import 'server-only';

import { and, eq, inArray } from 'drizzle-orm';
import { requireRole } from '@/server/auth/guards';
import { createAdminSupabase } from '@/lib/auth';
import { db } from '@/server/db';
import type { Organization } from '@/server/db/schema';
import { auditLogs, organizations, reports } from '@/server/db/schema';
import { generateReport } from '@/server/mutations/reports';

/**
 * Organization mutations. Each resolves and authorizes the org through a guard
 * before it writes, and scopes the write by `org_id`.
 */

const BRANDING_BUCKET = 'branding';
const MAX_LOGO_BYTES = 2_000_000;

/** Rename an organization. Requires `admin` or `owner`. */
export async function renameOrg(
  slug: string,
  userId: string,
  name: string,
): Promise<Organization | null> {
  const { org } = await requireRole(slug, userId, 'admin');

  const [updated] = await db
    .update(organizations)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(organizations.id, org.id), eq(organizations.slug, slug)))
    .returning();

  return updated ?? null;
}

export type BrandingInput = {
  slug: string;
  userId: string;
  footerText: string | null;
  removeLogo: boolean;
  logo: { bytes: Buffer; contentType: string; ext: string } | null;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function ensureBrandingBucket(admin: ReturnType<typeof createAdminSupabase>) {
  const buckets = await admin.storage.listBuckets();
  if (!buckets.data?.some((b) => b.name === BRANDING_BUCKET)) {
    await admin.storage.createBucket(BRANDING_BUCKET, { public: true });
  }
}

/** Regenerate every not-yet-finalised report so it picks up new branding. */
async function regeneratePendingReports(orgId: string, orgName: string, actorId: string) {
  const pending = await db
    .select({ periodMonth: reports.periodMonth, clientIds: reports.clientIds })
    .from(reports)
    .where(and(eq(reports.orgId, orgId), inArray(reports.status, ['draft', 'generated'])));

  for (const report of pending) {
    await generateReport({
      orgId,
      orgName,
      actorId,
      periodMonth: report.periodMonth,
      clientIds: report.clientIds ?? [],
    });
  }
}

/**
 * Set the org's logo and/or footer text, then regenerate pending reports.
 * Requires `admin`.
 */
export async function updateBranding(
  input: BrandingInput,
): Promise<Result<{ logoUrl: string | null }>> {
  const { org } = await requireRole(input.slug, input.userId, 'admin');
  const admin = createAdminSupabase();

  let logoUrl: string | null = org.logoUrl;

  if (input.removeLogo) {
    await admin.storage
      .from(BRANDING_BUCKET)
      .remove(['png', 'jpg', 'jpeg', 'svg', 'webp'].map((ext) => `${org.id}/logo.${ext}`));
    logoUrl = null;
  } else if (input.logo) {
    if (input.logo.bytes.length === 0 || input.logo.bytes.length > MAX_LOGO_BYTES) {
      return { ok: false, error: 'El logo debe pesar menos de 2 MB.' };
    }
    if (!input.logo.contentType.startsWith('image/')) {
      return { ok: false, error: 'Subí un archivo de imagen.' };
    }
    await ensureBrandingBucket(admin);
    const path = `${org.id}/logo.${input.logo.ext}`;
    const uploaded = await admin.storage
      .from(BRANDING_BUCKET)
      .upload(path, input.logo.bytes, { contentType: input.logo.contentType, upsert: true });
    if (uploaded.error) return { ok: false, error: 'No se pudo guardar el logo.' };

    const { publicUrl } = admin.storage.from(BRANDING_BUCKET).getPublicUrl(path).data;
    logoUrl = `${publicUrl}?v=${Date.now()}`;
  }

  const footerText = input.footerText?.trim() ? input.footerText.trim().slice(0, 200) : null;

  await db
    .update(organizations)
    .set({ logoUrl, footerText, updatedAt: new Date() })
    .where(eq(organizations.id, org.id));

  await db.insert(auditLogs).values({
    orgId: org.id,
    actorId: input.userId,
    action: 'update_org_branding',
    targetId: org.id,
    metadata: { hasLogo: Boolean(logoUrl), footerText },
  });

  await regeneratePendingReports(org.id, org.name, input.userId);

  return { ok: true, data: { logoUrl } };
}
