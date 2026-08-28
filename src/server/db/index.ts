import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '@/lib/env';
import * as schema from '@/server/db/schema';

/**
 * Single Drizzle client for the app. postgres.js keeps an internal connection
 * pool; `prepare: false` keeps it compatible with Supabase's transaction pooler.
 * The module is a singleton — importing it twice reuses one pool.
 */
const queryClient = postgres(env.DATABASE_URL, {
  prepare: false,
  // Supabase's session pooler has a small fixed slot count (15 on the
  // freelancer plan). Every serverless instance opens its own pool, so keep
  // this low — 3 covers the widest `Promise.all` in the app (report data)
  // while leaving room for several instances at once.
  max: 3,
  // Supabase (pooler and direct) requires TLS; the URL may or may not carry
  // ?sslmode=require, so assert it here too.
  ssl: 'require',
});

export const db = drizzle(queryClient, { schema });

export type Database = typeof db;
