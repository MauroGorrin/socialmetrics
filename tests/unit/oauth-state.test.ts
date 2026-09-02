import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/env', () => ({ env: { SESSION_JWT_SECRET: 'unit-test-secret' } }));

describe('oauth-state', () => {
  it('round-trips a payload through sign/verify', async () => {
    const { signState, verifyState } = await import('@/server/auth/oauth-state');
    const payload = { clientId: 'client-123', platform: 'meta' as const };
    expect(verifyState(signState(payload))).toEqual(payload);
  });

  it('rejects a tampered signature', async () => {
    const { signState, verifyState } = await import('@/server/auth/oauth-state');
    const s = signState({ clientId: 'c', platform: 'google_ads' });
    const [body] = s.split('.');
    expect(verifyState(`${body}.deadbeefdeadbeefdeadbeefdeadbeef`)).toBeNull();
  });

  it('rejects an expired payload', async () => {
    vi.useFakeTimers();
    try {
      const { signState, verifyState } = await import('@/server/auth/oauth-state');
      const s = signState({ clientId: 'c', platform: 'meta' });
      vi.advanceTimersByTime(600_001);
      expect(verifyState(s)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects a malformed string', async () => {
    const { verifyState } = await import('@/server/auth/oauth-state');
    expect(verifyState('not-a-state')).toBeNull();
    expect(verifyState('a.b.c')).toBeNull();
    expect(verifyState('')).toBeNull();
  });
});
