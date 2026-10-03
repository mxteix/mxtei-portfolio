import type { SupabaseClient } from '@supabase/supabase-js'
import { CHANNEL_MODE, type Channel } from '@/lib/channels'
import { SENDABLE, type VerifyStatus } from '@/lib/finder/types'
import { render, valuesFor, type TemplateValues } from '@/lib/templates'

/**
 * Drafting: turn each enrollment whose next step is due into a message.
 *
 * Email goes to 'queued' and the sender picks it up; assisted channels, and
 * email in review mode, go to 'awaiting_user' and show up in Today. Drafting
 * the same step twice is a no-op (unique on enrollment + step), so an
 * interrupted run just repeats harmlessly.
 */

export type DraftContext = {
  step: { channel: Channel; subject: string | null; body: string } | null
  handle: string | null
  suppressed: boolean
  emailStatus: VerifyStatus
  reviewEmail: boolean
  values: TemplateValues
}

export type DraftDecision =
  | { kind: 'advance'; reason: string }
  | { kind: 'skip'; reason: string }
  | { kind: 'stop'; reason: 'unsubscribed' }
  | { kind: 'draft'; status: 'queued' | 'awaiting_user'; subject: string | null; body: string; note: string | null }

export function decideDraft(ctx: DraftContext): DraftDecision {
  const { step } = ctx
  if (!step) return { kind: 'advance', reason: 'step was deleted' }
  if (ctx.suppressed) return { kind: 'stop', reason: 'unsubscribed' }
  if (!ctx.handle) return { kind: 'skip', reason: `no ${step.channel} contact for this person` }
  if (step.channel === 'email' && !SENDABLE.includes(ctx.emailStatus)) {
    return { kind: 'skip', reason: `email not verified (${ctx.emailStatus})` }
  }

  const body = render(step.body, ctx.values)
  const subject = step.subject?.trim() ? render(step.subject, ctx.values) : null
  const missing = [...new Set([...body.missing, ...(subject?.missing ?? [])])]
  const note = missing.length ? `Fill in before sending: ${missing.join(', ')}` : null

  const assisted = CHANNEL_MODE[step.channel] === 'assisted'
  const status = assisted || ctx.reviewEmail || note ? 'awaiting_user' : 'queued'
  return { kind: 'draft', status, subject: subject?.text ?? null, body: body.text, note }
}

type DueRow = {
  id: string
  workspace_id: string
  sequence_id: string
  contact_id: string
  current_step: number
  sequence: { review_email: boolean; mailbox_id: string | null; workspace: { sender_name: string | null } | null }
  contact: {
    name: string | null
    first_name: string | null
    last_name: string | null
    company: string | null
    role_title: string | null
    email: string | null
    email_status: VerifyStatus
    channels: { channel: Channel; handle: string }[]
  }
}

export async function draftDue(db: SupabaseClient, limit = 200): Promise<{ drafted: number; skipped: number; stopped: number }> {
  const counts = { drafted: 0, skipped: 0, stopped: 0 }

  const { data, error } = await db
    .from('enrollments')
    .select(`
      id, workspace_id, sequence_id, contact_id, current_step,
      sequence:sequences!inner ( review_email, mailbox_id, status, workspace:workspaces ( sender_name ) ),
      contact:contacts ( name, first_name, last_name, company, role_title, email, email_status,
                         channels:contact_channels ( channel, handle ) )
    `)
    .eq('state', 'active')
    .eq('sequence.status', 'active')
    .lte('next_action_at', new Date().toISOString())
    .order('next_action_at', { ascending: true })
    .limit(limit)
  if (error) throw new Error(`due enrollments: ${error.message}`)

  for (const row of (data ?? []) as unknown as DueRow[]) {
    const { data: step } = await db
      .from('sequence_steps')
      .select('id, channel, subject, body')
      .eq('sequence_id', row.sequence_id)
      .eq('position', row.current_step)
      .maybeSingle()

    const channel = (step?.channel ?? 'email') as Channel
    const override = row.contact.channels.find((c) => c.channel === channel)?.handle ?? null
    const handle = override ?? (channel === 'email' ? row.contact.email : null)

    const { data: suppressed } = step
      ? await db.rpc('is_suppressed', { p_workspace: row.workspace_id, p_channel: channel, p_contact: row.contact_id })
      : { data: false }

    const decision = decideDraft({
      step: step ? { channel, subject: step.subject, body: step.body } : null,
      handle,
      suppressed: Boolean(suppressed),
      emailStatus: row.contact.email_status,
      reviewEmail: row.sequence.review_email,
      values: valuesFor(row.contact, row.sequence.workspace?.sender_name ?? null),
    })

    switch (decision.kind) {
      case 'advance':
        await db.rpc('advance_enrollment', { p_enrollment: row.id })
        break
      case 'stop':
        await db.rpc('stop_enrollment', { p_enrollment: row.id, p_reason: decision.reason })
        counts.stopped++
        break
      case 'skip':
        await db.from('messages').upsert(
          {
            workspace_id: row.workspace_id,
            enrollment_id: row.id,
            contact_id: row.contact_id,
            step_id: step!.id,
            channel,
            status: 'skipped',
            failed_reason: decision.reason,
            scheduled_for: new Date().toISOString(),
          },
          { onConflict: 'enrollment_id,step_id', ignoreDuplicates: true },
        )
        await db.rpc('advance_enrollment', { p_enrollment: row.id })
        counts.skipped++
        break
      case 'draft': {
        const { error: insertError } = await db.from('messages').upsert(
          {
            workspace_id: row.workspace_id,
            enrollment_id: row.id,
            contact_id: row.contact_id,
            step_id: step!.id,
            mailbox_id: channel === 'email' ? row.sequence.mailbox_id : null,
            channel,
            status: decision.status,
            subject_rendered: decision.subject,
            body_rendered: decision.body,
            note: decision.note,
            scheduled_for: new Date().toISOString(),
          },
          { onConflict: 'enrollment_id,step_id', ignoreDuplicates: true },
        )
        if (insertError) throw new Error(`draft message: ${insertError.message}`)
        // Waiting on this message now. Guarded on current_step in case the
        // enrollment moved on in the meantime.
        await db
          .from('enrollments')
          .update({ next_action_at: null })
          .eq('id', row.id)
          .eq('current_step', row.current_step)
          .eq('state', 'active')
        counts.drafted++
        break
      }
    }
  }
  return counts
}
