import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/rate-limit';

/**
 * Edge middleware: refresh the Supabase session on every protected request and
 * bounce unauthenticated visitors to sign-in. Authorization (org membership,
 * role) is still enforced again server-side in each route — this is the first
 * gate, not the only one.
 *
 * Env is read via literal `process.env.*` access so Next inlines the values
 * into the Edge bundle; `src/lib/env.ts` validates the same vars for the Node
 * runtime.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

// Kept in sync with `AUTH_COOKIE_OPTIONS` in `src/lib/auth.ts` — duplicated
// because `next/headers` (which that module pulls in) is not importable here.
const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return (
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/invite/') ||
    pathname.startsWith('/public/') ||
    pathname.startsWith('/api/webhooks/') ||
    pathname === '/api/deploy' ||
    pathname === '/pricing'
  );
}

/** Read the current user, transparently refreshing the access token if needed. */
async function getSession(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

const AUTH_ATTEMPTS_PER_MINUTE = 10;

/**
 * Rate-limit sign-in POSTs by client IP. The IP is only knowable from the
 * proxy's forwarded header, so a request without one (direct localhost, tests
 * that don't simulate a client) is not limited — there is nothing to key on.
 */
function rateLimitSignIn(request: NextRequest): NextResponse | null {
  if (request.method !== 'POST' || request.nextUrl.pathname !== '/auth/signin') return null;

  // Only the proxy's forwarded header identifies the client; a direct request
  // (localhost, no proxy) has no key to limit on and is left alone.
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim();
  if (!ip) return null;

  const result = rateLimit(`signin:${ip}`, AUTH_ATTEMPTS_PER_MINUTE, 60_000);
  if (result.ok) return null;

  return new NextResponse('Too many attempts. Try again in 60 seconds.', {
    status: 429,
    headers: { 'Retry-After': String(result.retryAfterSeconds || 60) },
  });
}

export async function middleware(request: NextRequest) {
  const throttled = rateLimitSignIn(request);
  if (throttled) return throttled;

  if (isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers ?? {})) {
          response.headers.set(key, value);
        }
      },
    },
  });

  const user = await getSession(supabase);

  if (!user) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = '/auth/signin';
    signInUrl.search = '';
    signInUrl.searchParams.set('redirect', request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
