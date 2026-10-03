import type { SupabaseClient } from '@supabase/supabase-js'
import { draftDue } from '@/lib/engine/draft'
import { checkReplies } from '@/lib/engine/replies'
import { sendDue } from '@/lib/engine/send'

/**
 * One pass of the worker. Replies first, so nobody gets a follow-up after
 * they've answered; then drafting; then sending.
 */
export async function tick(db: SupabaseClient) {
  const replies = await checkReplies(db)
  const drafts = await draftDue(db)
  const sends = await sendDue(db)
  return { replies, drafts, sends }
}
