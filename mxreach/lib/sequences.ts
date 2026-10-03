import type { SupabaseClient } from '@supabase/supabase-js'
import { validateStep } from '@/lib/templates'

/** Everything that stops a sequence from going live, one line each. */
export async function activationProblems(supabase: SupabaseClient, sequenceId: string): Promise<string[]> {
  const [{ data: seq }, { data: steps }] = await Promise.all([
    supabase.from('sequences').select('mailbox_id, mailbox:mailboxes ( status )').eq('id', sequenceId).single(),
    supabase.from('sequence_steps').select('position, channel, subject, body').eq('sequence_id', sequenceId).order('position'),
  ])
  const problems: string[] = []
  if (!steps?.length) return ['Add at least one step.']
  for (const s of steps) problems.push(...validateStep(s))

  const firstEmail = steps.find((s) => s.channel === 'email')
  if (firstEmail && !firstEmail.subject?.trim()) problems.push(`Step ${firstEmail.position}: the first email needs a subject`)
  const mailbox = seq?.mailbox as unknown as { status: string } | null
  if (firstEmail && !seq?.mailbox_id) problems.push('Pick the mailbox this sequence sends from')
  else if (firstEmail && mailbox?.status !== 'active') problems.push('The chosen mailbox needs reconnecting')
  return problems
}

