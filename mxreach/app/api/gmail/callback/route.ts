import { NextResponse, type NextRequest } from 'next/server'
import { encrypt, signatureMatches } from '@/lib/crypto'
import { env } from '@/lib/env'
import { googleApp, STATE_COOKIE } from '@/lib/engine/mailbox'
import { exchangeCode, getProfile } from '@/lib/mail/gmail'
import { getSession } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase/server'

function back(request: NextRequest, query: string) {
  const res = NextResponse.redirect(new URL(`/mailboxes?${query}`, request.url))
  res.cookies.delete({ name: STATE_COOKIE, path: '/api/gmail' })
  return res
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  if (params.get('error')) return back(request, 'error=denied')

  // The state must match the cookie this browser got, signed by us, and
  // belong to the workspace of whoever is signed in now.
  const cookie = request.cookies.get(STATE_COOKIE)?.value ?? ''
  const [nonce, workspaceId, sig] = cookie.split('.')
  const secret = env('APP_SECRET')
  if (!nonce || !workspaceId || !sig || !signatureMatches(`${nonce}.${workspaceId}`, sig, secret) || params.get('state') !== nonce) {
    return back(request, 'error=state')
  }
  const { workspace } = await getSession()
  if (workspace.id !== workspaceId) return back(request, 'error=state')

  const code = params.get('code')
  if (!code) return back(request, 'error=state')

  try {
    const tokens = await exchangeCode(googleApp(), code)
    // Google lets people untick permissions on the consent screen.
    if (tokens.missingScopes.length) return back(request, 'error=scopes')
    if (!tokens.refreshToken) return back(request, 'error=refresh')

    const profile = await getProfile(tokens.accessToken)
    const address = profile.emailAddress.toLowerCase()
    const service = createServiceClient()

    const { data: mailbox, error } = await service
      .from('mailboxes')
      .upsert(
        { workspace_id: workspace.id, provider: 'gmail', email: address, status: 'active', last_error: null },
        { onConflict: 'workspace_id,email' },
      )
      .select('id')
      .single()
    if (error || !mailbox) throw new Error(error?.message ?? 'mailbox not saved')

    const { error: secretError } = await service.from('mailbox_secrets').upsert({
      mailbox_id: mailbox.id,
      refresh_token_enc: encrypt(tokens.refreshToken, env('TOKEN_ENCRYPTION_KEY')),
      updated_at: new Date().toISOString(),
    })
    if (secretError) throw new Error(secretError.message)

    return back(request, `connected=${encodeURIComponent(address)}`)
  } catch (e) {
    console.error('gmail connect failed', e)
    return back(request, 'error=google')
  }
}
