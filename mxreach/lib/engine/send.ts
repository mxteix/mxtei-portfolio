import type { SupabaseClient } from '@supabase/supabase-js'
import { appUrl, env } from '@/lib/env'
import { Mailboxes } from '@/lib/engine/mailbox'
import { SENDABLE, type VerifyStatus } from '@/lib/finder/types'
import { getMessage, MailboxAuthError, sendRaw } from '@/lib/mail/gmail'
import { buildEmail, replySubject, withFooter } from '@/lib/mail/mime'
import { unsubscribeToken } from '@/lib/unsubscribe'

/**
 * Sending: claim queued emails (one per mailbox per tick), run the last
 * checks, send from the customer's own Gmail, and record the thread so
 * follow-ups reply in it and replies can be spotted.
 *
 * Anything that needs a human (no mailbox, no postal address, mailbox needs
 * reconnecting, repeated failures) goes back to Today with a note rather than
 * failing silently or retrying forever.
 */

const MAX_ATTEMPTS = 3
const STALE_SEND_MINUTES = 15

type Claimed = {
  id: string
  workspace_id: string
  enrollment_id: string | null
  contact_id: string
  mailbox_id: string | null
  subject_rendered: string | null
  body_rendered: string | null
  attempts: number
}

export type SendContext = {
  mailbox: { status: string; sentLast24h: number; dailyCap: number } | null
  senderAddress: string | null
  suppressed: boolean
  to: string | null
  emailStatus: VerifyStatus
  subject: string | null
}

export type SendDecision =
  | { kind: 'send' }
  | { kind: 'to_user'; note: string }
  | { kind: 'defer'; minutes: number }
  | { kind: 'skip'; reason: string; stop?: 'unsubscribed' }

export function decideSend(ctx: SendContext): SendDecision {
  if (ctx.suppressed) return { kind: 'skip', reason: 'suppressed before send', stop: 'unsubscribed' }
  if (!ctx.to) return { kind: 'skip', reason: 'contact has no email address' }
  if (!SENDABLE.includes(ctx.emailStatus)) return { kind: 'skip', reason: `email not verified (${ctx.emailStatus})` }
  if (!ctx.mailbox) return { kind: 'to_user', note: 'No mailbox connected to this sequence. Connect one in Mailboxes, then approve.' }
  if (ctx.mailbox.status !== 'active') return { kind: 'to_user', note: 'The mailbox needs reconnecting. Reconnect it in Mailboxes, then approve.' }
  if (!ctx.senderAddress?.trim()) return { kind: 'to_user', note: 'Add your postal address in Settings. Every email has to include it.' }
  if (!ctx.subject?.trim()) return { kind: 'to_user', note: 'This email needs a subject.' }
  if (ctx.mailbox.sentLast24h >= ctx.mailbox.dailyCap) return { kind: 'defer', minutes: 60 }
  return { kind: 'send' }
}

