import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { integrationsConfig, redirectUri } from '@/lib/integrations';
import { signState } from '@/server/auth/oauth-state';
import { db } from '@/server/db';
import { clients, memberships, organizations } from '@/server/db/schema';

/**
 * GET /api/integrations/[platform]/connect?clientId=<uuid>
 *
 * Starts the OAuth flow for one client. Admin-only. Sets a signed, httpOnly
 * `oauth_state` cookie and 302s to the provider's consent screen. Creates no
 * DB row — the connection is stored only on callback.
 */

const platformSchema = z.enum(['meta', 'google_ads']);
const ROLE_RANK: Record<string, number> = { manager: 1, admin: 2, owner: 3 };

const STATE_COOKIE = 'oauth_state';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/integrations',
  maxAge: 600,
};

type Access = { orgId: string; orgSlug: string } | { error: 403 | 404 };

async function resolveClientAccess(clientId: string, userId: string): Promise<Access> {
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
  if (!row) return { error: 404 };
  if ((ROLE_RANK[row.role] ?? 0) < ROLE_RANK.admin) return { error: 403 };
  return { orgId: row.orgId, orgSlug: row.orgSlug };
}

function consentUrl(platform: 'meta' | 'google_ads', state: string): string {
  const redirect = encodeURIComponent(redirectUri(platform));
  if (platform === 'meta') {
    const appId = process.env.META_APP_ID ?? '';
    return (
      'https://www.facebook.com/v25.0/dialog/oauth' +
      `?client_id=${appId}&redirect_uri=${redirect}&state=${state}` +
      '&scope=ads_read&response_type=code'
    );
  }
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID ?? '';
  return (
    'https://accounts.google.com/o/oauth2/v2/auth' +
    `?client_id=${clientId}&redirect_uri=${redirect}&state=${state}` +
    '&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fadwords' +
    '&response_type=code&access_type=offline&prompt=consent'
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: { platform: string } },
): Promise<NextResponse> {
  const platform = platformSchema.safeParse(params.platform);
  if (!platform.success) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const clientId = z.string().uuid().safeParse(request.nextUrl.searchParams.get('clientId'));
  if (!clientId.success) return NextResponse.json({ error: 'Invalid clientId' }, { status: 400 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const configured =
    platform.data === 'meta' ? integrationsConfig().meta : integrationsConfig().googleAds;
  if (!configured) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const access = await resolveClientAccess(clientId.data, user.id);
  if ('error' in access) {
    return NextResponse.json(
      { error: access.error === 403 ? 'Forbidden' : 'Not found' },
      { status: access.error },
    );
  }

  const state = signState({ clientId: clientId.data, platform: platform.data });
  const response = NextResponse.redirect(consentUrl(platform.data, state));
  response.cookies.set(STATE_COOKIE, state, COOKIE_OPTS);
  return response;
}
