import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { guardErrorResponse, requireMembership, requireRole } from '@/server/auth/guards';
import { softDeleteClient, updateClient } from '@/server/mutations/clients';
import { getClient } from '@/server/queries/clients';

/**
 * A single org-scoped client. Two layers keep tenants apart: the membership
 * guard rejects a `slug` the caller does not belong to (404 before any query),
 * and every query/mutation is additionally scoped by `org.id`, so a `clientId`
 * from another org matches no row and also yields 404.
 */

type Params = { params: { slug: string; clientId: string } };

export async function GET(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { org } = await requireMembership(params.slug, user.id);
    const client = await getClient(org.id, params.clientId);
    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: client });
  } catch (error) {
    return guardErrorResponse(error);
  }
}

const patchSchema = z.object({ name: z.string().trim().min(1).max(120) });

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { org } = await requireRole(params.slug, user.id, 'admin');
    const body = patchSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 422 });
    }
    const client = await updateClient(org.id, params.clientId, { name: body.data.name });
    if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: client });
  } catch (error) {
    return guardErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Params): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { org } = await requireRole(params.slug, user.id, 'admin');
    const deleted = await softDeleteClient(org.id, params.clientId);
    if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ data: { id: params.clientId } });
  } catch (error) {
    return guardErrorResponse(error);
  }
}
