import { resolveMx, resolve4, resolve6 } from 'node:dns/promises'
import { isEmail } from '@/lib/mail/mime'
import type { VerifyStatus } from '@/lib/finder/types'

/**
 * Verify before anything sends: cheap local checks first (syntax, does the
 * domain accept mail at all), then the paid verifier.
 */

export type DomainMail = 'mx' | 'implicit' | 'none'

/** Does the domain accept mail? No MX falls back to its A/AAAA record (RFC 5321 §5.1). */
export async function domainAcceptsMail(domain: string): Promise<DomainMail> {
  const mx = await resolveMx(domain).catch(() => [])
  // A single "." MX (RFC 7505) means the domain explicitly takes no mail.
  if (mx.length === 1 && (mx[0].exchange === '' || mx[0].exchange === '.')) return 'none'
  if (mx.length) return 'mx'
  const a = await resolve4(domain).catch(() => [] as string[])
  const aaaa = a.length ? [] : await resolve6(domain).catch(() => [] as string[])
  return a.length || aaaa.length ? 'implicit' : 'none'
}

export async function verifyAddress(
  email: string,
  deps: {
    domainAcceptsMail?: (domain: string) => Promise<DomainMail>
    provider?: ((email: string) => Promise<VerifyStatus>) | null
  } = {},
): Promise<{ status: VerifyStatus; detail: string }> {
  if (!isEmail(email)) return { status: 'invalid', detail: 'not a valid address' }

  const domain = email.split('@')[1]
  const mail = await (deps.domainAcceptsMail ?? domainAcceptsMail)(domain)
  if (mail === 'none') return { status: 'invalid', detail: `${domain} doesn't accept email` }

  if (!deps.provider) return { status: 'unknown', detail: 'no verifier configured (set HUNTER_API_KEY)' }
  const status = await deps.provider(email)
  return { status, detail: `verifier: ${status}` }
}
