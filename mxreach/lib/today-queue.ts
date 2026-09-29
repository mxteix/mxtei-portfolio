/**
 * Today queue — data layer.
 *
 * Everything here runs server-side against the user's Supabase session,
 * so RLS is the tenancy boundary. No workspace_id filtering in app code:
 * if a policy is wrong, the query returns nothing rather than someone
 * else's contacts.
 */

import { createServerClient } from '@/lib/supabase/server'
import type { Channel } from '@/lib/channels'

export type QueueItem = {
  id: string
  channel: Channel
  subject: string | null
  body: string
  scheduledFor: string | null
  handle: string | null
  contact: {
    id: string
    name: string | null
    email: string | null
    company: string | null
    roleTitle: string | null
  }
  sequence: { id: string; name: string } | null
  stepPosition: number | null
}

/**
 * Messages drafted and waiting for a human to send.
 *
 * Ordered by scheduled_for so the queue drains in the order the
 * sequencer intended — oldest first, not newest.
 */
export async function getTodayQueue(workspaceId: string): Promise<QueueItem[]> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('messages')
    .select(`
      id,
      channel,
      subject_rendered,
      body_rendered,
      scheduled_for,
      contact:contacts (
        id, name, email, company, role_title,
        channels:contact_channels ( channel, handle )
      ),
      enrollment:enrollments (
        id,
        sequence:sequences ( id, name )
      ),
      step:sequence_steps ( position )
    `)
    .eq('workspace_id', workspaceId)
    .eq('status', 'awaiting_user')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(200)

  if (error) throw new Error(`today queue: ${error.message}`)
  if (!data) return []

  return data.map((row: any): QueueItem => {
    const match = (row.contact?.channels ?? []).find(
      (c: any) => c.channel === row.channel,
    )

    return {
      id: row.id,
      channel: row.channel,
      subject: row.subject_rendered,
      body: row.body_rendered ?? '',
      scheduledFor: row.scheduled_for,
      handle: match?.handle ?? row.contact?.email ?? null,
      contact: {
        id: row.contact?.id,
        name: row.contact?.name ?? null,
        email: row.contact?.email ?? null,
        company: row.contact?.company ?? null,
        roleTitle: row.contact?.role_title ?? null,
      },
      sequence: row.enrollment?.sequence
        ? { id: row.enrollment.sequence.id, name: row.enrollment.sequence.name }
        : null,
      stepPosition: row.step?.position ?? null,
    }
  })
}

/**
 * Mark an assisted message as sent and advance its enrollment.
 *
 * We can't verify the send on assisted channels — the user tells us.
 * That's an accepted limitation of the model, and it's why the button
 * says "Sent" rather than "Send".
 *
 * Suppression is re-checked here, not just at queue time. A contact can
 * unsubscribe between the draft being queued and the user clicking send.
 */
export async function markSent(messageId: string): Promise<void> {
  const supabase = createServerClient()

  const { data: msg, error: loadError } = await supabase
    .from('messages')
    .select('id, workspace_id, channel, enrollment_id, contact_id, status')
    .eq('id', messageId)
    .single()

  if (loadError) throw new Error(`load message: ${loadError.message}`)
  if (msg.status !== 'awaiting_user') {
    // Double-click, or another tab got here first. Not an error.
    return
  }

  if (await isSuppressed(msg.workspace_id, msg.channel, msg.contact_id)) {
    await supabase
      .from('messages')
      .update({ status: 'skipped', failed_reason: 'suppressed before send' })
      .eq('id', messageId)
    await stopEnrollment(msg.enrollment_id, 'unsubscribed')
    return
  }

  const { data: updated, error } = await supabase
    .from('messages')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('status', 'awaiting_user')   // optimistic lock
    .select('id')

  if (error) throw new Error(`mark sent: ${error.message}`)
  // Lost the race to another click: the winner advances, or we'd skip a step.
  if (!updated?.length) return

  if (msg.enrollment_id) await advanceEnrollment(msg.enrollment_id)
  await audit(msg.workspace_id, 'message.sent_manually', 'message', messageId)
}

/** Skip this step without stopping the sequence. */
export async function skipMessage(messageId: string, reason = 'skipped by user') {
  const supabase = createServerClient()

  const { data: msg, error } = await supabase
    .from('messages')
    .update({ status: 'skipped', failed_reason: reason })
    .eq('id', messageId)
    .eq('status', 'awaiting_user')
    .select('workspace_id, enrollment_id')
    .maybeSingle()

  if (error) throw new Error(`skip: ${error.message}`)
  // Already sent or skipped elsewhere. Same as markSent: not an error.
  if (!msg) return

  if (msg.enrollment_id) await advanceEnrollment(msg.enrollment_id)
  await audit(msg.workspace_id, 'message.skipped', 'message', messageId)
}

