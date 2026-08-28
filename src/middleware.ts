import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';

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
    pathname.startsWith('/public/') ||
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

export async function middleware(request: NextRequest) {
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
