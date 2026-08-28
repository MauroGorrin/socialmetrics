import 'server-only';

import { eq } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createAdminSupabase, createServerSupabase } from '@/lib/auth';
import { env } from '@/lib/env';
import { db } from '@/server/db';
import { memberships, organizations, users } from '@/server/db/schema';

/**
 * Auth mutations. The form-facing functions are Server Actions (inline
 * `'use server'`) so the auth pages can wire them straight into `<form action>`;
 * `ensurePersonalOrg` is a plain server function shared by the actions and the
 * email-verification route handler.
 *
 * Auth actions live here rather than under `src/app/[orgSlug]/…/actions.ts`
 * (the convention in `.claude/rules/api.md`) because they run before any tenant
 * context exists — there is no `orgSlug` yet.
 */

const SITE_URL = env.SESSION_URL ?? 'http://localhost:3000';

// ── org bootstrap ─────────────────────────────────────────────────────────────

function slugify(input: string): string {
  const base = input
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return base || 'org';
}

async function slugIsTaken(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  return row !== undefined;
}

/**
 * Idempotently mirror the Supabase auth user into `public.user` and make sure
 * they own a personal organization. Returns the slug of the org to land on:
 * their existing (oldest) org if they already belong to one, otherwise the
 * freshly created personal org.
 */
export async function ensurePersonalOrg(user: {
  id: string;
  email: string;
  name: string | null;
}): Promise<string> {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email, name: user.name })
    .onConflictDoUpdate({
      target: users.id,
      set: { email: user.email, name: user.name, updatedAt: new Date() },
    });

  const [existing] = await db
    .select({ slug: organizations.slug })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .where(eq(memberships.userId, user.id))
    .orderBy(organizations.createdAt)
    .limit(1);
  if (existing) return existing.slug;

  const stem = slugify(user.name ?? user.email.split('@')[0] ?? 'org');
  let slug = `${stem}-org`;
  for (let attempt = 0; attempt < 5 && (await slugIsTaken(slug)); attempt++) {
    slug = `${stem}-org-${Math.random().toString(36).slice(2, 6)}`;
  }

  const orgName = user.name?.trim() || (user.email.split('@')[0] ?? 'Mi organización');
  const [org] = await db
    .insert(organizations)
    .values({ name: orgName, slug, ownerId: user.id })
    .returning({ id: organizations.id, slug: organizations.slug });

  await db
    .insert(memberships)
    .values({ userId: user.id, orgId: org.id, role: 'owner', acceptedAt: new Date() })
    .onConflictDoNothing();

  return org.slug;
}

// ── form actions ──────────────────────────────────────────────────────────────

const signUpSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email(),
  password: z.string().min(8).max(72),
});

const signInSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(72),
});

const emailSchema = z.email();
const passwordSchema = z.string().min(8).max(72);

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Signup: create the Supabase user with the email already confirmed, sign them
 * in, bootstrap their personal org, and drop them into the onboarding wizard.
 * No verification email — the MVP trades that friction for a frictionless first
 * run; re-enable it by switching back to `supabase.auth.signUp` here and letting
 * `/auth/callback` finish the flow.
 */
export async function signUpAction(formData: FormData): Promise<void> {
  'use server';

  const parsed = signUpSchema.safeParse({
    name: field(formData, 'name'),
    email: field(formData, 'email').toLowerCase(),
    password: field(formData, 'password'),
  });
  if (!parsed.success) {
    redirect('/auth/signup?error=invalid');
  }

  const admin = createAdminSupabase();
  const { error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { name: parsed.data.name },
  });
  if (createError) {
    const code = createError.code ?? '';
    const duplicate =
      code === 'email_exists' ||
      code === 'user_already_exists' ||
      /already/i.test(createError.message);
    const rateLimited = createError.status === 429;
    redirect(`/auth/signup?error=${duplicate ? 'exists' : rateLimited ? 'ratelimited' : 'signup'}`);
  }

  const supabase = createServerSupabase();
  const { data, error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (signInError || !data.user) {
    redirect('/auth/signin?reset=1');
  }

  await ensurePersonalOrg({
    id: data.user.id,
    email: data.user.email ?? parsed.data.email,
    name: parsed.data.name,
  });
  redirect('/onboarding');
}

/** Sign in with email + password, then land on the user's org dashboard. */
export async function signInAction(formData: FormData): Promise<void> {
  'use server';

  const parsed = signInSchema.safeParse({
    email: field(formData, 'email').toLowerCase(),
    password: field(formData, 'password'),
  });
  if (!parsed.success) {
    redirect('/auth/signin?error=invalid');
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) {
    redirect('/auth/signin?error=credentials');
  }

  const slug = await ensurePersonalOrg({
    id: data.user.id,
    email: data.user.email ?? parsed.data.email,
    name: (data.user.user_metadata?.name as string | undefined) ?? null,
  });
  redirect(`/${slug}/dashboard`);
}

/** Send a password-reset email. Always reports success (no account enumeration). */
export async function forgotPasswordAction(formData: FormData): Promise<void> {
  'use server';

  const parsed = emailSchema.safeParse(field(formData, 'email').toLowerCase());
  if (parsed.success) {
    const supabase = createServerSupabase();
    await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${SITE_URL}/auth/callback?next=/auth/reset`,
    });
  }
  redirect('/auth/forgot-password?sent=1');
}

/** Set a new password for the user in the current recovery session. */
export async function resetPasswordAction(formData: FormData): Promise<void> {
  'use server';

  const parsed = passwordSchema.safeParse(field(formData, 'password'));
  if (!parsed.success) {
    redirect('/auth/reset?error=weak');
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    redirect('/auth/reset?error=failed');
  }
  redirect('/auth/signin?reset=1');
}

/** Clear the session and return to the marketing home. */
export async function signOutAction(): Promise<void> {
  'use server';

  const supabase = createServerSupabase();
  await supabase.auth.signOut();
  redirect('/');
}
