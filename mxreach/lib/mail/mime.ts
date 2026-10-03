import { randomBytes } from 'node:crypto'

/**
 * Plain-text RFC 5322 messages. Cold outreach goes out as plain text on
 * purpose: no tracking pixels, no HTML, which is both better for
 * deliverability and closer to how a person writes.
 */

export type OutgoingEmail = {
  from: { name: string | null; email: string }
  to: string
  subject: string
  text: string
  inReplyTo?: string | null
  references?: string[]
  /** https URL accepting RFC 8058 one-click POSTs. */
  unsubscribeUrl?: string | null
}

const EMAIL = /^[^\s@<>()",;:\\[\]]+@[^\s@<>()",;:\\[\]]+\.[^\s@<>()",;:\\[\]]+$/

export function isEmail(value: string): boolean {
  return EMAIL.test(value)
}

/** Header values can't carry line breaks: that's header injection. */
export function headerSafe(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim()
}

/** RFC 2047 encoded-word when a header value isn't plain ASCII. */
export function encodeHeaderWord(value: string): string {
  const safe = headerSafe(value)
  if (/^[\x20-\x7e]*$/.test(safe)) return safe
  return `=?UTF-8?B?${Buffer.from(safe, 'utf8').toString('base64')}?=`
}

function formatAddress(name: string | null, email: string): string {
  if (!isEmail(email)) throw new Error(`invalid email address: ${email}`)
  if (!name?.trim()) return email
  const encoded = encodeHeaderWord(name)
  const display = encoded.startsWith('=?') ? encoded : `"${encoded.replace(/["\\]/g, '\\$&')}"`
  return `${display} <${email}>`
}

/** Quoted-printable (RFC 2045) over UTF-8, CRLF line endings, 76-column soft wraps. */
export function quotedPrintable(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  return lines
    .map((line) => {
      const bytes = Buffer.from(line, 'utf8')
      const tokens: string[] = []
      bytes.forEach((b, i) => {
        const last = i === bytes.length - 1
        const printable = (b >= 33 && b <= 126 && b !== 61) || ((b === 32 || b === 9) && !last)
        tokens.push(printable ? String.fromCharCode(b) : `=${b.toString(16).toUpperCase().padStart(2, '0')}`)
      })
      const out: string[] = []
      let current = ''
      for (const t of tokens) {
        if (current.length + t.length > 75) {
          out.push(`${current}=`)
          current = ''
        }
        current += t
      }
      out.push(current)
      return out.join('\r\n')
    })
    .join('\r\n')
}

export function newMessageId(fromEmail: string): string {
  const domain = fromEmail.split('@')[1] ?? 'mxreach.local'
  return `<${randomBytes(16).toString('hex')}@${domain}>`
}

/** The full message as a string, CRLF line endings. */
export function buildEmail(email: OutgoingEmail, now = new Date()): { raw: string; messageId: string } {
  if (!isEmail(email.to)) throw new Error(`invalid recipient: ${email.to}`)
  const messageId = newMessageId(email.from.email)

  const headers: [string, string][] = [
    ['From', formatAddress(email.from.name, email.from.email)],
    ['To', email.to],
    ['Subject', encodeHeaderWord(email.subject)],
    ['Date', now.toUTCString().replace('GMT', '+0000')],
    ['Message-ID', messageId],
  ]
  if (email.inReplyTo) headers.push(['In-Reply-To', headerSafe(email.inReplyTo)])
  const refs = (email.references ?? []).map(headerSafe).filter(Boolean)
  if (refs.length) headers.push(['References', refs.join(' ')])
  if (email.unsubscribeUrl) {
    headers.push(['List-Unsubscribe', `<${headerSafe(email.unsubscribeUrl)}>`])
    headers.push(['List-Unsubscribe-Post', 'List-Unsubscribe=One-Click'])
  }
  headers.push(
    ['MIME-Version', '1.0'],
    ['Content-Type', 'text/plain; charset=UTF-8'],
    ['Content-Transfer-Encoding', 'quoted-printable'],
  )

  const head = headers.map(([k, v]) => `${k}: ${v}`).join('\r\n')
  return { raw: `${head}\r\n\r\n${quotedPrintable(email.text)}`, messageId }
}

/** Follow-ups without their own subject reuse the first one, as a reply. */
export function replySubject(original: string): string {
  return /^re:/i.test(original.trim()) ? original.trim() : `Re: ${original.trim()}`
}

/**
 * The footer every email gets: who sent it, where from, and how to stop.
 * Required by CAN-SPAM and good practice under EU rules.
 */
export function withFooter(body: string, opts: { senderName: string | null; senderAddress: string; unsubscribeUrl: string }) {
  const who = [opts.senderName, opts.senderAddress].filter(Boolean).join(' · ')
  return `${body.trimEnd()}\n\n--\n${who}\nDon't want these emails? ${opts.unsubscribeUrl}`
}