export async function sendDue(db: SupabaseClient): Promise<{ sent: number; toUser: number; deferred: number; skipped: number; failed: number }> {
  const counts = { sent: 0, toUser: 0, deferred: 0, skipped: 0, failed: 0 }
  await db.rpc('release_stale_sends', { p_minutes: STALE_SEND_MINUTES })

  const { data: claimed, error } = await db.rpc('claim_email_sends', { p_per_mailbox: 1 })
  if (error) throw new Error(`claim sends: ${error.message}`)

  const mailboxes = new Mailboxes(db)
  const sentToday = new Map<string, number>()

  const toUser = async (id: string, note: string) => {
    await db.from('messages').update({ status: 'awaiting_user', note }).eq('id', id).eq('status', 'sending')
    counts.toUser++
  }

  for (const m of (claimed ?? []) as Claimed[]) {
    const [{ data: contact }, { data: override }, { data: ws }, { data: suppressed }] = await Promise.all([
      db.from('contacts').select('email, email_status').eq('id', m.contact_id).single(),
      db.from('contact_channels').select('handle').eq('contact_id', m.contact_id).eq('channel', 'email').maybeSingle(),
      db.from('workspaces').select('sender_name, sender_address').eq('id', m.workspace_id).single(),
      db.rpc('is_suppressed', { p_workspace: m.workspace_id, p_channel: 'email', p_contact: m.contact_id }),
    ])

    const mailbox = m.mailbox_id ? await mailboxes.get(m.mailbox_id) : null
    if (mailbox && !sentToday.has(mailbox.id)) {
      const { count } = await db
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('mailbox_id', mailbox.id)
        .eq('status', 'sent')
        .gte('sent_at', new Date(Date.now() - 86_400_000).toISOString())
      sentToday.set(mailbox.id, count ?? 0)
    }

    // Earlier emails in this enrollment: thread into them.
    const { data: earlier } = m.enrollment_id
      ? await db
          .from('messages')
          .select('subject_rendered, provider_thread_id, rfc_message_id')
          .eq('enrollment_id', m.enrollment_id)
          .eq('channel', 'email')
          .eq('status', 'sent')
          .order('sent_at', { ascending: true })
      : { data: [] }
    const thread = earlier ?? []
    const firstSubject = thread.find((t) => t.subject_rendered)?.subject_rendered ?? null
    const subject = m.subject_rendered?.trim() || (firstSubject ? replySubject(firstSubject) : null)
    const to = (override?.handle ?? contact?.email ?? null)?.trim().toLowerCase() ?? null

    const decision = decideSend({
      mailbox: mailbox ? { status: mailbox.status, sentLast24h: sentToday.get(mailbox.id) ?? 0, dailyCap: mailbox.daily_cap } : null,
      senderAddress: ws?.sender_address ?? null,
      suppressed: Boolean(suppressed),
      to,
      emailStatus: (contact?.email_status ?? 'unknown') as VerifyStatus,
      subject,
    })

    if (decision.kind === 'to_user') {
      await toUser(m.id, decision.note)
      continue
    }
    if (decision.kind === 'defer') {
      await db
        .from('messages')
        .update({ status: 'queued', attempts: m.attempts - 1, scheduled_for: new Date(Date.now() + decision.minutes * 60_000).toISOString() })
        .eq('id', m.id)
      counts.deferred++
      continue
    }
    if (decision.kind === 'skip') {
      await db.from('messages').update({ status: 'skipped', failed_reason: decision.reason }).eq('id', m.id)
      if (decision.stop) await db.rpc('stop_enrollment', { p_enrollment: m.enrollment_id, p_reason: decision.stop })
      else if (m.enrollment_id) await db.rpc('advance_enrollment', { p_enrollment: m.enrollment_id })
      counts.skipped++
      continue
    }

    const token = unsubscribeToken(m.workspace_id, m.contact_id, env('APP_SECRET'))
    const base = appUrl()
    const refs = thread.map((t) => t.rfc_message_id).filter((r): r is string => Boolean(r))
    const threadId = thread.map((t) => t.provider_thread_id).filter(Boolean).at(-1) ?? null

    try {
      const { raw, messageId } = buildEmail({
        from: { name: ws?.sender_name ?? null, email: mailbox!.email },
        to: to!,
        subject: subject!,
        text: withFooter(m.body_rendered ?? '', {
          senderName: ws?.sender_name ?? null,
          senderAddress: ws!.sender_address!,
          unsubscribeUrl: `${base}/u/${token}`,
        }),
        inReplyTo: refs.at(-1) ?? null,
        references: refs,
        unsubscribeUrl: `${base}/api/unsubscribe/${token}`,
      })

      const access = await mailboxes.accessToken(mailbox!.id)
      const sent = await sendRaw(access, raw, threadId)
      // Gmail may rewrite Message-ID; store the one it actually used.
      const actual = await getMessage(access, sent.id).catch(() => null)

      const { error: finishError } = await db.rpc('finish_email_send', {
        p_message: m.id,
        p_provider_id: sent.id,
        p_thread_id: sent.threadId,
        p_rfc_id: actual?.messageId || messageId,
      })
      if (finishError) throw new Error(`record send: ${finishError.message}`)
      sentToday.set(mailbox!.id, (sentToday.get(mailbox!.id) ?? 0) + 1)
      counts.sent++
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (e instanceof MailboxAuthError) {
        await mailboxes.markError(mailbox!.id, message)
        await toUser(m.id, 'The mailbox needs reconnecting. Reconnect it in Mailboxes, then approve.')
      } else if (m.attempts >= MAX_ATTEMPTS) {
        await toUser(m.id, `Sending failed ${m.attempts} times: ${message.slice(0, 200)}`)
        counts.failed++
      } else {
        await db
          .from('messages')
          .update({
            status: 'queued',
            failed_reason: message.slice(0, 500),
            scheduled_for: new Date(Date.now() + 30 * 60_000 * m.attempts).toISOString(),
          })
          .eq('id', m.id)
        counts.failed++
      }
    }
  }
  return counts
}
