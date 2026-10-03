/**
 * Environment access. Read lazily, never at module load, so a missing
 * variable fails the request that needs it with a clear message instead of
 * breaking the build or every page.
 */

export function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example.`)
  return value
}

export function optionalEnv(name: string): string | null {
  return process.env[name] || null
}

/** Supabase is the one thing every signed-in page needs. */
export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}

/** Public base URL, used in OAuth redirects and unsubscribe links. */
export function appUrl(): string {
  return env('APP_URL').replace(/\/+$/, '')
}
