import { type CookieOptions, createServerClient } from '@supabase/ssr';
import type { EmailOtpType } from '@supabase/supabase-js';
import { type NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_OPTIONS } from '@/lib/auth';
import { env } from '@/lib/env';
import { ensurePersonalOrg } from '@/server/mutations/auth';

/**
 * Email-link landing route. Supabase redirects here after a signup confirmation
 * or a password-recovery link; we exchange the token for a session, mirror the
 * user + auto-create their personal org, then forward them on.
 *
 * Not enumerated in the blueprint's file list for this step, but the verify
 * flow it describes ("click link in email → verify session → auto-create org")
 * has to be handled by a route handler — an email link is a GET, not a form.
 */

const SITE_URL = env.SESSION_URL ?? 'http://localhost:3000';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const next = url.searchParams.get('next');

  const pendingCookies: Array<{ name: string; value: string; options: CookieOptions }> = [];
  let pendingHeaders: Record<string, string> = {};
  const supabase = createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        pendingCookies.push(...cookiesToSet);
        pendingHeaders = headers ?? {};
      },
    },
  });

  let userId: string | null = null;
  let email: string | null = null;
  let name: string | null = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      userId = data.user.id;
      email = data.user.email ?? null;
      name = (data.user.user_metadata?.name as string | undefined) ?? null;
    }
  } else if (tokenHash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error && data.user) {
      userId = data.user.id;
      email = data.user.email ?? null;
      name = (data.user.user_metadata?.name as string | undefined) ?? null;
    }
  }

  const target = await resolveTarget(userId, email, name, next);
  const redirectResponse = NextResponse.redirect(new URL(target, SITE_URL));
  for (const { name: cookieName, value, options } of pendingCookies) {
    redirectResponse.cookies.set(cookieName, value, options);
  }
  for (const [key, value] of Object.entries(pendingHeaders)) {
    redirectResponse.headers.set(key, value);
  }
  return redirectResponse;
}

async function resolveTarget(
  userId: string | null,
  email: string | null,
  name: string | null,
  next: string | null,
): Promise<string> {
  if (!userId) return '/auth/signin?error=verification';
  if (next?.startsWith('/')) return next;
  const slug = await ensurePersonalOrg({ id: userId, email: email ?? '', name });
  return `/${slug}/dashboard`;
}
