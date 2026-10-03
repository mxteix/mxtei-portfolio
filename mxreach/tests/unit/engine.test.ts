import { describe, expect, it } from 'vitest'
import { clipboardPayload, conversationUrl } from '@/lib/channels'
import { decrypt, encrypt } from '@/lib/crypto'
import { decideDraft, type DraftContext } from '@/lib/engine/draft'
import { decideSend, type SendContext } from '@/lib/engine/send'
import { readUnsubscribeToken, unsubscribeToken } from '@/lib/unsubscribe'

const WS = '11111111-1111-1111-1111-111111111111'
const C = '22222222-2222-2222-2222-222222222222'

describe('decideDraft', () => {
  const base: DraftContext = {
    step: { channel: 'email', subject: 'Hi {{first_name}}', body: 'Hello {{first_name|there}}' },
    handle: 'sam@example.com',
    suppressed: false,
    emailStatus: 'valid',
    reviewEmail: false,
    values: { first_name: 'Sam' },
  }

  it('queues a verified email to send on its own', () => {
    expect(decideDraft(base)).toEqual({ kind: 'draft', status: 'queued', subject: 'Hi Sam', body: 'Hello Sam', note: null })
  })

  it('holds email for review when the sequence asks for it', () => {
    expect(decideDraft({ ...base, reviewEmail: true })).toMatchObject({ status: 'awaiting_user' })
  })

  it('sends social steps to Today, never automatically', () => {
    for (const channel of ['discord', 'instagram', 'linkedin'] as const) {
      expect(decideDraft({ ...base, step: { ...base.step!, channel }, handle: 'sam' })).toMatchObject({ status: 'awaiting_user' })
    }
  })

  it('holds an email with a missing variable for the user to fill in', () => {
    const d = decideDraft({ ...base, values: {} })
    expect(d).toMatchObject({ kind: 'draft', status: 'awaiting_user', note: 'Fill in before sending: first_name' })
  })

  it('skips unverified email, missing handles; stops on suppression', () => {
    expect(decideDraft({ ...base, emailStatus: 'unknown' })).toMatchObject({ kind: 'skip' })
    expect(decideDraft({ ...base, emailStatus: 'risky' })).toMatchObject({ kind: 'skip' })
    expect(decideDraft({ ...base, handle: null })).toMatchObject({ kind: 'skip' })
    expect(decideDraft({ ...base, suppressed: true })).toEqual({ kind: 'stop', reason: 'unsubscribed' })
    expect(decideDraft({ ...base, step: null })).toMatchObject({ kind: 'advance' })
  })
})

describe('decideSend', () => {
  const base: SendContext = {
    mailbox: { status: 'active', sentLast24h: 3, dailyCap: 30 },
    senderAddress: '1 Main St, Budapest',
    suppressed: false,
    to: 'sam@example.com',
    emailStatus: 'valid',
    subject: 'Hi',
  }

  it('sends when everything is in place', () => {
    expect(decideSend(base)).toEqual({ kind: 'send' })
  })

  it('never sends to a suppressed contact', () => {
    expect(decideSend({ ...base, suppressed: true })).toMatchObject({ kind: 'skip', stop: 'unsubscribed' })
  })

  it('waits when the mailbox hit its daily cap', () => {
    expect(decideSend({ ...base, mailbox: { ...base.mailbox!, sentLast24h: 30 } })).toEqual({ kind: 'defer', minutes: 60 })
  })

  it('hands problems a person can fix back to Today', () => {
    expect(decideSend({ ...base, mailbox: null })).toMatchObject({ kind: 'to_user' })
    expect(decideSend({ ...base, mailbox: { ...base.mailbox!, status: 'error' } })).toMatchObject({ kind: 'to_user' })
    expect(decideSend({ ...base, senderAddress: ' ' })).toMatchObject({ kind: 'to_user', note: expect.stringMatching(/postal address/) })
    expect(decideSend({ ...base, subject: null })).toMatchObject({ kind: 'to_user' })
  })
})

describe('unsubscribe tokens', () => {
  it('round-trip and reject tampering', () => {
    const t = unsubscribeToken(WS, C, 'secret')
    expect(readUnsubscribeToken(t, 'secret')).toEqual({ workspaceId: WS, contactId: C })
    expect(readUnsubscribeToken(t, 'other-secret')).toBeNull()
    const other = '33333333-3333-3333-3333-333333333333'
    expect(readUnsubscribeToken(t.replace(C, other), 'secret')).toBeNull()
    expect(readUnsubscribeToken('garbage', 'secret')).toBeNull()
  })
})

describe('token encryption', () => {
  const key = Buffer.alloc(32, 7).toString('base64')
  it('round-trips and detects tampering', () => {
    const sealed = encrypt('1//refresh-token', key)
    expect(sealed.startsWith('v1.')).toBe(true)
    expect(decrypt(sealed, key)).toBe('1//refresh-token')
    const parts = sealed.split('.')
    parts[3] = Buffer.from('tampered').toString('base64url')
    expect(() => decrypt(parts.join('.'), key)).toThrow()
  })
  it('rejects a wrong-size key', () => {
    expect(() => encrypt('x', Buffer.alloc(16).toString('base64'))).toThrow(/32 bytes/)
  })
})

describe('channel handoff', () => {
  it('builds conversation links', () => {
    expect(conversationUrl('instagram', '@sam.makes')).toBe('https://ig.me/m/sam.makes')
    expect(conversationUrl('linkedin', 'sam-rivera')).toBe('https://www.linkedin.com/in/sam-rivera/')
    expect(conversationUrl('discord', '123456789012345678')).toBe('https://discord.com/users/123456789012345678')
    expect(conversationUrl('email', '')).toBeNull()
  })
  it('keeps the subject for email pastes only', () => {
    expect(clipboardPayload('email', 'Hi', 'Body')).toBe('Hi\n\nBody')
    expect(clipboardPayload('instagram', 'Hi', 'Body')).toBe('Body')
  })
})
