import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// `src/server/mutations/metrics.ts` is server-only and imports the DB client.
// Stub the guard and the client — we only inspect the queries it builds, never
// run them.
vi.mock('server-only', () => ({}));

const captured: { deleteWheres: unknown[]; insertValues: unknown[] } = {
  deleteWheres: [],
  insertValues: [],
};

vi.mock('@/server/db', () => {
  const deleteChain = () => ({
    where: (w: unknown) => {
      captured.deleteWheres.push(w);
      return Promise.resolve([]);
    },
  });
  const insertChain = () => ({
    values: (v: unknown) => {
      captured.insertValues.push(v);
      return Promise.resolve([]);
    },
  });
  const handle = {
    transaction: async (fn: (tx: unknown) => unknown) => fn(handle),
    delete: () => deleteChain(),
    insert: () => insertChain(),
  };
  return { db: handle };
});

const dialect = new PgDialect();
const renderLast = () =>
  dialect.sqlToQuery(captured.deleteWheres.at(-1) as never).sql;

beforeEach(() => {
  captured.deleteWheres.length = 0;
  captured.insertValues.length = 0;
});

describe('metric source scoping', () => {
  it('upsertSyncedMetrics scopes its delete by org, client, source and a period range', async () => {
    const { upsertSyncedMetrics } = await import('@/server/mutations/metrics');
    await upsertSyncedMetrics({
      orgId: 'org-1',
      clientId: 'client-1',
      connectedBy: 'user-1',
      source: 'meta',
      from: '2026-01-01',
      to: '2026-12-31',
      rows: [{ date: '2026-08-03', spend: 12.5 }],
    });
    const sql = renderLast();
    expect(sql).toContain('"org_id"');
    expect(sql).toContain('"client_id"');
    expect(sql).toContain('"source"');
    expect(sql).toContain('"period" >=');
    expect(sql).toContain('"period" <=');
  });

  it('upsertMonthlyMetrics delete now carries a source predicate', async () => {
    const { upsertMonthlyMetrics } = await import('@/server/mutations/metrics');
    await upsertMonthlyMetrics({
      orgId: 'org-1',
      clientId: 'client-1',
      actorId: 'user-1',
      periodMonth: '2026-08',
      values: { impressions: 10 },
    });
    const q = dialect.sqlToQuery(captured.deleteWheres.at(-1) as never);
    expect(q.sql).toContain('"source"');
    expect(q.params).toContain('manual');
  });

  it('upsertSyncedMetrics writes one row per present base metric, none for absent keys', async () => {
    const { upsertSyncedMetrics } = await import('@/server/mutations/metrics');
    await upsertSyncedMetrics({
      orgId: 'org-1',
      clientId: 'client-1',
      connectedBy: 'user-1',
      source: 'google_ads',
      from: '2026-08-01',
      to: '2026-08-31',
      rows: [{ date: '2026-08-03', spend: 12.5 }],
    });
    const rows = captured.insertValues.at(-1) as Array<{ metricName: string; source: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].metricName).toBe('spend');
    expect(rows[0].source).toBe('google_ads');
  });

  it('deleteManualBaseMetrics restricts to the five base names and source manual', async () => {
    const { deleteManualBaseMetrics } = await import('@/server/mutations/metrics');
    await deleteManualBaseMetrics('org-1', 'client-1');
    const q = dialect.sqlToQuery(captured.deleteWheres.at(-1) as never);
    expect(q.sql).toContain('"metric_name" in');
    expect(q.params).toEqual(
      expect.arrayContaining([
        'manual',
        'impressions',
        'clicks',
        'spend',
        'conversions',
        'conversion_value',
      ]),
    );
    // exactly the 5 names + 'manual' + the two ids
    expect((q.params as string[]).filter((p) => typeof p === 'string')).toHaveLength(8);
  });
});
