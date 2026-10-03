import { QuotaError } from '@/lib/finder/hunter'
import type { FinderBranch, FinderInput, FinderResult, LookupLog, VerifyStatus } from '@/lib/finder/types'

/**
 * The contact cascade, stopping at the first verified hit:
 *
 *   0. shared cache      free, and gets cheaper the more customers use it
 *   1. branches in the preset's order:
 *        domain_api       person + company domain → work email (~$0.01)
 *        public_page      business email they publish themselves (~free)
 *   2. verify            before anything can send (~$0.001)
 *
 * Every attempt is logged per branch: that's the hit-rate data that decides
 * whether bought data is enough for an audience.
 *
 * Pure: every side effect comes in through deps, so it's testable offline.
 */

export type CacheRow = {
  key: string
  email: string | null
  source: FinderBranch
  verify_status: VerifyStatus | null
  checked_at: string
}

export type CascadeDeps = {
  cacheGet: (keys: string[]) => Promise<CacheRow[]>
  cachePut: (rows: CacheRow[]) => Promise<void>
  /** null when no API key is configured. */
  domainApi: ((input: FinderInput & { domain: string }) => Promise<{ email: string } | null>) | null
  publicPages: (urls: string[]) => Promise<{ email: string; url: string } | null>
  verify: (email: string) => Promise<{ status: VerifyStatus; detail: string }>
  log: (entry: LookupLog) => void
  now?: () => Date
}

const DAY = 86_400_000
const FOUND_FRESH_DAYS = 180
const VERIFY_FRESH_DAYS = 30
const MISS_FRESH_DAYS = 30

function normalizeName(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function normalizeDomain(raw: string): string | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  try {
    const host = new URL(s.includes('://') ? s : `https://${s}`).hostname
    return host.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim().includes('://') ? raw.trim() : `https://${raw.trim()}`)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    const path = u.pathname.replace(/\/+$/, '')
    return `https://${u.hostname.toLowerCase().replace(/^www\./, '')}${path}`
  } catch {
    return null
  }
}

function personName(input: FinderInput): string | null {
  const full = input.fullName ?? [input.firstName, input.lastName].filter(Boolean).join(' ')
  return full.trim() ? normalizeName(full) : null
}

export function personKey(input: FinderInput): string | null {
  const name = personName(input)
  const domain = input.domain ? normalizeDomain(input.domain) : null
  return name && domain ? `pd:${domain}:${name}` : null
}

export function urlKeys(input: FinderInput): string[] {
  return [...new Set(input.urls.map(normalizeUrl).filter((u): u is string => Boolean(u)))].map((u) => `url:${u}`)
}

export async function findContactEmail(
  input: FinderInput,
  branches: FinderBranch[],
  deps: CascadeDeps,
): Promise<FinderResult | null> {
  const now = deps.now?.() ?? new Date()
  const fresh = (row: CacheRow, days: number) => now.getTime() - new Date(row.checked_at).getTime() < days * DAY

  const pKey = personKey(input)
  const uKeys = urlKeys(input)
  const allKeys = [...(pKey ? [pKey] : []), ...uKeys]
  const cached = allKeys.length ? await deps.cacheGet(allKeys) : []

  // 0. Cache.
  const hit = cached.find((r) => r.email && fresh(r, FOUND_FRESH_DAYS) && r.verify_status !== 'invalid')
  if (hit?.email) {
    let status = hit.verify_status ?? 'unknown'
    let detail = `cached ${hit.source} result`
    if (!fresh(hit, VERIFY_FRESH_DAYS) || status === 'unknown') {
      const v = await deps.verify(hit.email)
      status = v.status
      detail = v.detail
      deps.log({ branch: 'verify', outcome: status === 'invalid' ? 'not_found' : 'found', email: hit.email, detail })
      await deps.cachePut([{ ...hit, verify_status: status, checked_at: now.toISOString() }])
    }
    if (status !== 'invalid') {
      deps.log({ branch: 'cache', outcome: 'found', email: hit.email, detail: hit.source })
      return { email: hit.email, source: 'cache', status, detail }
    }
  }

  const knownMiss = new Set(cached.filter((r) => !r.email && fresh(r, MISS_FRESH_DAYS)).map((r) => r.key))
  const miss = (keys: string[], source: FinderBranch) =>
    deps.cachePut(keys.map((key) => ({ key, email: null, source, verify_status: null, checked_at: now.toISOString() })))

  for (const branch of branches) {
    let candidate: { email: string; keys: string[]; detail: string } | null = null

    if (branch === 'domain_api') {
      const domain = input.domain ? normalizeDomain(input.domain) : null
      if (!deps.domainApi) {
        deps.log({ branch, outcome: 'skipped', detail: 'no enrichment API key configured' })
        continue
      }
      if (!domain || !pKey) {
        deps.log({ branch, outcome: 'skipped', detail: 'needs a name and a company domain' })
        continue
      }
      if (knownMiss.has(pKey)) {
        deps.log({ branch, outcome: 'skipped', detail: 'no result in the last 30 days (cached)' })
        continue
      }
      try {
        const r = await deps.domainApi({ ...input, domain })
        if (!r) {
          deps.log({ branch, outcome: 'not_found' })
          await miss([pKey], branch)
          continue
        }
        candidate = { email: r.email, keys: [pKey], detail: `found via company domain ${domain}` }
      } catch (e) {
        deps.log({ branch, outcome: 'error', detail: e instanceof QuotaError ? 'out of lookup credits' : String(e) })
        continue
      }
    }

    if (branch === 'public_page') {
      const urls = input.urls.filter((u) => {
        const n = normalizeUrl(u)
        return n && !knownMiss.has(`url:${n}`)
      })
      if (!input.urls.length) {
        deps.log({ branch, outcome: 'skipped', detail: 'no website or link-in-bio to read' })
        continue
      }
      if (!urls.length) {
        deps.log({ branch, outcome: 'skipped', detail: 'no result in the last 30 days (cached)' })
        continue
      }
      try {
        const r = await deps.publicPages(urls)
        if (!r) {
          deps.log({ branch, outcome: 'not_found' })
          await miss(urlKeys({ ...input, urls }), branch)
          continue
        }
        candidate = { email: r.email, keys: uKeys, detail: `published on ${r.url}` }
      } catch (e) {
        deps.log({ branch, outcome: 'error', detail: String(e) })
        continue
      }
    }

    if (!candidate) continue
    deps.log({ branch, outcome: 'found', email: candidate.email, detail: candidate.detail })

    const v = await deps.verify(candidate.email)
    deps.log({ branch: 'verify', outcome: v.status === 'invalid' ? 'not_found' : 'found', email: candidate.email, detail: v.detail })
    await deps.cachePut(
      candidate.keys.map((key) => ({
        key,
        email: candidate.email,
        source: branch,
        verify_status: v.status,
        checked_at: now.toISOString(),
      })),
    )
    if (v.status === 'invalid') continue

    return { email: candidate.email, source: branch, status: v.status, detail: candidate.detail }
  }

  return null
}
