import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Both modules are server-only and import the DB client + the crypto codec.
// Stub all three — we only inspect what the functions build, never run them.
vi.mock('server-only', () => ({}));
vi.mock('@/lib/crypto', () => ({
  encryptToken: (s: string) => `enc(${s})`,
  decryptToken: (s: string) => s.replace(/^enc\(/, '').replace(/\)$/, ''),
}));

const cap: {
  wheres: unknown[];
  sets: Record<string, unknown>[];
  values: Record<string, unknown>[];
  rows: unknown[];
} = { wheres: [], sets: [], values: [], rows: [] };

vi.mock('@/server/db', () => {
  const select = () => {
    const o: Record<string, unknown> = {};
    o.from = () => o;
    o.where = (w: unknown) => {
      cap.wheres.push(w);
      return o;
    };
    o.orderBy = () => Promise.resolve(cap.rows);
    o.limit = () => Promise.resolve(cap.rows);
    o.then = (res: (v: unknown) => unknown) => Promise.resolve([]).then(res);
    return o;
  };
  const update = () => {
    const o: Record<string, unknown> = {};
    o.set = (s: Record<string, unknown>) => {
      cap.sets.push(s);
      return o;
    };
    o.where = (w: unknown) => {
      cap.wheres.push(w);
      return o;
    };
    o.returning = () => Promise.resolve([]);
    o.then = (res: (v: unknown) => unknown) => Promise.resolve(undefined).then(res);
    return o;
  };
  const insert = () => {
    const o: Record<string, unknown> = {};
    o.values = (v: Record<string, unknown>) => {
      cap.values.push(v);
      return o;
    };
    o.onConflictDoUpdate = () => o;
    o.returning = () => Promise.resolve([{ id: 'new-id' }]);
    return o;
  };
  return { db: { select, update, insert } };
});

const dialect = new PgDialect();
const lastWhereSql = () => dialect.sqlToQuery(cap.wheres.at(-1) as never).sql;

beforeEach(() => {
  cap.wheres.length = 0;
  cap.sets.length = 0;
  cap.values.length = 0;
  cap.rows.length = 0;
});

describe('platform_connection queries', () => {
  it('org-scoped reads carry an org_id predicate', async () => {
    const q = await import('@/server/queries/platform-connections');
    await q.listForOrg('org-1');
    expect(lastWhereSql()).toContain('"org_id"');
    await q.getForClient('org-1', 'client-1');
    expect(lastWhereSql()).toContain('"org_id"');
    await q.getById('org-1', 'conn-1');
    expect(lastWhereSql()).toContain('"org_id"');
  });

  it('getReusableGrant is scoped by org + platform and requires a stored token', async () => {
    const q = await import('@/server/queries/platform-connections');
    await q.getReusableGrant('org-1', 'meta');
    const sql = lastWhereSql();
    expect(sql).toContain('"org_id"');
    expect(sql).toContain('"platform"');
    expect(sql).toContain('"status"');
    expect(sql).toContain('"access_token_encrypted"');
    expect(sql.toLowerCase()).toContain('is not null');
  });

  it('getReusableGrant skips a grant whose token has already expired', async () => {
    const q = await import('@/server/queries/platform-connections');
    cap.rows.push({
      id: 'expired',
      tokenExpiresAt: new Date(Date.now() - 60_000),
      accessTokenEncrypted: 'enc(x)',
    });
    expect(await q.getReusableGrant('org-1', 'meta')).toBeNull();
  });

  it('getReusableGrant returns the first still-valid grant', async () => {
    const q = await import('@/server/queries/platform-connections');
    cap.rows.push(
      { id: 'expired', tokenExpiresAt: new Date(Date.now() - 60_000), accessTokenEncrypted: 'e' },
      { id: 'ok', tokenExpiresAt: null, accessTokenEncrypted: 'e' },
    );
    expect((await q.getReusableGrant('org-1', 'meta'))?.id).toBe('ok');
  });

  it('listConnected filters only by status and has no org_id predicate', async () => {
    const q = await import('@/server/queries/platform-connections');
    await q.listConnected();
    const sql = lastWhereSql();
    expect(sql).toContain('"status"');
    expect(sql).not.toContain('"org_id"');
  });
});

describe('platform_connection mutations', () => {
  it('finalize and remove are org-scoped', async () => {
    const m = await import('@/server/mutations/platform-connections');
    await m.finalize('org-1', 'conn-1', { externalAccountId: '123', externalAccountName: 'Acme' });
    expect(lastWhereSql()).toContain('"org_id"');
    await m.remove('org-1', 'conn-1');
    expect(lastWhereSql()).toContain('"org_id"');
  });

  it('finalize returns null when no row matches', async () => {
    const m = await import('@/server/mutations/platform-connections');
    expect(
      await m.finalize('other-org', 'conn-1', { externalAccountId: '1', externalAccountName: 'x' }),
    ).toBeNull();
  });

  it('createDraft stores the encrypted token, never the plaintext', async () => {
    const m = await import('@/server/mutations/platform-connections');
    await m.createDraft({
      orgId: 'org-1',
      clientId: 'client-1',
      platform: 'meta',
      connectedBy: 'user-1',
      accessToken: 'PLAINTEXT-TOKEN',
      refreshToken: 'PLAINTEXT-REFRESH',
    });
    const values = cap.values.at(-1) as Record<string, unknown>;
    // The stored value is the encryptToken() output, not the raw token.
    expect(values.accessTokenEncrypted).toBe('enc(PLAINTEXT-TOKEN)');
    expect(values.refreshTokenEncrypted).toBe('enc(PLAINTEXT-REFRESH)');
    expect(values.accessTokenEncrypted).not.toBe('PLAINTEXT-TOKEN');
    expect(values.status).toBe('pending');
  });

  it('remove sets status revoked and nulls all three token columns', async () => {
    const m = await import('@/server/mutations/platform-connections');
    await m.remove('org-1', 'conn-1');
    const set = cap.sets.at(-1) as Record<string, unknown>;
    expect(set.status).toBe('revoked');
    expect(set.accessTokenEncrypted).toBeNull();
    expect(set.refreshTokenEncrypted).toBeNull();
    expect(set.tokenExpiresAt).toBeNull();
  });

  it('decryptTokens round-trips through the codec', async () => {
    const m = await import('@/server/mutations/platform-connections');
    const conn = {
      accessTokenEncrypted: 'enc(a-token)',
      refreshTokenEncrypted: null,
    } as Parameters<typeof m.decryptTokens>[0];
    expect(m.decryptTokens(conn)).toEqual({ accessToken: 'a-token', refreshToken: null });
  });
});
