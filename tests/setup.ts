import { afterEach, beforeEach, expect } from 'vitest';

/**
 * Global test setup.
 *
 * Database-backed tests start from a clean, seeded schema. The DB layer lands
 * in a later build step (`src/server/db`), so until it exists these hooks
 * detect its absence and no-op, letting pure-logic unit tests run. Once the
 * module is present, every test again gets a fresh user + org + membership.
 */

type DbContext = {
  db: {
    execute: (query: unknown) => Promise<unknown>;
    insert: (table: unknown) => {
      values: (row: Record<string, unknown>) => {
        returning: () => Promise<Array<{ id: string }>>;
      };
    };
  };
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => unknown;
  schema: {
    users: unknown;
    organizations: unknown;
    memberships: unknown;
  };
};

async function loadDbContext(): Promise<DbContext | null> {
  try {
    const [dbModule, drizzle, schema] = await Promise.all([
      import('@/server/db'),
      import('drizzle-orm'),
      import('@/server/db/schema'),
    ]);
    return {
      db: (dbModule as { db: DbContext['db'] }).db,
      sql: (drizzle as { sql: DbContext['sql'] }).sql,
      schema: schema as DbContext['schema'],
    };
  } catch {
    return null;
  }
}

async function truncateAll({ db, sql }: DbContext): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE audit_log, report_comment, report, metric, client, membership, organization, "user" RESTART IDENTITY CASCADE`,
  );
}

beforeEach(async () => {
  const ctx = await loadDbContext();
  if (!ctx) return;

  await truncateAll(ctx);

  const [user] = await ctx.db
    .insert(ctx.schema.users)
    .values({ id: 'test-user-1', email: 'test@example.com', name: 'Test User', created_at: new Date() })
    .returning();
  const [org] = await ctx.db
    .insert(ctx.schema.organizations)
    .values({
      id: 'test-org-1',
      slug: 'test-org',
      name: 'Test Organization',
      owner_id: user?.id ?? 'test-user-1',
      created_at: new Date(),
    })
    .returning();
  await ctx.db
    .insert(ctx.schema.memberships)
    .values({
      id: 'test-membership-1',
      org_id: org?.id ?? 'test-org-1',
      user_id: user?.id ?? 'test-user-1',
      role: 'owner',
      created_at: new Date(),
    });
});

afterEach(async () => {
  const ctx = await loadDbContext();
  if (ctx) await truncateAll(ctx);
});

expect.extend({
  toBeValidJSON(received: string) {
    try {
      JSON.parse(received);
      return { message: () => `expected ${received} not to be valid JSON`, pass: true };
    } catch {
      return { message: () => `expected ${received} to be valid JSON`, pass: false };
    }
  },
});
