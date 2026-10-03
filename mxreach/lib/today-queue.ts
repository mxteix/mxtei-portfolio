/**
 * Today queue — data layer.
 *
 * Everything here runs server-side against the user's Supabase session,
 * so RLS is the tenancy boundary. The workspace filter below only narrows to
 * the workspace being viewed; if a policy is wrong, the query returns
 * nothing rather than someone else's contacts.
 *
 * State changes go through SQL functions (see the migration) so each one is
 * a single transaction: a double click or a second tab can't advance a
 * sequence twice.
 */

import { createServerClient } from '@/lib/supabase/server'
import type { Channel } from '@/lib/channels'

export type QueueItem = {
  id: string
  channel: Channel
  subject: string | null
  body: string
  /** Why this needs a look, e.g. a template variable had no value. */
  note: string | null
  scheduledFor: string | null
  handle: string | null
  contact: {
    id: string
    name: string | null
    email: string | null
    company: string | null
    roleTitle: string | null
  }
  enrollmentId: string | null
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
      note,
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
      note: row.note ?? null,
      scheduledFor: row.scheduled_for,
      handle: match?.handle ?? row.contact?.email ?? null,
      contact: {
        id: row.contact?.id,
        name: row.contact?.name ?? null,
        email: row.contact?.email ?? null,
        company: row.contact?.company ?? null,
        roleTitle: row.contact?.role_title ?? null,
      },
      enrollmentId: row.enrollment?.id ?? null,
      sequence: row.enrollment?.sequence
        ? { id: row.enrollment.sequence.id, name: row.enrollment.sequence.name }
        : null,
      stepPosition: row.step?.position ?? null,
    }
  })
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<string> {
  const supabase = createServerClient()
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as string
}

/**
 * Mark an assisted message as sent and advance its enrollment.
 *
 * We can't verify the send on assisted channels — the user tells us.
 * That's an accepted limitation of the model, and it's why the button
 * says "Sent" rather than "Send".
 *
 * Suppression is re-checked in the same transaction, not just at queue time.
 * A contact can unsubscribe between the draft being queued and the user
 * clicking send. Returns 'sent', 'suppressed' or 'already_handled' (a
 * double-click, or another tab got here first — not an error).
 */
export async function markSent(messageId: string) {
  return rpc('mark_message_sent', { p_message: messageId }) as Promise<'sent' | 'suppressed' | 'already_handled'>
}

/** Skip this step without stopping the sequence. */
export async function skipMessage(messageId: string, reason = 'skipped by user') {
  return rpc('skip_message', { p_message: messageId, p_reason: reason })
}

/** Review mode: approve a drafted email so it sends from the connected mailbox. */
export async function approveEmail(messageId: string) {
  return rpc('approve_email', { p_message: messageId })
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
      // Editing is how a "fill in first_name" note gets resolved.
      note: null,
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
  await rpc('stop_enrollment', { p_enrollment: enrollmentId, p_reason: reason })
}
