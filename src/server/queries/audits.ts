import 'server-only';

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { auditLogs, users } from '@/server/db/schema';

/**
 * Audit-log reads. Always org-scoped. The viewer page authorizes the org and
 * the caller's role (admin+); these functions take a resolved `orgId`.
 */

const DEFAULT_LIMIT = 200;

export type AuditEntry = {
  id: string;
  action: string;
  targetId: string | null;
  actorEmail: string;
  actorName: string | null;
  metadata: unknown;
  createdAt: Date;
};

export async function listAuditLogs(
  orgId: string,
  options: { action?: string; limit?: number } = {},
): Promise<AuditEntry[]> {
  const where = options.action
    ? and(eq(auditLogs.orgId, orgId), eq(auditLogs.action, options.action))
    : eq(auditLogs.orgId, orgId);

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      targetId: auditLogs.targetId,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
      actorEmail: users.email,
      actorName: users.name,
    })
    .from(auditLogs)
    .innerJoin(users, eq(users.id, auditLogs.actorId))
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(options.limit ?? DEFAULT_LIMIT);

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    targetId: row.targetId,
    actorEmail: row.actorEmail,
    actorName: row.actorName,
    metadata: row.metadata,
    createdAt: row.createdAt,
  }));
}

/** The distinct action types the org has logged — filter dropdown options. */
export async function auditActions(orgId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ action: auditLogs.action })
    .from(auditLogs)
    .where(eq(auditLogs.orgId, orgId))
    .orderBy(auditLogs.action);
  return rows.map((row) => row.action);
}
