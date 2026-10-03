import type { Metadata } from 'next'
import { LoginForm } from './form'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage(props: PageProps<'/login'>) {
  const { next, error } = await props.searchParams
  return (
    <main className="auth">
      <div className="card stack">
        <div className="brand" style={{ padding: 0 }}>
          mx<span>Reach</span> <small>early access</small>
        </div>
        <div>
          <h1>Sign in</h1>
          <p className="muted small" style={{ marginTop: 4 }}>
            We&apos;ll email you a one-time link. No password.
          </p>
        </div>
        {error && <p className="notice bad">That link didn&apos;t work or has expired. Request a new one.</p>}
        <LoginForm next={typeof next === 'string' ? next : '/today'} />
      </div>
    </main>
  )
}
