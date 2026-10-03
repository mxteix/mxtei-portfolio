import type { SupabaseClient } from '@supabase/supabase-js'
import { Mailboxes } from '@/lib/engine/mailbox'
import { classifyThread, getThread, MailboxAuthError } from '@/lib/mail/gmail'

/**
 * Stop-on-reply. For each active enrollment with sent email, read the
 * thread's headers (never bodies) and stop the sequence the moment the
 * contact replies. A bounce suppresses the address everywhere.
 *
 * Replies on social channels can't be seen; Today has a "They replied"
 * button for those.
 */
export async function checkReplies(db: SupabaseClient, limit = 50): Promise<{ checked: number; replied: number; bounced: number }> {
  const counts = { checked: 0, replied: 0, bounced: 0 }
  const { data, error } = await db.rpc('reply_check_batch', { p_limit: limit })
  if (error) throw new Error(`reply batch: ${error.message}`)

  const mailboxes = new Mailboxes(db)
  type Row = { enrollment_id: string; mailbox_id: string | null; thread_id: string; sent: { id: string; provider_id: string }[] }

  for (const row of (data ?? []) as Row[]) {
    if (!row.mailbox_id) continue
    const mailbox = await mailboxes.get(row.mailbox_id)
    if (!mailbox || mailbox.status !== 'active') continue

    try {
      const messages = await getThread(await mailboxes.accessToken(mailbox.id), row.thread_id)
      counts.checked++
      const verdict = classifyThread(messages, mailbox.email, new Set(row.sent.map((s) => s.provider_id)))

      if (verdict === 'replied') {
        await db.rpc('stop_enrollment', { p_enrollment: row.enrollment_id, p_reason: 'replied' })
        counts.replied++
      } else if (verdict === 'bounced') {
        await db.rpc('record_bounce', { p_message: row.sent.at(-1)!.id })
        counts.bounced++
      }
    } catch (e) {
      if (e instanceof MailboxAuthError) await mailboxes.markError(mailbox.id, e.message)
      // Anything else: try again next tick. The batch rotates by last check.
    }
  }
  return counts
}
