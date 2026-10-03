import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { isAllowed, USER_AGENT_TOKEN } from '@/lib/finder/robots'

/**
 * Fetch a public web page the user pointed us at, politely and safely.
 *
 * Safely: these URLs come from users, and the server is doing the fetching,
 * so every hop is checked to resolve to a public address (no localhost,
 * private ranges or cloud metadata). Redirects are followed by hand so each
 * one gets the same check.
 *
 * Politely: identify ourselves, respect robots.txt, one request at a time,
 * small size cap, short timeout.
 */

export const USER_AGENT = `Mozilla/5.0 (compatible; ${USER_AGENT_TOKEN}/0.1; +https://mxtei.com/mxreach)`
const MAX_BYTES = 1_500_000
const TIMEOUT_MS = 8_000
const MAX_REDIRECTS = 3

export class BlockedUrlError extends Error {}

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return ipv4Private(ip)
  const v6 = ip.toLowerCase()
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return ipv4Private(mapped[1])
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') || v6.startsWith('ff')
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new BlockedUrlError(`not a URL: ${raw}`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BlockedUrlError('only http and https links')
  if (url.port && url.port !== '80' && url.port !== '443') throw new BlockedUrlError('unusual port')
  if (url.username || url.password) throw new BlockedUrlError('credentials in URL')

  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
  if (!addrs.length) throw new BlockedUrlError(`can't resolve ${host}`)
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new BlockedUrlError(`${host} is not a public address`)
  return url
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.byteLength
  }
  await reader.cancel().catch(() => {})
  return Buffer.concat(chunks).subarray(0, MAX_BYTES).toString('utf8')
}

async function get(raw: string): Promise<{ url: string; status: number; body: string; contentType: string }> {
  let current = raw
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(current)
    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,text/plain;q=0.9,*/*;q=0.1' },
    })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location')!, url).toString()
      await res.body?.cancel().catch(() => {})
      continue
    }
    const contentType = res.headers.get('content-type') ?? ''
    const body = /html|text\/plain|xml/.test(contentType) ? await readCapped(res) : ''
    if (!body) await res.body?.cancel().catch(() => {})
    return { url: url.toString(), status: res.status, body, contentType }
  }
  throw new BlockedUrlError('too many redirects')
}

/** Fetches pages, remembering each site's robots.txt for the run. */
export class PageFetcher {
  private robots = new Map<string, string>()

  async allowed(raw: string): Promise<boolean> {
    const url = new URL(raw)
    if (!this.robots.has(url.origin)) {
      const txt = await get(`${url.origin}/robots.txt`)
        .then((r) => (r.status === 200 ? r.body : ''))
        .catch(() => '')
      this.robots.set(url.origin, txt)
    }
    return isAllowed(this.robots.get(url.origin)!, url.pathname + url.search)
  }

  /** The page's HTML, or null when robots.txt says no or it isn't a page. */
  async page(raw: string): Promise<{ url: string; html: string } | null> {
    await assertPublicUrl(raw)
    if (!(await this.allowed(raw))) return null
    const r = await get(raw)
    if (r.status !== 200 || !r.body) return null
    return { url: r.url, html: r.body }
  }
}
