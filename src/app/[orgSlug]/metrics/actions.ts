'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { keysForProfile, type MetricKey, type ReportProfile } from '@/lib/metrics';
import { parseMetricsWorkbook } from '@/lib/metrics-excel';
import { ForbiddenError, requireMembership, requireRole, TenantError } from '@/server/auth/guards';
import { db } from '@/server/db';
import { auditLogs } from '@/server/db/schema';
import { getClient } from '@/server/queries/clients';
import {
  type MonthlyPostInput,
  upsertMonthlyMetrics,
  upsertMonthlyMetricsBulk,
  upsertMonthlyPosts,
} from '@/server/mutations/metrics';

/**
 * Monthly metric entry. Any member may enter metrics. One action writes the
 * whole month for one client — the fields depend on the client's report
 * profile (ads figures, organic figures, or both) plus the best-posts list for
 * organic / mixed clients.
 */

const MAX_POSTS = 5;
const FORMATS = ['reel', 'carousel', 'image', 'story', 'video'] as const;

const numberField = z.preprocess(
  (raw) => (typeof raw === 'string' && raw.trim() === '' ? undefined : raw),
  z.coerce.number().min(0).max(1_000_000_000_000).optional(),
);

const schema = z.object({
  orgSlug: z.string().min(1),
  clientId: z.uuid(),
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** Parse the up-to-five best-posts rows off the form. */
function readPosts(formData: FormData): MonthlyPostInput[] {
  const posts: MonthlyPostInput[] = [];
  for (let i = 0; i < MAX_POSTS; i++) {
    const url = field(formData, `post_${i}_url`).trim();
    if (!url) continue;
    const format = field(formData, `post_${i}_format`).trim();
    const reach = numberField.safeParse(field(formData, `post_${i}_reach`));
    const interactions = numberField.safeParse(field(formData, `post_${i}_interactions`));
    posts.push({
      url,
      format: (FORMATS as readonly string[]).includes(format) ? format : null,
      reach: reach.success ? (reach.data ?? null) : null,
      interactions: interactions.success ? (interactions.data ?? null) : null,
    });
  }
  return posts;
}

export async function saveMonthlyMetricsAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/signin');

  const orgSlug = field(formData, 'orgSlug');
  const parsed = schema.safeParse({
    orgSlug,
    clientId: field(formData, 'clientId'),
    periodMonth: field(formData, 'periodMonth'),
  });
  if (!parsed.success) {
    redirect(`/${orgSlug}/metrics?error=invalid`);
  }

  const { clientId, periodMonth } = parsed.data;
  const back = `/${orgSlug}/metrics?client=${clientId}&month=${periodMonth}`;

  let target = `${back}&saved=1`;
  try {
    const { org } = await requireMembership(orgSlug, user.id);
    const client = await getClient(org.id, clientId);
    if (!client) {
      target = `/${orgSlug}/metrics?error=client`;
    } else {
      const profile = (client.reportProfile as ReportProfile) ?? 'ads';
      const values: Partial<Record<MetricKey, number>> = {};
      for (const key of keysForProfile(profile)) {
        const num = numberField.safeParse(field(formData, key));
        if (num.success && num.data != null) values[key] = num.data;
      }

      await upsertMonthlyMetrics({
        orgId: org.id,
        clientId,
        actorId: user.id,
        periodMonth,
        values,
      });

      if (profile === 'organic' || profile === 'mixed') {
        await upsertMonthlyPosts({
          orgId: org.id,
          clientId,
          actorId: user.id,
          periodMonth,
          posts: readPosts(formData),
        });
      }

      await db.insert(auditLogs).values({
        orgId: org.id,
        actorId: user.id,
        action: 'metric.month.save',
        targetId: clientId,
        metadata: { periodMonth, profile, fields: Object.keys(values) },
      });
    }
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof TenantError) {
      target = `${back}&error=forbidden`;
    } else {
      throw error;
    }
  }

  redirect(target);
}

/**
 * Bulk load via Excel — owner/admin only (it can overwrite many months at
 * once, unlike the single-month grid above which any member may use).
 */

const MAX_EXCEL_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

const uploadSchema = z.object({
  orgSlug: z.string().min(1),
  clientId: z.uuid(),
});

export type ExcelPreviewRow = {
  periodMonth: string;
  values: Partial<Record<MetricKey, number>>;
  errors: string[];
};

export type ExcelUploadResult = { ok: true; data: ExcelPreviewRow[] } | { ok: false; error: string };

type ParsedUpload = {
  orgId: string;
  clientId: string;
  actorId: string;
  rows: ExcelPreviewRow[];
};

/** Auth, file checks and parsing — shared by the preview and the commit step. */
async function readAndParseUpload(
  formData: FormData,
): Promise<{ ok: true; data: ParsedUpload } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'No autenticado.' };

  const parsedInput = uploadSchema.safeParse({
    orgSlug: field(formData, 'orgSlug'),
    clientId: field(formData, 'clientId'),
  });
  if (!parsedInput.success) return { ok: false, error: 'Solicitud inválida.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Adjuntá un archivo .xlsx con datos.' };
  }
  if (file.size > MAX_EXCEL_FILE_BYTES) {
    return { ok: false, error: 'El archivo es demasiado grande (máx. 2 MB).' };
  }

  try {
    const { org } = await requireRole(parsedInput.data.orgSlug, user.id, 'admin');
    const client = await getClient(org.id, parsedInput.data.clientId);
    if (!client) return { ok: false, error: 'Ese cliente ya no existe.' };

    const profile = (client.reportProfile as ReportProfile) ?? 'ads';
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await parseMetricsWorkbook(buffer, profile);
    if (!result.ok) return { ok: false, error: result.error };

    return {
      ok: true,
      data: { orgId: org.id, clientId: client.id, actorId: user.id, rows: result.rows },
    };
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof TenantError) {
      return { ok: false, error: 'No tienes permiso para cargar métricas en bloque en esta organización.' };
    }
    throw error;
  }
}

/** Parse and validate an uploaded workbook. Writes nothing — the preview step. */
export async function previewMetricsExcelAction(formData: FormData): Promise<ExcelUploadResult> {
  const outcome = await readAndParseUpload(formData);
  if (!outcome.ok) return outcome;
  return { ok: true, data: outcome.data.rows };
}

/**
 * Re-parses the same file — never trusts numbers echoed back from the
 * preview — and, only if every row is error-free, replaces every month it
 * contains in one transaction. A month with no cell filled in at all is left
 * untouched, not cleared.
 */
export async function commitMetricsExcelAction(formData: FormData): Promise<ExcelUploadResult> {
  const outcome = await readAndParseUpload(formData);
  if (!outcome.ok) return outcome;

  const { orgId, clientId, actorId, rows } = outcome.data;
  if (rows.some((row) => row.errors.length > 0)) {
    return { ok: false, error: 'El archivo tiene filas con errores — corregilas y subilo de nuevo.' };
  }

  const monthsToWrite = rows.filter((row) => Object.keys(row.values).length > 0);
  if (monthsToWrite.length === 0) {
    return { ok: false, error: 'El archivo no tiene ningún mes con datos para guardar.' };
  }

  await upsertMonthlyMetricsBulk({
    orgId,
    clientId,
    actorId,
    months: monthsToWrite.map((row) => ({ periodMonth: row.periodMonth, values: row.values })),
  });

  await db.insert(auditLogs).values({
    orgId,
    actorId,
    action: 'metric.month.bulk_upload',
    targetId: clientId,
    metadata: { months: monthsToWrite.map((row) => row.periodMonth) },
  });

  return { ok: true, data: rows };
}
