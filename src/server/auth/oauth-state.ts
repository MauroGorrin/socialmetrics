import 'server-only';

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';

/**
 * The OAuth `state` parameter for the ad-platform connect flow. A short-lived,
 * HMAC-signed blob carrying the client id and platform. The callback compares
 * the returned `state` to an httpOnly cookie holding the same string and
 * re-runs the authorization guard from the payload — the payload proves the
 * flow started legitimately, never that this session may write.
 */

const TTL_MS = 600_000; // 10 minutes
const PLATFORMS = new Set(['meta', 'google_ads']);

export type OAuthStatePayload = { clientId: string; platform: 'meta' | 'google_ads' };
type Signed = OAuthStatePayload & { nonce: string; exp: number };

function hmac(input: string): string {
  return createHmac('sha256', env.SESSION_JWT_SECRET).update(input).digest('base64url');
}

export function signState(payload: OAuthStatePayload): string {
  const body: Signed = { ...payload, nonce: randomUUID(), exp: Date.now() + TTL_MS };
  const encoded = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${encoded}.${hmac(encoded)}`;
}

export function verifyState(raw: string): OAuthStatePayload | null {
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expected = hmac(encoded);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Signed;
    if (typeof body.exp !== 'number' || body.exp < Date.now()) return null;
    if (!body.clientId || !PLATFORMS.has(body.platform)) return null;
    return { clientId: body.clientId, platform: body.platform };
  } catch {
    return null;
  }
}
