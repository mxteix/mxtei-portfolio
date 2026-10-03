'use server'

import { revalidatePath } from 'next/cache'
import type { FormState } from '@/components/action-form'
import { getSession } from '@/lib/session'

export async function setDailyCap(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await getSession()
  const cap = Math.round(Number(form.get('daily_cap')))
  if (!Number.isFinite(cap) || cap < 1 || cap > 200) return { ok: false, message: 'Between 1 and 200 a day.' }
  const { error } = await supabase.from('mailboxes').update({ daily_cap: cap }).eq('id', String(form.get('id')))
  if (error) return { ok: false, message: error.message }
  revalidatePath('/mailboxes')
  return { ok: true, message: 'Saved.' }
}

/** Removes the mailbox and its stored token. Sequences using it stop sending until another is picked. */
export async function disconnect(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await getSession()
  const { error } = await supabase.from('mailboxes').delete().eq('id', String(form.get('id')))
  if (error) return { ok: false, message: error.message }
  revalidatePath('/mailboxes')
  return { ok: true, message: 'Disconnected. You can also revoke access at myaccount.google.com/permissions.' }
}