/** Push a draft back by N hours — "not today". */
export async function snoozeMessage(messageId: string, hours = 24) {
  const supabase = createServerClient()
  const when = new Date(Date.now() + hours * 3600_000).toISOString()

  const { error } = await supabase
    .from('messages')
    .update({ scheduled_for: when })
    .eq('id', messageId)
    .eq('status', 'awaiting_user')

  if (error) throw new Error(`snooze: ${error.message}`)
}

/** Edit the draft before sending. Users will do this constantly. */
export async function updateDraft(
  messageId: string,
  patch: { subject?: string | null; body?: string },
) {
  const supabase = createServerClient()

  const { error } = await supabase
    .from('messages')
    .update({
      ...(patch.subject !== undefined ? { subject_rendered: patch.subject } : {}),
      ...(patch.body !== undefined ? { body_rendered: patch.body } : {}),
    })
    .eq('id', messageId)
    .eq('status', 'awaiting_user')

  if (error) throw new Error(`update draft: ${error.message}`)
}

/**
 * Stop the whole enrollment — reply detected, unsubscribe, manual halt.
 * Also cancels any queued messages further down the sequence, which is
 * the bit that's easy to forget and embarrassing when you do.
 */
export async function stopEnrollment(
  enrollmentId: string | null,
  reason: 'replied' | 'unsubscribed' | 'bounced' | 'manual',
) {
  if (!enrollmentId) return
  const supabase = createServerClient()

  await supabase
    .from('enrollments')
    .update({
      state: 'stopped',
      stopped_reason: reason,
      stopped_at: new Date().toISOString(),
      next_action_at: null,
    })
    .eq('id', enrollmentId)

  await supabase
    .from('messages')
    .update({ status: 'skipped', failed_reason: `enrollment stopped: ${reason}` })
    .eq('enrollment_id', enrollmentId)
    .in('status', ['queued', 'awaiting_user'])
}

// ── internals ────────────────────────────────────────────────

async function advanceEnrollment(enrollmentId: string) {
  const supabase = createServerClient()

  const { data: enr } = await supabase
    .from('enrollments')
    .select('id, sequence_id, current_step')
    .eq('id', enrollmentId)
    .single()

  if (!enr) return

  const { data: next } = await supabase
    .from('sequence_steps')
    .select('position, delay_hours')
    .eq('sequence_id', enr.sequence_id)
    .gt('position', enr.current_step)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!next) {
    await supabase
      .from('enrollments')
      .update({
        state: 'completed',
        stopped_reason: 'completed',
        stopped_at: new Date().toISOString(),
        next_action_at: null,
      })
      .eq('id', enrollmentId)
    return
  }

  await supabase
    .from('enrollments')
    .update({
      current_step: next.position,
      next_action_at: new Date(Date.now() + next.delay_hours * 3600_000).toISOString(),
    })
    .eq('id', enrollmentId)
}

async function isSuppressed(
  workspaceId: string,
  channel: string,
  contactId: string,
): Promise<boolean> {
  const supabase = createServerClient()

  const { data: ch } = await supabase
    .from('contact_channels')
    .select('handle')
    .eq('contact_id', contactId)
    .eq('channel', channel)
    .maybeSingle()

  // Same fallback as the queue: email often lives only on contacts.email.
  let handle: string | null = ch?.handle ?? null
  if (!handle && channel === 'email') {
    const { data: c } = await supabase
      .from('contacts')
      .select('email')
      .eq('id', contactId)
      .maybeSingle()
    handle = c?.email ?? null
  }

  if (!handle) return false
  if (channel === 'email') handle = handle.trim().toLowerCase()

  // Both scopes: workspace-level and global.
  const { data } = await supabase
    .from('suppressions')
    .select('id')
    .eq('channel', channel)
    .eq('handle', handle)
    .or(`workspace_id.eq.${workspaceId},workspace_id.is.null`)
    .limit(1)

  return (data?.length ?? 0) > 0
}

async function audit(
  workspaceId: string,
  action: string,
  entity: string,
  entityId: string,
) {
  const supabase = createServerClient()
  await supabase.from('audit_log').insert({
    workspace_id: workspaceId,
    action,
    entity,
    entity_id: entityId,
  })
}
