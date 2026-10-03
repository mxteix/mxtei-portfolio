import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * AES-256-GCM for OAuth refresh tokens at rest. A leaked database dump alone
 * can't send email as a customer.
 *
 * Format: v1.<iv>.<tag>.<ciphertext>, all base64url.
 */

function key(raw: string): Buffer {
  const k = Buffer.from(raw, 'base64')
  if (k.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded')
  return k
}

export function encrypt(plain: string, rawKey: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(rawKey), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.')
}

export function decrypt(sealed: string, rawKey: string): string {
  const [v, iv, tag, data] = sealed.split('.')
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('unrecognised encrypted token')
  const decipher = createDecipheriv('aes-256-gcm', key(rawKey), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}

/** HMAC-SHA256, base64url. */
export function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

export function signatureMatches(payload: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(sign(payload, secret))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
