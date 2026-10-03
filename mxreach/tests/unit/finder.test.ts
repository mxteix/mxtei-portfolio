import { describe, expect, it } from 'vitest'
import { findContactEmail, normalizeDomain, normalizeUrl, personKey, type CacheRow, type CascadeDeps } from '@/lib/finder/cascade'
import { contactLinks, decodeCloudflare, extractEmails } from '@/lib/finder/extract'
import { isPrivateAddress, assertPublicUrl } from '@/lib/finder/fetch-page'
import { mapHunterStatus, QuotaError } from '@/lib/finder/hunter'
import { findOnPublicPages } from '@/lib/finder/public-pages'
import { isAllowed } from '@/lib/finder/robots'
import type { FinderInput, LookupLog } from '@/lib/finder/types'
import { verifyAddress } from '@/lib/finder/verify'

describe('extractEmails', () => {
  it('prefers a business mailto on their own domain over noise', () => {
    const html = `
      <a href="mailto:business@samrivera.com?subject=Hi">Business</a>
      <p>Site by designer@agency.io</p>
      <img src="logo@2x.png"> <script>{"dsn":"abc@sentry.io"}</script>
      <p>noreply@samrivera.com</p>`
    const c = extractEmails(html, 'https://www.samrivera.com/')
    expect(c[0].email).toBe('business@samrivera.com')
    expect(c.map((x) => x.email)).not.toContain('logo@2x.png')
    expect(c.map((x) => x.email)).not.toContain('abc@sentry.io')
    expect(c.map((x) => x.email)).not.toContain('noreply@samrivera.com')
  })

  it('reads "at/dot" spellings and HTML entities', () => {
    expect(extractEmails('<p>booking [at] samrivera [dot] com</p>', 'https://x.com')[0].email).toBe('booking@samrivera.com')
    expect(extractEmails('<p>hi&#64;sam.co</p>', 'https://x.com')[0].email).toBe('hi@sam.co')
  })

  it('decodes Cloudflare-protected emails', () => {
    // "hi@sam.co" XOR 0x42
    const key = 0x42
    const hex = key.toString(16) + [...'hi@sam.co'].map((ch) => (ch.charCodeAt(0) ^ key).toString(16).padStart(2, '0')).join('')
    expect(decodeCloudflare(hex)).toBe('hi@sam.co')
    expect(extractEmails(`<span class="__cf_email__" data-cfemail="${hex}">[email&#160;protected]</span>`, 'https://sam.co')[0].email).toBe('hi@sam.co')
  })

  it("doesn't mistake names for greetings", () => {
    const [chris] = extractEmails('<p>chris@elsewhere.com</p>', 'https://x.com')
    const [hi] = extractEmails('<p>hi@elsewhere.com</p>', 'https://x.com')
    expect(hi.score).toBeGreaterThan(chris.score)
  })

  it('finds same-site contact links only', () => {
    const html = `<a href="/contact">Contact</a><a href="https://other.com/contact">x</a><a href="/blog">Blog</a><a href="/about-me">About me</a>`
    expect(contactLinks(html, 'https://sam.co/')).toEqual(['https://sam.co/contact', 'https://sam.co/about-me'])
  })
})

describe('findOnPublicPages', () => {
  it('follows one hop to a contact page', async () => {
    const pages: Record<string, string> = {
      'https://sam.co': '<a href="/contact">Contact</a>',
      'https://sam.co/contact': '<a href="mailto:booking@sam.co">Book</a>',
    }
    const fetcher = { page: async (u: string) => (pages[u.replace(/\/$/, '')] ? { url: u, html: pages[u.replace(/\/$/, '')] } : null) }
    expect(await findOnPublicPages(['sam.co'], fetcher)).toEqual({ email: 'booking@sam.co', url: 'https://sam.co/contact' })
  })

  it('ignores a lone unrelated address', async () => {
    const fetcher = { page: async (u: string) => ({ url: u, html: '<p>Theme by someone@themeshop.io</p>' }) }
    expect(await findOnPublicPages(['https://sam.co'], fetcher)).toBeNull()
  })
})

describe('robots.txt', () => {
  const txt = `
User-agent: *
Disallow: /private
Allow: /private/contact$

User-agent: mxReachBot
Disallow: /nope
`
  it('uses our group when present', () => {
    expect(isAllowed(txt, '/private')).toBe(true) // our group doesn't disallow it
    expect(isAllowed(txt, '/nope/x')).toBe(false)
  })
  it('falls back to * with longest match', () => {
    expect(isAllowed(txt, '/private/x', 'OtherBot')).toBe(false)
    expect(isAllowed(txt, '/private/contact', 'OtherBot')).toBe(true)
    expect(isAllowed(txt, '/', 'OtherBot')).toBe(true)
  })
  it('empty Disallow allows all', () => {
    expect(isAllowed('User-agent: *\nDisallow:', '/anything')).toBe(true)
  })
})

describe('fetching user-supplied URLs', () => {
  it('knows private addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1', '100.64.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true)
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700::1111']) expect(isPrivateAddress(ip), ip).toBe(false)
  })

  it('refuses internal targets before any request', async () => {
    await expect(assertPublicUrl('http://127.0.0.1/admin')).rejects.toThrow(/public/)
    await expect(assertPublicUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/public/)
    await expect(assertPublicUrl('file:///etc/passwd')).rejects.toThrow(/http/)
    await expect(assertPublicUrl('https://sam.co:8443/')).rejects.toThrow(/port/)
    await expect(assertPublicUrl('http://[::1]/')).rejects.toThrow(/public/)
  })
})

