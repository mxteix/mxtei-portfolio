import type { VerifyStatus } from '@/lib/finder/types'

/**
 * Hunter.io: the paid branch of the cascade (person + company domain → work
 * email) and the verifier. One account covers both during the build, on its
 * free tier. Swappable for Prospeo/LeadMagic later behind the same shape.
 */

const API = 'https://api.hunter.io/v2'

/** Out of credits or rate limited: stop calling for this run. */
export class QuotaError extends Error {}

async function call<T>(path: string, params: Record<string, string>, key: string): Promise<{ status: number; data: T | null }> {
  const url = new URL(`${API}${path}`)
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v)
  url.searchParams.set('api_key', key)

  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (res.status === 429) throw new QuotaError('Hunter: usage limit reached')
  if (res.status === 401) throw new Error('Hunter: invalid API key')
  if (res.status === 404) return { status: 404, data: null }
  if (!res.ok && res.status !== 202) throw new Error(`Hunter ${res.status}`)
  const json = (await res.json().catch(() => ({}))) as { data?: T }
  return { status: res.status, data: json.data ?? null }
}

export async function hunterFind(
  person: { firstName: string | null; lastName: string | null; fullName: string | null; domain: string },
  key: string,
): Promise<{ email: string; score: number } | null> {
  const params: Record<string, string> = { domain: person.domain }
  if (person.firstName && person.lastName) {
    params.first_name = person.firstName
    params.last_name = person.lastName
  } else if (person.fullName) {
    params.full_name = person.fullName
  } else {
    return null
  }
  const { data } = await call<{ email: string | null; score: number | null }>('/email-finder', params, key)
  return data?.email ? { email: data.email.toLowerCase(), score: data.score ?? 0 } : null
}

type HunterVerification = {
  status: 'valid' | 'invalid' | 'accept_all' | 'webmail' | 'disposable' | 'unknown'
  result?: 'deliverable' | 'undeliverable' | 'risky'
  smtp_check?: boolean
}

/** Map Hunter's verdict onto ours. 202 means it's still checking: unknown for now. */
export function mapHunterStatus(v: HunterVerification | null, httpStatus: number): VerifyStatus {
  if (!v || httpStatus === 202) return 'unknown'
  switch (v.status) {
    case 'valid':
      return 'valid'
    case 'accept_all':
      return 'accept_all'
    case 'invalid':
    case 'disposable':
      return 'invalid'
    case 'webmail':
      // Gmail/Outlook addresses. Plenty of creators use one for business.
      if (v.result === 'undeliverable') return 'invalid'
      return v.smtp_check ? 'valid' : 'risky'
    default:
      return v.result === 'undeliverable' ? 'invalid' : 'unknown'
  }
}

export async function hunterVerify(email: string, key: string): Promise<VerifyStatus> {
  const { status, data } = await call<HunterVerification>('/email-verifier', { email }, key)
  return mapHunterStatus(data, status)
}
