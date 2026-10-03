import { NextResponse, type NextRequest } from 'next/server'
import { env } from '@/lib/env'
import { createServiceClient } from '@/lib/supabase/server'
import { readUnsubscribeToken } from '@/lib/unsubscribe'

/**
 * Unsubscribe. Two callers:
 *  - mail clients doing RFC 8058 one-click (POST "List-Unsubscribe=One-Click"),
 *    which must work with no further confirmation;
 *  - the confirm button on /u/[token].
 * GET does nothing on purpose: link scanners prefetch URLs in emails.
 */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/unsubscribe/[token]'>) {
  const { token } = await ctx.params
  const target = readUnsubscribeToken(token, env('APP_SECRET'))
  if (!target) return new NextResponse('Invalid unsubscribe link.', { status: 400 })

  const { error } = await createServiceClient().rpc('unsubscribe_contact', {
    p_workspace: target.workspaceId,
    p_contact: target.contactId,
  })
  if (error) {
    console.error('unsubscribe failed', error)
    return new NextResponse('Something went wrong. Reply to the email with "unsubscribe" instead.', { status: 500 })
  }

  const type = request.headers.get('content-type') ?? ''
  const body = type.includes('form') ? await request.formData().catch(() => null) : null
  if (body?.get('List-Unsubscribe') === 'One-Click') return new NextResponse('Unsubscribed.', { status: 200 })
  return NextResponse.redirect(new URL(`/u/${token}?done=1`, request.url), { status: 303 })
}
