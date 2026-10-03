'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'

export type FormState = { ok: boolean; message: string } | null
export type FormAction = (prev: FormState, form: FormData) => Promise<FormState>

/** A form bound to a server action, showing its result underneath. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  inline = false,
}: {
  action: FormAction
  children: React.ReactNode
  className?: string
  resetOnSuccess?: boolean
  inline?: boolean
}) {
  const [state, formAction] = useActionState(action, null)
  const ref = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset()
  }, [state, resetOnSuccess])

  return (
    <form ref={ref} action={formAction} className={className} style={inline ? { display: 'inline' } : undefined}>
      {children}
      {state?.message && (
        <p className={inline ? 'small muted' : `notice ${state.ok ? 'ok' : 'bad'}`} style={{ marginTop: 8 }}>
          {state.message}
        </p>
      )}
    </form>
  )
}

export function Submit({
  children,
  className = 'btn primary',
  pendingLabel,
  confirm,
}: {
  children: React.ReactNode
  className?: string
  pendingLabel?: string
  confirm?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault()
      }}
    >
      {pending ? (pendingLabel ?? 'Working…') : children}
    </button>
  )
}
