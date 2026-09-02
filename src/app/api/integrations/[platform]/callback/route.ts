import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { verifyState } from '@/server/auth/oauth-state';
import { db } from '@/server/db';
import { clients, memberships, organizations } from '@/server/db/schema';
import { createDraft } from '@/server/mutations/platform-connections';
import { getProvider } from '@/server/providers';

/**
 * GET /api/integrations/[platform]/callback?code=&state=
 *
 * The provider redirects here after consent. Verifies the signed `state`
 * against the httpOnly cookie, re-runs the admin guard from the payload's
 * client id, exchanges the code for tokens, stores a `pending` connection, and
 * 302s to the ad-account picker.
 */

export const dynamic = 'force-dynamic';

const platformSchema = z.enum(['meta', 'google_ads']);
const ROLE_RANK: Record<string, number> = { manager: 1, admin: 2, owner: 3 };
const STATE_COOKIE = 'oauth_state';

async function resolveClientAccess(
  clientId: string,
  userId: string,
): Promise<{ orgId: string; orgSlug: string } | null> {
  const [row] = await db
    .select({ orgId: organizations.id, orgSlug: organizations.slug, role: memberships.role })
    .from(clients)
    .innerJoin(organizations, eq(organizations.id, clients.orgId))
    .innerJoin(
      memberships,
      and(
        eq(memberships.orgId, clients.orgId),
        eq(memberships.userId, userId),
        isNotNull(memberships.acceptedAt),
      ),
    )
    .where(and(eq(clients.id, clientId), isNull(clients.deletedAt)))
    .limit(1);
  if (!row || (ROLE_RANK[row.role] ?? 0) < ROLE_RANK.admin) return null;
  return { orgId: row.orgId, orgSlug: row.orgSlug };
}

function clearStateCookie(res: NextResponse): NextResponse {
  res.cookies.set(STATE_COOKIE, '', { path: '/api/integrations', maxAge: 0 });
  return res;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { platform: string } },
): Promise<NextResponse> {
  const platform = platformSchema.safeParse(params.platform);
  if (!platform.success) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const origin = request.nextUrl.origin;
  const search = request.nextUrl.searchParams;

  if (search.get('error')) {
    return NextResponse.redirect(`${origin}/?error=oauth_denied`);
  }

  const code = search.get('code');
  const stateParam = search.get('state');
  const stateCookie = request.cookies.get(STATE_COOKIE)?.value;
  if (!code || !stateParam || !stateCookie || stateParam !== stateCookie) {
    return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 });
  }
  const payload = verifyState(stateParam);
  if (!payload || payload.platform !== platform.data) {
    return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const access = await resolveClientAccess(payload.clientId, user.id);
  if (!access) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const provider = getProvider(platform.data);
  let tokens: Awaited<ReturnType<typeof provider.exchangeCode>>;
  try {
    tokens = await provider.exchangeCode(code);
  } catch {
    return clearStateCookie(
      NextResponse.redirect(`${origin}/${access.orgSlug}/clients/${payload.clientId}?error=oauth_exchange`),
    );
  }

  await createDraft({
    orgId: access.orgId,
    clientId: payload.clientId,
    platform: platform.data,
    connectedBy: user.id,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? null,
    tokenExpiresAt: tokens.expiresAt ?? null,
    scope: tokens.scope ?? null,
  });

  return clearStateCookie(
    NextResponse.redirect(
      `${origin}/${access.orgSlug}/clients/${payload.clientId}/integrations/${platform.data}`,
    ),
  );
}
