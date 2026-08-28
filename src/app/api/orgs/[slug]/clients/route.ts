import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { guardErrorResponse, requireMembership, requireRole } from '@/server/auth/guards';
import { createClient } from '@/server/mutations/clients';
import { listClients } from '@/server/queries/clients';

/**
 * Org-scoped client collection. The org is resolved from `slug` **through the
 * membership guard** — a caller who is not a member of `slug` gets a 404 here
 * and never reaches the query, so org A cannot enumerate org B's clients.
 */

export async function GET(
  _request: NextRequest,
  { params }: { params: { slug: string } },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { org } = await requireMembership(params.slug, user.id);
    const data = await listClients(org.id);
    return NextResponse.json({ data });
  } catch (error) {
    return guardErrorResponse(error);
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  platform: z.enum(['meta', 'google_ads', 'tiktok', 'instagram']),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { slug: string } },
): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { org } = await requireRole(params.slug, user.id, 'admin');
    const body = createSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 422 });
    }
    const client = await createClient({
      orgId: org.id,
      createdBy: user.id,
      name: body.data.name,
      platform: body.data.platform,
    });
    return NextResponse.json({ data: client }, { status: 201 });
  } catch (error) {
    return guardErrorResponse(error);
  }
}
