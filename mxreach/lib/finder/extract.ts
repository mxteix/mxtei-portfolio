/**
 * Pull published business emails out of a page. Only what the person put
 * there themselves for people to contact them: mailto links, visible text,
 * the usual "name [at] domain [dot] com" spelling, and Cloudflare's
 * email-protection encoding (common on creator sites).
 */

const EMAIL_IN_TEXT = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi
const OBFUSCATED = /([a-z0-9._%+-]+)\s*[[(]\s*at\s*[\])]\s*([a-z0-9-]+(?:\s*[[(]\s*dot\s*[\])]\s*[a-z0-9-]+)+)/gi

const JUNK_DOMAINS = new Set([
  'example.com', 'example.org', 'domain.com', 'email.com', 'yourdomain.com', 'sentry.io',
  'wixpress.com', 'sentry-next.wixpress.com', 'sentry.wixpress.com', 'godaddy.com', 'mysite.com',
])
const JUNK_LOCAL = /^(no-?reply|do-?not-?reply|noreply|mailer-daemon|postmaster|user|name|your-?name|email|test)$/i
const FILE_LIKE = /\.(png|jpe?g|gif|svg|webp|avif|css|js|ico|woff2?)$/i

// Long words match anywhere; short ones only as a whole part ("hi", not "chris").
const GOOD_LOCAL = /(business|booking|management|mgmt|partner|collab|sponsor|brand|contact|inquir|enquir)|(^|[._-])(hello|hi|hey|press|team|work|pr)([._-]|$)/i
const WEAK_LOCAL = /(support|help|privacy|legal|abuse|jobs|careers|billing|security|dmca|unsubscribe)/i

export type Candidate = { email: string; score: number; via: 'mailto' | 'text' | 'obfuscated' | 'cloudflare' }

function clean(raw: string): string | null {
  const email = raw.trim().replace(/^mailto:/i, '').split('?')[0].replace(/[.,;:)]+$/, '').toLowerCase()
  const at = email.lastIndexOf('@')
  if (at < 1) return null
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (!/^[a-z0-9._%+-]+$/.test(local) || !/^[a-z0-9.-]+\.[a-z]{2,24}$/.test(domain)) return null
  if (FILE_LIKE.test(email) || JUNK_DOMAINS.has(domain) || JUNK_LOCAL.test(local)) return null
  return email
}

/** Cloudflare's data-cfemail: first byte is the XOR key for the rest. */
export function decodeCloudflare(hex: string): string | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 4 || hex.length % 2) return null
  const key = parseInt(hex.slice(0, 2), 16)
  let out = ''
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key)
  return out
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&commat;/gi, '@')
    .replace(/&period;/gi, '.')
    .replace(/&amp;/gi, '&')
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return null
  }
}

export function extractEmails(html: string, pageUrl: string): Candidate[] {
  const found = new Map<string, Candidate>()
  const pageHost = hostOf(pageUrl)

  const add = (raw: string, via: Candidate['via']) => {
    const email = clean(raw)
    if (!email) return
    const domain = email.split('@')[1]
    let score = { mailto: 3, cloudflare: 3, obfuscated: 2, text: 1 }[via]
    if (GOOD_LOCAL.test(email.split('@')[0])) score += 3
    if (WEAK_LOCAL.test(email.split('@')[0])) score -= 3
    if (pageHost && (domain === pageHost || pageHost.endsWith(`.${domain}`) || domain.endsWith(`.${pageHost}`))) score += 2
    const prev = found.get(email)
    if (!prev || prev.score < score) found.set(email, { email, score, via })
  }

  const decoded = decodeEntities(html)

  for (const m of decoded.matchAll(/href\s*=\s*["']\s*mailto:([^"']+)["']/gi)) {
    try {
      add(decodeURIComponent(m[1]), 'mailto')
    } catch {
      add(m[1], 'mailto')
    }
  }
  for (const m of decoded.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']/gi)) {
    const e = decodeCloudflare(m[1])
    if (e) add(e, 'cloudflare')
  }
  for (const m of decoded.matchAll(/\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/gi)) {
    const e = decodeCloudflare(m[1])
    if (e) add(e, 'cloudflare')
  }

  const text = decoded
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
  for (const m of text.matchAll(EMAIL_IN_TEXT)) add(m[0], 'text')
  for (const m of text.matchAll(OBFUSCATED)) {
    add(`${m[1]}@${m[2].replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, '.')}`, 'obfuscated')
  }

  return [...found.values()].sort((a, b) => b.score - a.score || a.email.localeCompare(b.email))
}

const CONTACT_LINK = /(contact|about|business|booking|press|partner|sponsor|collab|work-with|links?)\b/i

/** Same-site links that probably lead to a contact page, best first. */
export function contactLinks(html: string, pageUrl: string, max = 2): string[] {
  const base = new URL(pageUrl)
  const out: string[] = []
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const [, href, label] = m
    if (!CONTACT_LINK.test(href) && !CONTACT_LINK.test(label.replace(/<[^>]+>/g, ''))) continue
    let url: URL
    try {
      url = new URL(href, base)
    } catch {
      continue
    }
    if (url.hostname !== base.hostname || !/^https?:$/.test(url.protocol)) continue
    url.hash = ''
    const s = url.toString()
    if (s !== base.toString() && !out.includes(s)) out.push(s)
    if (out.length >= max) break
  }
  return out
}
