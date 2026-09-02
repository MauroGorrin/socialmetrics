import { beforeAll, describe, expect, it, vi } from 'vitest';

// `src/lib/crypto.ts` is a server-only module; `server-only` throws on import
// under the plain Node resolution Vitest uses. Stub it so the codec — which is
// pure `node:crypto` — can be unit-tested. (Same pattern the repo would use for
// any server-only module it wanted covered by Vitest rather than Playwright.)
vi.mock('server-only', () => ({}));

// A fixed 32-byte key (base64) so the codec is deterministic under test.
const TEST_KEY = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
const OTHER_KEY = Buffer.from('fedcba9876543210fedcba9876543210').toString('base64');

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
});

describe('crypto token codec', () => {
  it('round-trips a token string', async () => {
    const { encryptToken, decryptToken } = await import('@/lib/crypto');
    const token = 'EAABsbCS1234567890|long-lived-user-token';
    expect(decryptToken(encryptToken(token))).toBe(token);
  });

  it('returns null when a payload byte is altered', async () => {
    const { encryptToken, decryptToken } = await import('@/lib/crypto');
    const payload = encryptToken('secret');
    const flipped = payload.slice(0, -2) + (payload.at(-2) === 'A' ? 'B' : 'A') + payload.at(-1);
    expect(decryptToken(flipped)).toBeNull();
  });

  it('returns null when decrypted with a different key', async () => {
    const { encryptToken, decryptToken } = await import('@/lib/crypto');
    const payload = encryptToken('secret');
    process.env.TOKEN_ENCRYPTION_KEY = OTHER_KEY;
    try {
      expect(decryptToken(payload)).toBeNull();
    } finally {
      process.env.TOKEN_ENCRYPTION_KEY = TEST_KEY;
    }
  });

  it('returns null (not throw) for a malformed payload', async () => {
    const { decryptToken } = await import('@/lib/crypto');
    expect(decryptToken('not.valid')).toBeNull();
    expect(decryptToken('')).toBeNull();
    expect(decryptToken('a.b.c')).toBeNull();
  });

  it('produces a different payload each time (random IV)', async () => {
    const { encryptToken } = await import('@/lib/crypto');
    expect(encryptToken('same')).not.toBe(encryptToken('same'));
  });
});
