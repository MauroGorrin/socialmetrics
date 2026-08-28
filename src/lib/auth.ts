import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';

/**
 * Auth helpers for server contexts (Server Components, Server Actions, Route
 * Handlers). The multi-tenant guard (`tenantGuard`) lands in a later step;
 * this module only answers "who is the current user?".
 *
 * The middleware (`src/middleware.ts`) is what refreshes an expiring access
 * token and re-writes the auth cookies. In a Server Component render the cookie
 * store is read-only, so the `setAll` writes here are swallowed — that is
 * expected, and the middleware has already done the refresh for this request.
 */

/**
 * Cookie flags for the Supabase auth cookies. `httpOnly` keeps the session
 * token out of JavaScript's reach — the app is server-first and never needs a
 * browser-side Supabase client, so this is safe to force everywhere the cookies
 * are written (here, the middleware, and the email-callback route).
 */
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const;

/** A Supabase client bound to the current request's cookies. */
export function createServerSupabase() {
  const cookieStore = cookies();

  return createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Read-only cookie store (Server Component render). The middleware
          // owns token refresh, so there is nothing to persist here.
        }
      },
    },
  });
}

/**
 * Service-role Supabase client — bypasses RLS and can call the Admin API
 * (create users, generate links). Server-only; never expose the key or this
 * client to the browser.
 */
export function createAdminSupabase(): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type Session = { user: User };

/** The authenticated user for this request, or `null`. Safe in any server context. */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

/** The current session, or `null` when the request is unauthenticated. */
export async function getSession(): Promise<Session | null> {
  const user = await getCurrentUser();
  return user ? { user } : null;
}

/**
 * The current user, or a redirect to sign-in. Use in protected Server
 * Components as a second layer behind the middleware.
 */
export async function requireUser(redirectPath = '/dashboard'): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/auth/signin?redirect=${encodeURIComponent(redirectPath)}`);
  }
  return user;
}
