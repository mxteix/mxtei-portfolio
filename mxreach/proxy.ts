import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Reachable without a session: sign-in, the unsubscribe link a recipient
// clicks, and the cron endpoint (which checks its own secret).
const PUBLIC = ['/login', '/auth/', '/u/', '/api/unsubscribe/', '/api/cron/', '/setup']

/**
 * Refreshes the Supabase session cookie on every request and sends signed-out
 * visitors to /login. This is an optimistic check only: pages still read the
 * user themselves, and RLS is what actually protects the data.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const path = request.nextUrl.pathname
  const isPublic = PUBLIC.some((p) => path === p || path.startsWith(p))

  if (!url || !key) {
    return isPublic ? NextResponse.next() : NextResponse.redirect(new URL('/setup', request.url))
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options)
        for (const [k, v] of Object.entries(headers)) response.headers.set(k, v)
      },
    },
  })

  // Verifies the JWT and refreshes it when needed. Nothing may run between
  // creating the client and this call.
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims && !isPublic) {
    const login = new URL('/login', request.url)
    if (path !== '/') login.searchParams.set('next', path)
    return NextResponse.redirect(login)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)'],
}
