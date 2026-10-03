import { createServerClient as createSsrClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { env } from '@/lib/env'

/**
 * The signed-in user's client. RLS is the tenancy boundary: every query made
 * with it can only see the user's own workspace.
 *
 * One per request. The cookie store is read lazily because cookies() is
 * async in Next 16 and callers construct this synchronously.
 */
export function createServerClient(): SupabaseClient {
  return createSsrClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('NEXT_PUBLIC_SUPABASE_ANON_KEY'), {
    cookies: {
      getAll: async () => (await cookies()).getAll(),
      setAll: async (toSet) => {
        try {
          const store = await cookies()
          for (const { name, value, options } of toSet) store.set(name, value, options)
        } catch {
          // Server Components can't set cookies. The proxy refreshes the
          // session on every request, so this write isn't needed there.
        }
      },
    },
  })
}

/**
 * Service role: bypasses RLS. Only for the cron worker, the OAuth callback,
 * unsubscribe links and the shared finder cache. Never hand its results to a
 * user without scoping them to their workspace first.
 */
export function createServiceClient(): SupabaseClient {
  return createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
