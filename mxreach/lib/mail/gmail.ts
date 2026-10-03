/**
 * Gmail over plain REST. Two scopes, the least we can do the job with:
 *
 *   gmail.send      send as the user                       (sensitive)
 *   gmail.metadata  read headers, never bodies: enough to
 *                   spot replies and bounces in a thread   (restricted)
 *
 * Restricted scopes need Google's app verification plus a yearly security
 * assessment before the public can connect. Until then, up to 100 test users
 * added in the Google Cloud console can.
 */

export const GMAIL_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.metadata',
]

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export type GoogleApp = { clientId: string; clientSecret: string; redirectUri: string }

/** The mailbox's refresh token no longer works: the user revoked it or it expired. */
export class MailboxAuthError extends Error {}

export function authorizeUrl(app: GoogleApp, state: string, loginHint?: string): string {
  const url = new URL(AUTH_URL)
  url.searchParams.set('client_id', app.clientId)
  url.searchParams.set('redirect_uri', app.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GMAIL_SCOPES.join(' '))
  url.searchParams.set('access_type', 'offline')
  // Always ask, so Google always returns a refresh token.
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('state', state)
  if (loginHint) url.searchParams.set('login_hint', loginHint)
  return url.toString()
}

type TokenResponse = { access_token: string; refresh_token?: string; scope?: string; expires_in: number }

async function token(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const json = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string; error_description?: string }
  if (!res.ok) {
    if (json.error === 'invalid_grant') throw new MailboxAuthError('Gmail access was revoked or expired. Reconnect the mailbox.')
    throw new Error(`Google token error: ${json.error ?? res.status} ${json.error_description ?? ''}`.trim())
  }
  return json as TokenResponse
}

export async function exchangeCode(app: GoogleApp, code: string) {
  const t = await token({
    code,
    client_id: app.clientId,
    client_secret: app.clientSecret,
    redirect_uri: app.redirectUri,
    grant_type: 'authorization_code',
  })
  const granted = new Set((t.scope ?? '').split(' '))
  const missing = GMAIL_SCOPES.filter((s) => s.startsWith('https://') && !granted.has(s))
  return { accessToken: t.access_token, refreshToken: t.refresh_token ?? null, missingScopes: missing }
}

export async function refreshAccessToken(app: Omit<GoogleApp, 'redirectUri'>, refreshToken: string): Promise<string> {
  const t = await token({
    refresh_token: refreshToken,
    client_id: app.clientId,
    client_secret: app.clientSecret,
    grant_type: 'refresh_token',
  })
  return t.access_token
}

async function api<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', ...init?.headers },
  })
  if (res.status === 401) throw new MailboxAuthError('Gmail rejected the access token. Reconnect the mailbox.')
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Gmail ${res.status}: ${text.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

export async function getProfile(accessToken: string): Promise<{ emailAddress: string }> {
  return api(accessToken, '/profile')
}

/** Send a raw RFC 5322 message; threadId keeps follow-ups in the same thread. */
export async function sendRaw(accessToken: string, raw: string, threadId?: string | null) {
  return api<{ id: string; threadId: string }>(accessToken, '/messages/send', {
    method: 'POST',
    body: JSON.stringify({ raw: Buffer.from(raw, 'utf8').toString('base64url'), ...(threadId ? { threadId } : {}) }),
  })
}

type Header = { name: string; value: string }
type ApiMessage = { id: string; labelIds?: string[]; payload?: { headers?: Header[] } }

export type ThreadMessage = {
  id: string
  from: string
  subject: string
  messageId: string
  /** RFC 3834: anything but "no" means a machine wrote it (out-of-office etc). */
  autoSubmitted: string
  labels: string[]
}

function header(m: ApiMessage, name: string): string {
  return m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function toThreadMessage(m: ApiMessage): ThreadMessage {
  return {
    id: m.id,
    from: header(m, 'From'),
    subject: header(m, 'Subject'),
    messageId: header(m, 'Message-ID'),
    autoSubmitted: header(m, 'Auto-Submitted'),
    labels: m.labelIds ?? [],
  }
}

const METADATA = ['From', 'Subject', 'Message-ID', 'Auto-Submitted']
  .reduce((q, h) => `${q}&metadataHeaders=${h}`, 'format=metadata')

/** The Message-ID Gmail actually sent with, for threading follow-ups. */
export async function getMessage(accessToken: string, id: string): Promise<ThreadMessage> {
  return toThreadMessage(await api<ApiMessage>(accessToken, `/messages/${encodeURIComponent(id)}?${METADATA}`))
}

export async function getThread(accessToken: string, threadId: string): Promise<ThreadMessage[]> {
  const t = await api<{ messages?: ApiMessage[] }>(accessToken, `/threads/${encodeURIComponent(threadId)}?${METADATA}`)
  return (t.messages ?? []).map(toThreadMessage)
}

/** Pull the bare address out of a From header. */
export function addressOf(from: string): string {
  const m = from.match(/<([^>]+)>/)
  return (m ? m[1] : from).trim().toLowerCase()
}

const BOUNCE_SENDERS = /^(mailer-daemon|postmaster)@/i
const BOUNCE_SUBJECTS = /(delivery status notification|undeliverable|delivery has failed|mail delivery (failed|subsystem)|returned mail|address not found)/i
const AUTO_REPLY_SUBJECTS = /^(automatic reply|auto(matic)?[- ]?reply|out of (the )?office|abwesenheitsnotiz|réponse automatique)\b/i

export type ThreadVerdict = 'replied' | 'bounced' | 'none'

/**
 * Did anyone other than the mailbox write into this thread? A bounce is a
 * message from a mail daemon; an out-of-office is ignored; anything else from
 * someone else is a reply. Only messages after the ones we sent count.
 */
export function classifyThread(messages: ThreadMessage[], mailbox: string, sentIds: Set<string>): ThreadVerdict {
  const own = mailbox.toLowerCase()
  let verdict: ThreadVerdict = 'none'
  let seenOurs = false
  for (const m of messages) {
    if (sentIds.has(m.id)) {
      seenOurs = true
      continue
    }
    if (!seenOurs) continue
    const from = addressOf(m.from)
    if (from === own || m.labels.includes('SENT')) continue
    if (BOUNCE_SENDERS.test(from) || BOUNCE_SUBJECTS.test(m.subject)) return 'bounced'
    const auto = m.autoSubmitted.trim().toLowerCase()
    if ((auto && auto !== 'no') || AUTO_REPLY_SUBJECTS.test(m.subject.trim())) continue
    verdict = 'replied'
  }
  return verdict
}
