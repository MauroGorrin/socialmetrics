import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { db } from '@/server/db';

export const dynamic = 'force-dynamic';

/**
 * Post-deploy health check. Importing `@/lib/env` fails the request if a
 * required variable is missing (no silent fallback to defaults), and the query
 * confirms the production database is reachable and migrations have run.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const [{ migrations }] = await db.execute<{ migrations: number }>(
      sql`select count(*)::int as migrations from drizzle.__drizzle_migrations`,
    );

    return NextResponse.json({
      ok: true,
      env: 'validated',
      database: 'reachable',
      migrations,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      // Referencing a var so a missing one surfaces here too.
      supabase: new URL(env.SUPABASE_URL).host,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'health check failed' },
      { status: 503 },
    );
  }
}
