import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { supabaseConfigured } from '@/lib/env'

export const metadata: Metadata = { title: 'Setup needed' }

const VARS: [string, string][] = [
  ['NEXT_PUBLIC_SUPABASE_URL', 'mxReach’s own Supabase project URL'],
  ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'its anon / publishable key'],
  ['SUPABASE_SERVICE_ROLE_KEY', 'service role key (server only)'],
  ['APP_URL', 'where this app is served, e.g. https://app.mxtei.com'],
  ['TOKEN_ENCRYPTION_KEY', '32 random bytes, base64 (openssl rand -base64 32)'],
  ['APP_SECRET', 'any long random string'],
  ['CRON_SECRET', 'any long random string'],
  ['GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET', 'OAuth client for connecting Gmail'],
  ['HUNTER_API_KEY', 'contact lookup + verification (free tier is fine)'],
]

export default async function SetupPage() {
  // Checked per request: env vars can change without a rebuild.
  await connection()
  if (supabaseConfigured()) redirect('/today')
  return (
    <main className="auth">
      <div className="card stack" style={{ width: 'min(620px, 100%)' }}>
        <h1>mxReach isn’t configured yet</h1>
        <p className="muted">
          Copy <code>.env.example</code> to <code>.env.local</code> and fill these in. The full walkthrough is in{' '}
          <code>mxreach/README.md</code>.
        </p>
        <table>
          <tbody>
            {VARS.map(([name, what]) => (
              <tr key={name}>
                <td><code>{name}</code></td>
                <td className="muted small">{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
