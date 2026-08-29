import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { currentMonth, monthsEndingAt, type ReportProfile } from '@/lib/metrics';
import { buildMetricsTemplateWorkbook } from '@/lib/metrics-excel';
import { guardErrorResponse, requireRole } from '@/server/auth/guards';
import { getClient } from '@/server/queries/clients';
import { monthlyMetricValues } from '@/server/queries/metrics';

/**
 * Downloads the bulk-load Excel template for one client, pre-filled with
 * whatever months already have data. Owner/admin only, same gate as the
 * upload that reads it back in.
 */

const querySchema = z.object({
  client: z.uuid(),
  months: z.coerce.number().int().min(1).max(24).default(12),
});

// Combining diacritical marks (U+0300–U+036F) left behind by NFKD normalization,
// built from char codes so the source file carries no raw combining characters.
const DIACRITICS = new RegExp(
  `[${String.fromCharCode(0x0300)}-${String.fromCharCode(0x036f)}]`,
  'g',
);

function slugifyFilename(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(DIACRITICS, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || 'cliente';
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsedQuery = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsedQuery.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 422 });
  }

  try {
    const { org } = await requireRole(params.slug, user.id, 'admin');
    const client = await getClient(org.id, parsedQuery.data.client);
    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const profile = (client.reportProfile as ReportProfile) ?? 'ads';
    const months = monthsEndingAt(currentMonth(), parsedQuery.data.months);
    const existingEntries = await Promise.all(
      months.map(async (month) => [month, await monthlyMetricValues(org.id, client.id, month)] as const),
    );

    const buffer = await buildMetricsTemplateWorkbook({
      profile,
      months,
      existing: Object.fromEntries(existingEntries),
    });

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="metricas-${slugifyFilename(client.name)}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    return guardErrorResponse(error);
  }
}
