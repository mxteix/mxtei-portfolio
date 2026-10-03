'use client'

import { useActionState } from 'react'
import { requestLink, type LoginState } from './actions'

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestLink, null)

  if (state?.ok) return <p className="notice ok">{state.message}</p>

  return (
    <form action={action} className="stack">
      <input type="hidden" name="next" value={next} />
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required autoFocus placeholder="you@example.com" />
      </label>
      {state && !state.ok && <p className="notice bad">{state.message}</p>}
      <button className="btn primary" disabled={pending}>
        {pending ? 'Sending…' : 'Email me a sign-in link'}
      </button>
    </form>
  )
}
