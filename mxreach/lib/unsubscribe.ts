import { sign, signatureMatches } from '@/lib/crypto'

/**
 * Unsubscribe tokens: <workspace>.<contact>.<hmac>. Signed rather than
 * random-and-stored, so every email can carry one without a table, and a
 * recipient can't unsubscribe anyone but themselves.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function unsubscribeToken(workspaceId: string, contactId: string, secret: string): string {
  const payload = `${workspaceId}.${contactId}`
  return `${payload}.${sign(`unsub:${payload}`, secret)}`
}

export function readUnsubscribeToken(
  token: string,
  secret: string,
): { workspaceId: string; contactId: string } | null {
  const [workspaceId, contactId, sig] = token.split('.')
  if (!workspaceId || !contactId || !sig) return null
  if (!UUID.test(workspaceId) || !UUID.test(contactId)) return null
  if (!signatureMatches(`unsub:${workspaceId}.${contactId}`, sig, secret)) return null
  return { workspaceId, contactId }
}