describe('verification', () => {
  it('maps Hunter verdicts', () => {
    expect(mapHunterStatus({ status: 'valid' }, 200)).toBe('valid')
    expect(mapHunterStatus({ status: 'accept_all' }, 200)).toBe('accept_all')
    expect(mapHunterStatus({ status: 'disposable' }, 200)).toBe('invalid')
    expect(mapHunterStatus({ status: 'webmail', smtp_check: true }, 200)).toBe('valid')
    expect(mapHunterStatus({ status: 'webmail', smtp_check: false }, 200)).toBe('risky')
    expect(mapHunterStatus({ status: 'valid' }, 202)).toBe('unknown')
  })

  it('checks syntax and the domain before paying for a verification', async () => {
    let calls = 0
    const provider = async () => (calls++, 'valid' as const)
    expect((await verifyAddress('nope', { provider })).status).toBe('invalid')
    expect((await verifyAddress('a@dead.example', { provider, domainAcceptsMail: async () => 'none' })).status).toBe('invalid')
    expect(calls).toBe(0)
    expect((await verifyAddress('a@live.example', { provider, domainAcceptsMail: async () => 'mx' })).status).toBe('valid')
    expect((await verifyAddress('a@live.example', { provider: null, domainAcceptsMail: async () => 'mx' })).status).toBe('unknown')
  })
})

describe('cascade', () => {
  const NOW = new Date('2026-09-29T12:00:00Z')
  const input = (over: Partial<FinderInput> = {}): FinderInput => ({
    firstName: 'Sam', lastName: 'Rivera', fullName: null, company: 'Acme', domain: 'acme.com', urls: ['https://samrivera.com'], ...over,
  })

  function deps(over: Partial<CascadeDeps> = {}) {
    const cache = new Map<string, CacheRow>()
    const log: LookupLog[] = []
    const calls = { api: 0, pages: 0, verify: 0 }
    const d: CascadeDeps = {
      cacheGet: async (keys) => keys.map((k) => cache.get(k)).filter((r): r is CacheRow => Boolean(r)),
      cachePut: async (rows) => rows.forEach((r) => cache.set(r.key, r)),
      domainApi: async () => (calls.api++, { email: 'sam@acme.com' }),
      publicPages: async () => (calls.pages++, { email: 'business@samrivera.com', url: 'https://samrivera.com' }),
      verify: async () => (calls.verify++, { status: 'valid', detail: 'ok' }),
      log: (e) => log.push(e),
      now: () => NOW,
      ...over,
    }
    return { d, cache, log, calls }
  }

  it("runs branches in the preset's order and stops at the first verified hit", async () => {
    const { d, calls, log } = deps()
    const r = await findContactEmail(input(), ['public_page', 'domain_api'], d)
    expect(r).toMatchObject({ email: 'business@samrivera.com', source: 'public_page', status: 'valid' })
    expect(calls.api).toBe(0)
    expect(log.map((l) => `${l.branch}:${l.outcome}`)).toEqual(['public_page:found', 'verify:found'])
  })

  it('falls through when a found address fails verification', async () => {
    let n = 0
    const { d } = deps({ verify: async () => ({ status: n++ === 0 ? 'invalid' : 'valid', detail: '' }) })
    const r = await findContactEmail(input(), ['public_page', 'domain_api'], d)
    expect(r?.source).toBe('domain_api')
  })

  it('serves repeat lookups from the cache for free', async () => {
    const { d, calls } = deps()
    await findContactEmail(input(), ['domain_api'], d)
    const again = await findContactEmail(input(), ['domain_api'], d)
    expect(again?.source).toBe('cache')
    expect(calls.api).toBe(1)
    expect(calls.verify).toBe(1)
  })

  it('remembers misses for 30 days so nobody pays twice for nothing', async () => {
    const { d, calls, log } = deps({ domainApi: async () => (calls.api++, null) })
    const { calls: _ } = { calls }
    await findContactEmail(input({ urls: [] }), ['domain_api'], d)
    await findContactEmail(input({ urls: [] }), ['domain_api'], d)
    expect(calls.api).toBe(1)
    expect(log.at(-1)).toMatchObject({ branch: 'domain_api', outcome: 'skipped' })
  })

  it('skips branches that have nothing to work with, and says why', async () => {
    const { d, log } = deps({ domainApi: null })
    const r = await findContactEmail(input({ urls: [] }), ['domain_api', 'public_page'], d)
    expect(r).toBeNull()
    expect(log).toEqual([
      { branch: 'domain_api', outcome: 'skipped', detail: 'no enrichment API key configured' },
      { branch: 'public_page', outcome: 'skipped', detail: 'no website or link-in-bio to read' },
    ])
  })

  it('logs running out of credits and carries on', async () => {
    const { d, log } = deps({ domainApi: async () => { throw new QuotaError('limit') } })
    const r = await findContactEmail(input(), ['domain_api', 'public_page'], d)
    expect(r?.source).toBe('public_page')
    expect(log[0]).toMatchObject({ branch: 'domain_api', outcome: 'error', detail: 'out of lookup credits' })
  })

  it('normalizes keys', () => {
    expect(normalizeDomain('https://www.Acme.com/about')).toBe('acme.com')
    expect(normalizeUrl('WWW.SamRivera.com/links/')).toBe('https://samrivera.com/links')
    expect(personKey(input({ firstName: 'Zoë', lastName: 'Ábel' }))).toBe('pd:acme.com:zoe abel')
  })
})
