import 'server-only';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM codec for ad-platform OAuth tokens at rest. Payload format is
 * `base64(iv).base64(authTag).base64(ciphertext)`. The key comes from
 * `TOKEN_ENCRYPTION_KEY` (base64 of exactly 32 bytes); it is an optional env
 * var, so a caller only reaches `encryptToken` behind `integrationsConfig()`,
 * which already proved the key is present.
 */

const IV_BYTES = 12;

function loadKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY is not configured');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes (base64-encoded)');
  }
  return key;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', loadKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((part) => part.toString('base64')).join('.');
}

/** Decrypt a payload from {@link encryptToken}. Returns `null` on any failure. */
export function decryptToken(payload: string): string | null {
  try {
    const parts = payload.split('.');
    if (parts.length !== 3) return null;
    const [iv, authTag, ciphertext] = parts.map((part) => Buffer.from(part, 'base64'));
    if (iv.length !== IV_BYTES || authTag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', loadKey(), iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
