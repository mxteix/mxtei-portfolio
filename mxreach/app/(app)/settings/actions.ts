'use server'

import { revalidatePath } from 'next/cache'
import type { FormState } from '@/components/action-form'
import { getSession } from '@/lib/session'

export async function saveSettings(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, workspace } = await getSession()
  const address = String(form.get('sender_address') ?? '').trim()
  if (address && address.length < 10) return { ok: false, message: 'That address looks too short to be a full postal address.' }

  const { error } = await supabase
    .from('workspaces')
    .update({
      name: String(form.get('name') ?? '').trim() || workspace.name,
      sender_name: String(form.get('sender_name') ?? '').trim() || null,
      sender_address: address || null,
    })
    .eq('id', workspace.id)
  if (error) return { ok: false, message: error.message }
  revalidatePath('/', 'layout')
  return { ok: true, message: 'Saved.' }
}
