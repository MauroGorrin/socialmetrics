import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Multi-tenant schema. DB table names are singular (`user`, `organization`, …)
 * to match the blueprint §4 SQL; the exported Drizzle objects are plural.
 *
 * Conventions (.claude/rules/database.md):
 *  - every table has `id` (uuid) + `created_at`; user-facing entities also carry
 *    `updated_at`, and `client` / `report` carry `deleted_at` for soft delete.
 *  - `org_id` is the first column after `id` on every business table and is
 *    indexed; queries always filter by it.
 */

const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

// ── user ──────────────────────────────────────────────────────────────────────
// Mirror of Supabase auth.users; identity is managed by Supabase Auth so `id`
// has no default — it is supplied on signup.
export const users = pgTable('user', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  avatarUrl: text('avatar_url'),
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
});

// ── organization ──────────────────────────────────────────────────────────────
export const organizations = pgTable(
  'organization',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    plan: text('plan').notNull().default('freelancer'),
    logoUrl: text('logo_url'),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_org_slug').on(table.slug),
    check('organization_plan_check', sql`${table.plan} in ('freelancer', 'agency', 'enterprise')`),
  ],
);

// ── membership ────────────────────────────────────────────────────────────────
export const memberships = pgTable(
  'membership',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id),
    inviteToken: text('invite_token').unique(),
    inviteExpiresAt: timestamptz('invite_expires_at'),
    acceptedAt: timestamptz('accepted_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('membership_user_id_org_id_unique').on(table.userId, table.orgId),
    index('idx_membership_org_id').on(table.orgId),
    index('idx_membership_invite_token').on(table.inviteToken),
    check('membership_role_check', sql`${table.role} in ('owner', 'admin', 'manager')`),
  ],
);

// ── client ────────────────────────────────────────────────────────────────────
export const clients = pgTable(
  'client',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    platform: text('platform').notNull(),
    platformAccountId: text('platform_account_id'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
    deletedAt: timestamptz('deleted_at'),
  },
  (table) => [
    index('idx_client_org_id_created_at').on(table.orgId, table.createdAt),
    check(
      'client_platform_check',
      sql`${table.platform} in ('meta', 'google_ads', 'tiktok', 'instagram')`,
    ),
  ],
);

// ── metric ────────────────────────────────────────────────────────────────────
export const metrics = pgTable(
  'metric',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    metricName: text('metric_name').notNull(),
    metricValue: numeric('metric_value', { precision: 14, scale: 2 }).notNull(),
    period: date('period').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    updatedBy: uuid('updated_by').references(() => users.id),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_metric_org_client_period').on(table.orgId, table.clientId, table.period),
    check(
      'metric_metric_name_check',
      sql`${table.metricName} in ('impressions', 'clicks', 'spend', 'ctr', 'cpl', 'roas', 'conversions', 'conversion_value')`,
    ),
  ],
);

// ── report ────────────────────────────────────────────────────────────────────
export const reports = pgTable(
  'report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    periodMonth: text('period_month').notNull(),
    /** Client ids this report covers; `null` means every client in the org. */
    clientIds: jsonb('client_ids').$type<string[]>(),
    status: text('status').notNull().default('draft'),
    pdfUrl: text('pdf_url'),
    generatedAt: timestamptz('generated_at'),
    sharedToken: text('shared_token').unique(),
    sharedAt: timestamptz('shared_at'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_report_org_id_created_at').on(table.orgId, table.createdAt),
    index('idx_report_shared_token').on(table.sharedToken),
    check(
      'report_status_check',
      sql`${table.status} in ('draft', 'generated', 'sent', 'shared')`,
    ),
  ],
);

// ── report_comment ────────────────────────────────────────────────────────────
export const reportComments = pgTable(
  'report_comment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    reportId: uuid('report_id')
      .notNull()
      .references(() => reports.id, { onDelete: 'cascade' }),
    commentText: text('comment_text').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [index('idx_report_comment_report_id').on(table.reportId)],
);

// ── audit_log ─────────────────────────────────────────────────────────────────
export const auditLogs = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    targetId: uuid('target_id'),
    metadata: jsonb('metadata'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('idx_audit_log_org_id_created_at').on(table.orgId, table.createdAt),
    index('idx_audit_log_actor_id_created_at').on(table.actorId, table.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Metric = typeof metrics.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type ReportComment = typeof reportComments.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;

export type Role = 'owner' | 'admin' | 'manager';
