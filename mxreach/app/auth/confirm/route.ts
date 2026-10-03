import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

/**
 * Where the magic link lands. Handles both shapes Supabase can send: a PKCE
 * `code` (the default with @supabase/ssr) or a `token_hash` (custom email
 * templates).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const next = url.searchParams.get('next') ?? '/today'
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/today'
  const supabase = createServerClient()

  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error('missing code') }

  if (error) return NextResponse.redirect(new URL('/login?error=link', request.url))
  return NextResponse.redirect(new URL(safeNext, request.url))
}
