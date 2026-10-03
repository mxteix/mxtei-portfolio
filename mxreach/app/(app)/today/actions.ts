'use server'

import { revalidatePath } from 'next/cache'
import {
  approveEmail,
  markSent,
  skipMessage,
  snoozeMessage,
  stopEnrollment,
  updateDraft,
} from '@/lib/today-queue'

/** Each returns a short message for the card, or null when nothing to say. */

export async function sentAction(id: string): Promise<string | null> {
  const result = await markSent(id)
  revalidatePath('/today', 'layout')
  if (result === 'suppressed') return 'They unsubscribed in the meantime, so this was skipped and the sequence stopped.'
  return null
}

export async function approveAction(id: string) {
  await approveEmail(id)
  revalidatePath('/today', 'layout')
  return null
}

export async function skipAction(id: string) {
  await skipMessage(id)
  revalidatePath('/today', 'layout')
  return null
}

export async function snoozeAction(id: string) {
  await snoozeMessage(id, 24)
  revalidatePath('/today', 'layout')
  return null
}

export async function repliedAction(enrollmentId: string) {
  await stopEnrollment(enrollmentId, 'replied')
  revalidatePath('/today', 'layout')
  return null
}

export async function saveDraftAction(id: string, subject: string | null, body: string) {
  await updateDraft(id, { subject, body })
  revalidatePath('/today')
  return 'Saved.'
}
