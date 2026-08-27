import { beforeEach, afterEach, expect } from 'vitest';
import { db } from '@/server/db';
import { sql } from 'drizzle-orm';
import { users, organizations, memberships } from '@/server/db/schema';

// Setup globals
Object.defineProperty(global, 'TextEncoder', {
  writable: true,
  value: TextEncoder,
});

// Test database setup
export async function setupTestDB() {
  // Verify connection to test database
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    console.error('Failed to connect to test database:', err);
    throw err;
  }
}

// Seed test data before each test
beforeEach(async () => {
  // Clear existing test data
  await db.execute(sql`TRUNCATE TABLE audit_log CASCADE`);
  await db.execute(sql`TRUNCATE TABLE report_comment CASCADE`);
  await db.execute(sql`TRUNCATE TABLE report CASCADE`);
  await db.execute(sql`TRUNCATE TABLE metric CASCADE`);
  await db.execute(sql`TRUNCATE TABLE client CASCADE`);
  await db.execute(sql`TRUNCATE TABLE membership CASCADE`);
  await db.execute(sql`TRUNCATE TABLE organization CASCADE`);
  await db.execute(sql`TRUNCATE TABLE "user" CASCADE`);

  // Seed test user
  const testUser = await db
    .insert(users)
    .values({
      id: 'test-user-1',
      email: 'test@example.com',
      name: 'Test User',
      created_at: new Date(),
    })
    .returning();

  // Seed test organization
  const testOrg = await db
    .insert(organizations)
    .values({
      id: 'test-org-1',
      slug: 'test-org',
      name: 'Test Organization',
      owner_id: testUser[0].id,
      created_at: new Date(),
    })
    .returning();

  // Seed membership (owner role)
  await db.insert(memberships).values({
    id: 'test-membership-1',
    org_id: testOrg[0].id,
    user_id: testUser[0].id,
    role: 'owner',
    created_at: new Date(),
  });
});

// Clean up after each test
afterEach(async () => {
  // Truncate all test tables to reset state
  await db.execute(sql`TRUNCATE TABLE audit_log CASCADE`);
  await db.execute(sql`TRUNCATE TABLE report_comment CASCADE`);
  await db.execute(sql`TRUNCATE TABLE report CASCADE`);
  await db.execute(sql`TRUNCATE TABLE metric CASCADE`);
  await db.execute(sql`TRUNCATE TABLE client CASCADE`);
  await db.execute(sql`TRUNCATE TABLE membership CASCADE`);
  await db.execute(sql`TRUNCATE TABLE organization CASCADE`);
  await db.execute(sql`TRUNCATE TABLE "user" CASCADE`);
});

// Custom matchers
expect.extend({
  toBeValidJSON(received: string) {
    try {
      JSON.parse(received);
      return {
        message: () => `expected ${received} not to be valid JSON`,
        pass: true,
      };
    } catch {
      return {
        message: () => `expected ${received} to be valid JSON`,
        pass: false,
      };
    }
  },
});
