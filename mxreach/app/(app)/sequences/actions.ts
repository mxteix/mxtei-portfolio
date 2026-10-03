'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { FormState } from '@/components/action-form'
import { getSession } from '@/lib/session'
import { activationProblems } from '@/lib/sequences'

const CHANNELS = ['email', 'discord', 'instagram', 'linkedin']

type StarterStep = { channel: string; delay_hours: number; subject: string; body: string }

export async function createSequence(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, workspace } = await getSession()
  const presetId = String(form.get('preset') ?? '')
  const { data: preset } = await supabase.from('presets').select('id, name, starter').eq('id', presetId).single()
  if (!preset) return { ok: false, message: 'Pick a preset.' }

  const { data: mailbox } = await supabase
    .from('mailboxes')
    .select('id')
    .eq('workspace_id', workspace.id)
    .eq('status', 'active')
    .order('created_at')
    .limit(1)
    .maybeSingle()

  const name = String(form.get('name') ?? '').trim() || `${preset.name} outreach`
  const { data: seq, error } = await supabase
    .from('sequences')
    .insert({ workspace_id: workspace.id, name, preset_id: preset.id, mailbox_id: mailbox?.id ?? null })
    .select('id')
    .single()
  if (error) return { ok: false, message: error.message }

  const steps = (preset.starter as StarterStep[]).map((s, i) => ({
    workspace_id: workspace.id,
    sequence_id: seq.id,
    position: i + 1,
    channel: s.channel,
    delay_hours: s.delay_hours,
    subject: s.subject || null,
    body: s.body,
  }))
  const { error: stepsError } = await supabase.from('sequence_steps').insert(steps)
  if (stepsError) return { ok: false, message: stepsError.message }

  redirect(`/sequences/${seq.id}`)
}

export async function updateSequence(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await getSession()
  const id = String(form.get('id'))
  const mailbox = String(form.get('mailbox_id') ?? '')
  const { error } = await supabase
    .from('sequences')
    .update({
      name: String(form.get('name') ?? '').trim() || 'Untitled sequence',
      mailbox_id: mailbox || null,
      review_email: form.get('review_email') === 'on',
    })
    .eq('id', id)
  if (error) return { ok: false, message: error.message }
  revalidatePath(`/sequences/${id}`)
  return { ok: true, message: 'Saved.' }
}

export async function saveStep(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await getSession()
  const id = String(form.get('id'))
  const channel = String(form.get('channel'))
  if (!CHANNELS.includes(channel)) return { ok: false, message: 'Unknown channel.' }
  const days = Number(form.get('delay_days') ?? 0)
  if (!Number.isFinite(days) || days < 0 || days > 60) return { ok: false, message: 'Wait between 0 and 60 days.' }

  const { data, error } = await supabase
    .from('sequence_steps')
    .update({
      channel,
      delay_hours: Math.round(days * 24),
      subject: channel === 'email' ? String(form.get('subject') ?? '').trim() || null : null,
      body: String(form.get('body') ?? ''),
    })
    .eq('id', id)
    .select('sequence_id')
    .single()
  if (error) return { ok: false, message: error.message }
  revalidatePath(`/sequences/${data.sequence_id}`)
  return { ok: true, message: 'Saved.' }
}

export async function addStep(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, workspace } = await getSession()
  const sequenceId = String(form.get('sequence_id'))
  const { data: last } = await supabase
    .from('sequence_steps')
    .select('position')
    .eq('sequence_id', sequenceId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { error } = await supabase.from('sequence_steps').insert({
    workspace_id: workspace.id,
    sequence_id: sequenceId,
    position: (last?.position ?? 0) + 1,
    channel: 'email',
    delay_hours: 72,
    subject: null,
    body: 'Hi {{first_name|there}}, [[follow-up]]\n\n{{sender_name}}',
  })
  if (error) return { ok: false, message: error.message }
  revalidatePath(`/sequences/${sequenceId}`)
  return { ok: true, message: 'Step added.' }
}

export async function deleteStep(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await getSession()
  const { data, error } = await supabase.from('sequence_steps').delete().eq('id', String(form.get('id'))).select('sequence_id').single()
  if (error) return { ok: false, message: error.message }
  revalidatePath(`/sequences/${data.sequence_id}`)
  return { ok: true, message: 'Deleted.' }
}

export async function setStatus(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await getSession()
  const id = String(form.get('id'))
  const status = String(form.get('status'))
  if (status === 'active') {
    const problems = await activationProblems(supabase, id)
    if (problems.length) return { ok: false, message: `Not yet: ${problems.join('; ')}.` }
  }
  if (!['active', 'paused'].includes(status)) return { ok: false, message: 'Unknown status.' }
  const { error } = await supabase.from('sequences').update({ status }).eq('id', id)
  if (error) return { ok: false, message: error.message }
  revalidatePath(`/sequences/${id}`)
  revalidatePath('/sequences')
  return { ok: true, message: status === 'active' ? 'Live. Due steps are drafted every few minutes.' : 'Paused. Nothing new will be drafted.' }
}

export async function enrollAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await getSession()
  const sequenceId = String(form.get('sequence_id'))
  const ids = form.getAll('contact').map(String)
  if (!ids.length) return { ok: false, message: 'Tick at least one contact.' }
  const { data, error } = await supabase.rpc('enroll_contacts', { p_sequence: sequenceId, p_contacts: ids })
  if (error) return { ok: false, message: error.message }
  revalidatePath(`/sequences/${sequenceId}`)
  return { ok: true, message: `Enrolled ${data}.` }
}

export async function stopEnrollmentAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await getSession()
  const { error } = await supabase.rpc('stop_enrollment', { p_enrollment: String(form.get('id')), p_reason: 'manual' })
  if (error) return { ok: false, message: error.message }
  revalidatePath(`/sequences/${String(form.get('sequence_id'))}`)
  return { ok: true, message: 'Stopped.' }
}

export async function deleteSequence(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await getSession()
  const { error } = await supabase.from('sequences').delete().eq('id', String(form.get('id')))
  if (error) return { ok: false, message: error.message }
  redirect('/sequences')
}
