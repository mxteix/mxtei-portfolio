import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { sign } from '@/lib/crypto'
import { env } from '@/lib/env'
import { googleApp, STATE_COOKIE } from '@/lib/engine/mailbox'
import { authorizeUrl } from '@/lib/mail/gmail'
import { limitsFor } from '@/lib/plans'
import { getSession } from '@/lib/session'

/**
 * Start connecting a Gmail mailbox. The OAuth state is random and pinned to
 * this browser in a signed, httpOnly cookie along with the workspace, so the
 * callback can't be replayed into someone else's workspace.
 */
export async function GET(request: NextRequest) {
  const { supabase, workspace, email } = await getSession()

  const { count } = await supabase.from('mailboxes').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id)
  const reconnect = request.nextUrl.searchParams.get('email')
  if (!reconnect && (count ?? 0) >= limitsFor(workspace.plan).mailboxes) {
    return NextResponse.redirect(new URL('/mailboxes?error=limit', request.url))
  }

  const nonce = randomBytes(16).toString('base64url')
  const payload = `${nonce}.${workspace.id}`
  const res = NextResponse.redirect(authorizeUrl(googleApp(), nonce, reconnect ?? email ?? undefined))
  res.cookies.set(STATE_COOKIE, `${payload}.${sign(payload, env('APP_SECRET'))}`, {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/api/gmail',
    maxAge: 600,
  })
  return res
}
