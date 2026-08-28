import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { guardErrorResponse, requireRole } from '@/server/auth/guards';
import { db } from '@/server/db';
import { auditLogs } from '@/server/db/schema';
import { deleteMetric } from '@/server/mutations/metrics';

/**
 * A single org-scoped metric. Same two layers as the client routes: membership
 * guard on `slug`, then `org.id` in the delete's WHERE clause — a `metricId`
 * belonging to another tenant deletes nothing and returns 404.
 */

type Params = { params: { slug: string; metricId: string } };

export async function DELETE(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { org } = await requireRole(params.slug, user.id, 'admin');
    const deleted = await deleteMetric(org.id, params.metricId);
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await db.insert(auditLogs).values({
      orgId: org.id,
      actorId: user.id,
      action: 'metric.delete',
      targetId: deleted.id,
      metadata: {
        before: {
          clientId: deleted.clientId,
          metricName: deleted.metricName,
          metricValue: deleted.metricValue,
          period: deleted.period,
        },
      },
    });

    return NextResponse.json({ data: { id: params.metricId } });
  } catch (error) {
    return guardErrorResponse(error);
  }
}
