import { describe, expect, it } from 'vitest'
import { addressOf, authorizeUrl, classifyThread, type ThreadMessage } from '@/lib/mail/gmail'
import { buildEmail, encodeHeaderWord, headerSafe, quotedPrintable, replySubject, withFooter } from '@/lib/mail/mime'

function decodeQP(s: string): string {
  const bytes: number[] = []
  // Soft breaks vanish; hard breaks are CRLF on the wire, \n in our text.
  const joined = s.replace(/=\r\n/g, '').replace(/\r\n/g, '\n')
  for (let i = 0; i < joined.length; i++) {
    if (joined[i] === '=') {
      bytes.push(parseInt(joined.slice(i + 1, i + 3), 16))
      i += 2
    } else bytes.push(joined.charCodeAt(i))
  }
  return Buffer.from(bytes).toString('utf8')
}

describe('quoted-printable', () => {
  it('round-trips UTF-8 and keeps lines within 76 columns', () => {
    const text = 'Szia Márton! ' + 'Ez egy hosszú sor, ami biztosan átlépi a hetvenhat karakteres határt. '.repeat(3) + '\nÚj sor = egyenlő 🔥 '
    const qp = quotedPrintable(text)
    for (const line of qp.split('\r\n')) expect(line.length).toBeLessThanOrEqual(76)
    expect(decodeQP(qp)).toBe(text)
  })

  it('never splits an escape across lines', () => {
    const qp = quotedPrintable('é'.repeat(100))
    for (const line of qp.split('\r\n')) expect(line.replace(/=$/, '')).toMatch(/^(=[0-9A-F]{2})*$/)
  })

  it('encodes trailing whitespace so it survives transport', () => {
    expect(quotedPrintable('end ')).toBe('end=20')
  })
})

describe('headers', () => {
  it('strips line breaks: no header injection', () => {
    expect(headerSafe('Hi\r\nBcc: victim@example.com')).toBe('Hi Bcc: victim@example.com')
    const { raw } = buildEmail({
      from: { name: 'M', email: 'm@mxtei.com' },
      to: 'sam@example.com',
      subject: 'Hello\r\nBcc: victim@example.com',
      text: 'x',
    })
    expect(raw.split('\r\n\r\n')[0]).not.toMatch(/^Bcc:/m)
  })

  it('encodes non-ASCII subjects', () => {
    expect(encodeHeaderWord('Szia 👋')).toMatch(/^=\?UTF-8\?B\?.+\?=$/)
    expect(encodeHeaderWord('Plain')).toBe('Plain')
  })
})

describe('buildEmail', () => {
  it('builds a threaded plain-text message with one-click unsubscribe', () => {
    const { raw, messageId } = buildEmail(
      {
        from: { name: 'Marcell Szoke', email: 'marcell@mxtei.com' },
        to: 'sam@example.com',
        subject: 'Re: Quick idea',
        text: 'Hi Sam',
        inReplyTo: '<a@mail>',
        references: ['<a@mail>'],
        unsubscribeUrl: 'https://app.mxtei.com/api/unsubscribe/t',
      },
      new Date('2026-09-29T10:00:00Z'),
    )
    const [head, body] = raw.split('\r\n\r\n')
    expect(head).toContain('From: "Marcell Szoke" <marcell@mxtei.com>')
    expect(head).toContain('In-Reply-To: <a@mail>')
    expect(head).toContain('References: <a@mail>')
    expect(head).toContain('List-Unsubscribe: <https://app.mxtei.com/api/unsubscribe/t>')
    expect(head).toContain('List-Unsubscribe-Post: List-Unsubscribe=One-Click')
    expect(head).toContain('Content-Type: text/plain; charset=UTF-8')
    expect(head).toContain('Date: Tue, 29 Sep 2026 10:00:00 +0000')
    expect(head).toContain(`Message-ID: ${messageId}`)
    expect(messageId).toMatch(/^<[0-9a-f]{32}@mxtei\.com>$/)
    expect(body).toBe('Hi Sam')
  })

  it('refuses a bad recipient', () => {
    expect(() => buildEmail({ from: { name: null, email: 'a@b.co' }, to: 'nope', subject: 's', text: 't' })).toThrow()
  })

  it('adds the sender and unsubscribe footer', () => {
    const t = withFooter('Hi\n\n', { senderName: 'Marcell', senderAddress: '1 Main St, Budapest', unsubscribeUrl: 'https://u/x' })
    expect(t).toBe("Hi\n\n--\nMarcell · 1 Main St, Budapest\nDon't want these emails? https://u/x")
  })

  it('builds reply subjects once', () => {
    expect(replySubject('Quick idea')).toBe('Re: Quick idea')
    expect(replySubject('RE: Quick idea')).toBe('RE: Quick idea')
  })
})

describe('gmail', () => {
  it('asks for offline access with send + metadata only', () => {
    const url = new URL(authorizeUrl({ clientId: 'c', clientSecret: 's', redirectUri: 'https://app/cb' }, 'st'))
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    const scopes = url.searchParams.get('scope')!.split(' ')
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.send')
    expect(scopes).toContain('https://www.googleapis.com/auth/gmail.metadata')
    expect(scopes.some((s) => s.includes('readonly') || s.includes('modify'))).toBe(false)
  })

  it('reads addresses from From headers', () => {
    expect(addressOf('Sam Rivera <Sam@Example.com>')).toBe('sam@example.com')
    expect(addressOf('sam@example.com')).toBe('sam@example.com')
  })

  const msg = (id: string, from: string, extra: Partial<ThreadMessage> = {}): ThreadMessage => ({
    id, from, subject: 'Quick idea', messageId: `<${id}>`, autoSubmitted: '', labels: [], ...extra,
  })
  const me = 'marcell@mxtei.com'

  it('spots a reply after our email', () => {
    const thread = [msg('1', me, { labels: ['SENT'] }), msg('2', 'Sam <sam@example.com>')]
    expect(classifyThread(thread, me, new Set(['1']))).toBe('replied')
  })

  it('ignores our own follow-ups and anything before our first email', () => {
    const thread = [msg('0', 'sam@example.com'), msg('1', me), msg('3', me, { labels: ['SENT'] })]
    expect(classifyThread(thread, me, new Set(['1']))).toBe('none')
  })

  it('treats out-of-office as no reply', () => {
    const ooo = [msg('1', me), msg('2', 'sam@example.com', { autoSubmitted: 'auto-replied' })]
    expect(classifyThread(ooo, me, new Set(['1']))).toBe('none')
    const oooSubject = [msg('1', me), msg('2', 'sam@example.com', { subject: 'Automatic reply: Quick idea' })]
    expect(classifyThread(oooSubject, me, new Set(['1']))).toBe('none')
  })

  it('spots bounces', () => {
    const thread = [msg('1', me), msg('2', 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>', { subject: 'Delivery Status Notification (Failure)' })]
    expect(classifyThread(thread, me, new Set(['1']))).toBe('bounced')
  })
})
