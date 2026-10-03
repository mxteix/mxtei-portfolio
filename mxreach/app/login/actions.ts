'use server'

import { appUrl } from '@/lib/env'
import { isEmail } from '@/lib/mail/mime'
import { createServerClient } from '@/lib/supabase/server'

export type LoginState = { ok: boolean; message: string } | null

/**
 * mxReach isn't launched: sign-in is invite-only. Sign-ups are switched off
 * in Supabase (Auth → Sign In / Providers → "Allow new users to sign up"),
 * so the Supabase user list is the guest list: add people there. This never
 * creates users, and it answers the same way whether or not the address is
 * invited, so the form can't be used to find out who is.
 */
export async function requestLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  const next = String(form.get('next') ?? '/today')
  if (!isEmail(email)) return { ok: false, message: 'Enter a valid email address.' }

  const sent: LoginState = {
    ok: true,
    message: `If ${email} has early access, a sign-in link is on its way. Not on the list yet? Join the waitlist at mxtei.com/mxreach.`,
  }
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/today'
  const supabase = createServerClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${appUrl()}/auth/confirm?next=${encodeURIComponent(safeNext)}`,
    },
  })
  // Uninvited addresses error here too (422, signups disabled). The visitor
  // sees the same answer either way; the log tells the two apart.
  if (error) console.warn('magic link not sent', error.status, error.message)
  return sent
}
