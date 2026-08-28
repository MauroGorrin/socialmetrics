import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { guardErrorResponse, requireRole } from '@/server/auth/guards';
import { generateReport } from '@/server/mutations/reports';

/**
 * Generate (or regenerate) the monthly report PDF for an org. `admin`+ only.
 * The org is resolved from the body's `orgSlug` through the guard.
 */

// Headless Chromium PDF render needs a Node runtime and more than the default
// serverless budget.
export const runtime = 'nodejs';
export const maxDuration = 60;

const schema = z.object({
  orgSlug: z.string().min(1),
  periodMonth: z.string().regex(/^\d{4}-\d{2}$/),
  clientIds: z.array(z.uuid()).optional(),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 422 });
  }

  try {
    const { org } = await requireRole(body.data.orgSlug, user.id, 'admin');
    const result = await generateReport({
      orgId: org.id,
      orgName: org.name,
      actorId: user.id,
      periodMonth: body.data.periodMonth,
      clientIds: body.data.clientIds ?? [],
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ data: result.data }, { status: 201 });
  } catch (error) {
    return guardErrorResponse(error);
  }
}
