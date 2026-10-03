import { beforeEach, describe, expect, it } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { asService, asUser, createUser, freshDb, one } from './harness'

const ALICE = '00000000-0000-0000-0000-00000000000a'
const BOB = '00000000-0000-0000-0000-00000000000b'

let db: PGlite
let aliceWs: string
let bobWs: string

async function workspaceFor(user: string) {
  return asUser(db, user, async (tx) => (await one<{ ws: string }>(tx, 'select public.ensure_workspace() as ws')).ws)
}

/** A contact, a two-step sequence (email now, email +48h) and an enrollment. */
async function seedSequence(user: string, ws: string, opts: { status?: string } = {}) {
  return asUser(db, user, async (tx) => {
    const contact = await one<{ id: string }>(
      tx,
      `insert into contacts (workspace_id, first_name, email, email_status)
       values ($1, 'Sam', 'sam@example.com', 'valid') returning id`,
      [ws],
    )
    const seq = await one<{ id: string }>(
      tx,
      `insert into sequences (workspace_id, name, status) values ($1, 'Test', $2) returning id`,
      [ws, opts.status ?? 'active'],
    )
    await tx.query(
      `insert into sequence_steps (workspace_id, sequence_id, position, channel, delay_hours, subject, body)
       values ($1, $2, 1, 'email', 0, 'Hi', 'one'), ($1, $2, 2, 'email', 48, '', 'two')`,
      [ws, seq.id],
    )
    const added = await one<{ n: number }>(tx, 'select public.enroll_contacts($1, $2) as n', [seq.id, [contact.id]])
    expect(added.n).toBe(1)
    const enr = await one<{ id: string }>(tx, 'select id from enrollments where sequence_id = $1', [seq.id])
    return { contactId: contact.id, sequenceId: seq.id, enrollmentId: enr.id }
  })
}

/** Draft the current step as an awaiting message, as the worker would. */
async function draftCurrentStep(ws: string, enrollmentId: string, status = 'awaiting_user') {
  return asService(db, async (tx) => {
    const e = await one<{ contact_id: string; sequence_id: string; current_step: number }>(
      tx,
      'select contact_id, sequence_id, current_step from enrollments where id = $1',
      [enrollmentId],
    )
    const step = await one<{ id: string; channel: string }>(
      tx,
      'select id, channel from sequence_steps where sequence_id = $1 and position = $2',
      [e.sequence_id, e.current_step],
    )
    const msg = await one<{ id: string }>(
      tx,
      `insert into messages (workspace_id, enrollment_id, contact_id, step_id, channel, status, body_rendered, scheduled_for)
       values ($1, $2, $3, $4, $5, $6, 'x', now()) returning id`,
      [ws, enrollmentId, e.contact_id, step.id, step.channel, status],
    )
    await tx.query('update enrollments set next_action_at = null where id = $1', [enrollmentId])
    return msg.id
  })
}

async function enrollment(id: string) {
  return one<{ state: string; current_step: number; next_action_at: string | null; stopped_reason: string | null }>(
    db,
    'select state, current_step, next_action_at, stopped_reason from enrollments where id = $1',
    [id],
  )
}

beforeEach(async () => {
  db = await freshDb()
  await createUser(db, ALICE, 'alice@example.com')
  await createUser(db, BOB, 'bob@example.com')
  aliceWs = await workspaceFor(ALICE)
  bobWs = await workspaceFor(BOB)
})

describe('workspaces', () => {
  it('ensure_workspace creates one workspace per user and is idempotent', async () => {
    expect(await workspaceFor(ALICE)).toBe(aliceWs)
    expect(aliceWs).not.toBe(bobWs)
    const ws = await one<{ name: string }>(db, 'select name from workspaces where id = $1', [aliceWs])
    expect(ws.name).toBe('alice')
  })

  it('presets are seeded and readable', async () => {
    const rows = await asUser(db, ALICE, (tx) => tx.query<{ id: string }>('select id from presets order by sort'))
    expect(rows.rows.map((r) => r.id)).toEqual([
      'video-creators', 'music-artists', 'startup-founders', 'community-owners',
    ])
  })
})

describe('tenant isolation', () => {
  it("a user can't see or touch another workspace's rows", async () => {
    const a = await seedSequence(ALICE, aliceWs)

    await asUser(db, BOB, async (tx) => {
      expect((await tx.query('select * from contacts')).rows).toHaveLength(0)
      expect((await tx.query('select * from enrollments')).rows).toHaveLength(0)
      expect((await tx.query('select * from workspaces')).rows).toHaveLength(1)

      const upd = await tx.query(`update contacts set name = 'pwned' where id = $1`, [a.contactId])
      expect(upd.affectedRows).toBe(0)
    })

    await expect(
      asUser(db, BOB, (tx) =>
        tx.query(`insert into contacts (workspace_id, email) values ($1, 'x@example.com')`, [aliceWs]),
      ),
    ).rejects.toThrow(/row-level security/)
  })

  it("can't point a row at another workspace's contact", async () => {
    const a = await seedSequence(ALICE, aliceWs)
    const b = await seedSequence(BOB, bobWs)

    // Bob's own sequence, Alice's contact: the composite foreign key refuses it.
    await expect(
      asUser(db, BOB, (tx) =>
        tx.query(
          `insert into enrollments (workspace_id, sequence_id, contact_id, current_step) values ($1, $2, $3, 1)`,
          [bobWs, b.sequenceId, a.contactId],
        ),
      ),
    ).rejects.toThrow(/foreign key/)

    // enroll_contacts silently ignores contacts from other workspaces.
    const n = await asUser(db, BOB, async (tx) =>
      (await one<{ n: number }>(tx, 'select public.enroll_contacts($1, $2) as n', [b.sequenceId, [a.contactId]])).n,
    )
    expect(n).toBe(0)
  })

  it('secrets and the shared cache are closed to signed-in users', async () => {
    await expect(asUser(db, ALICE, (tx) => tx.query('select * from mailbox_secrets'))).rejects.toThrow(/permission denied/)
    await expect(asUser(db, ALICE, (tx) => tx.query('select * from finder_cache'))).rejects.toThrow(/permission denied/)
  })

  it('worker functions are closed to signed-in users', async () => {
    await expect(asUser(db, ALICE, (tx) => tx.query('select * from public.claim_email_sends(1)'))).rejects.toThrow(
      /permission denied/,
    )
    await expect(
      asUser(db, ALICE, (tx) => tx.query(`select public.forget_email('a@b.com')`)),
    ).rejects.toThrow(/permission denied/)
  })

  it('global suppressions stay hidden but still count', async () => {
    const a = await seedSequence(ALICE, aliceWs)
    await asService(db, (tx) =>
      tx.query(`insert into suppressions (workspace_id, channel, handle, reason) values (null, 'email', 'sam@example.com', 'bounced')`),
    )
    await asUser(db, ALICE, async (tx) => {
      expect((await tx.query('select * from suppressions')).rows).toHaveLength(0)
      const s = await one<{ s: boolean }>(tx, 'select public.is_suppressed($1, $2, $3) as s', [aliceWs, 'email', a.contactId])
      expect(s.s).toBe(true)
    })
    // Bob asking about Alice's workspace learns nothing.
    const probe = await asUser(db, BOB, async (tx) =>
      (await one<{ s: boolean }>(tx, 'select public.is_suppressed($1, $2, $3) as s', [aliceWs, 'email', a.contactId])).s,
    )
    expect(probe).toBe(false)
  })
})

describe('sequence state machine', () => {
  it('enrolls at the first step, due now', async () => {
    const a = await seedSequence(ALICE, aliceWs)
    const e = await enrollment(a.enrollmentId)
    expect(e.state).toBe('active')
    expect(e.current_step).toBe(1)
    expect(e.next_action_at).not.toBeNull()
  })

  it('mark sent advances once, even when clicked twice', async () => {
    const a = await seedSequence(ALICE, aliceWs)
    const msg = await draftCurrentStep(aliceWs, a.enrollmentId)

    const first = await asUser(db, ALICE, async (tx) => (await one<{ r: string }>(tx, 'select public.mark_message_sent($1) as r', [msg])).r)
    const second = await asUser(db, ALICE, async (tx) => (await one<{ r: string }>(tx, 'select public.mark_message_sent($1) as r', [msg])).r)
    expect(first).toBe('sent')
    expect(second).toBe('already_handled')

    const e = await enrollment(a.enrollmentId)
    expect(e.current_step).toBe(2) // not 3, and not completed
    expect(e.state).toBe('active')

    const hours = await one<{ h: number }>(
      db,
      `select round(extract(epoch from next_action_at - now()) / 3600) as h from enrollments where id = $1`,
      [a.enrollmentId],
    )
    expect(Number(hours.h)).toBe(48)
  })

  it('completes after the last step', async () => {
    const a = await seedSequence(ALICE, aliceWs)
    for (let i = 0; i < 2; i++) {
      const msg = await draftCurrentStep(aliceWs, a.enrollmentId)
      await asUser(db, ALICE, (tx) => tx.query('select public.mark_message_sent($1)', [msg]))
    }
    const e = await enrollment(a.enrollmentId)
    expect(e.state).toBe('completed')
    expect(e.next_action_at).toBeNull()
  })

  it('skip moves on without stopping', async () => {
    const a = await seedSequence(ALICE, aliceWs)
    const msg = await draftCurrentStep(aliceWs, a.enrollmentId)
    const r = await asUser(db, ALICE, async (tx) => (await one<{ r: string }>(tx, 'select public.skip_message($1) as r', [msg])).r)
    expect(r).toBe('skipped')
    expect((await enrollment(a.enrollmentId)).current_step).toBe(2)
  })

  it('a suppressed contact is caught at click time and the sequence stops', async () => {
    const a = await seedSequence(ALICE, aliceWs)
    const msg = await draftCurrentStep(aliceWs, a.enrollmentId)
    await asUser(db, ALICE, (tx) =>
      tx.query(`insert into suppressions (workspace_id, channel, handle, reason) values ($1, 'email', 'sam@example.com', 'unsubscribed')`, [aliceWs]),
    )
    const r = await asUser(db, ALICE, async (tx) => (await one<{ r: string }>(tx, 'select public.mark_message_sent($1) as r', [msg])).r)
    expect(r).toBe('suppressed')
    const e = await enrollment(a.enrollmentId)
    expect(e.state).toBe('stopped')
    expect(e.stopped_reason).toBe('unsubscribed')
  })

  it('suppression matches regardless of case', async () => {
    const a = await seedSequence(ALICE, aliceWs)
    await asUser(db, ALICE, (tx) =>
      tx.query(`insert into contact_channels (workspace_id, contact_id, channel, handle) values ($1, $2, 'instagram', 'SamMakesVideos')`, [aliceWs, a.contactId]),
    )
    await asUser(db, ALICE, (tx) =>
      tx.query(`insert into suppressions (workspace_id, channel, handle, reason) values ($1, 'instagram', 'sammakesvideos', 'manual')`, [aliceWs]),
    )
    const s = await asUser(db, ALICE, async (tx) =>
      (await one<{ s: boolean }>(tx, 'select public.is_suppressed($1, $2, $3) as s', [aliceWs, 'instagram', a.contactId])).s,
    )
    expect(s).toBe(true)
  })

  it('stopping cancels everything still waiting', async () => {
    const a = await seedSequence(ALICE, aliceWs)
    const msg = await draftCurrentStep(aliceWs, a.enrollmentId, 'queued')
    await asUser(db, ALICE, (tx) => tx.query(`select public.stop_enrollment($1, 'replied')`, [a.enrollmentId]))
    const m = await one<{ status: string }>(db, 'select status from messages where id = $1', [msg])
    expect(m.status).toBe('skipped')
    expect((await enrollment(a.enrollmentId)).stopped_reason).toBe('replied')
  })

  it("stopping doesn't overwrite a completed enrollment", async () => {
    const a = await seedSequence(ALICE, aliceWs)
    for (let i = 0; i < 2; i++) {
      const msg = await draftCurrentStep(aliceWs, a.enrollmentId)
      await asUser(db, ALICE, (tx) => tx.query('select public.mark_message_sent($1)', [msg]))
    }
    await asUser(db, ALICE, (tx) => tx.query(`select public.stop_enrollment($1, 'replied')`, [a.enrollmentId]))
    expect((await enrollment(a.enrollmentId)).state).toBe('completed')
  })

  it('drafting the same step twice is a no-op', async () => {
    const a = await seedSequence(ALICE, aliceWs)
    await draftCurrentStep(aliceWs, a.enrollmentId)
    await expect(draftCurrentStep(aliceWs, a.enrollmentId)).rejects.toThrow(/duplicate key/)
  })
})

describe('email sending (worker)', () => {
  it('sends at most one per mailbox per tick', async () => {
    const mailbox = await asService(db, async (tx) =>
      (await one<{ id: string }>(tx, `insert into mailboxes (workspace_id, provider, email) values ($1, 'gmail', 'a@x.com') returning id`, [aliceWs])).id,
    )
    const a = await seedSequence(ALICE, aliceWs)
    const second = await asUser(db, ALICE, async (tx) => {
      const c = await one<{ id: string }>(tx, `insert into contacts (workspace_id, email, email_status) values ($1, 'two@example.com', 'valid') returning id`, [aliceWs])
      const seq = await one<{ id: string }>(tx, 'select sequence_id as id from enrollments where id = $1', [a.enrollmentId])
      await tx.query('select public.enroll_contacts($1, $2)', [seq.id, [c.id]])
      return (await one<{ id: string }>(tx, 'select id from enrollments where contact_id = $1', [c.id])).id
    })
    await draftCurrentStep(aliceWs, a.enrollmentId, 'queued')
    await draftCurrentStep(aliceWs, second, 'queued')
    await db.query('update messages set mailbox_id = $1', [mailbox])

    const tick1 = await asService(db, (tx) => tx.query('select id from public.claim_email_sends(1)'))
    const tick2 = await asService(db, (tx) => tx.query('select id from public.claim_email_sends(1)'))
    expect(tick1.rows).toHaveLength(1)
    expect(tick2.rows).toHaveLength(1)
    const attempts = await db.query<{ attempts: number }>('select attempts from messages')
    expect(attempts.rows.every((r) => r.attempts === 1)).toBe(true)
  })

  it('a send cut off midway goes to the user, never retried blind', async () => {
    const a = await seedSequence(ALICE, aliceWs)
    const msg = await draftCurrentStep(aliceWs, a.enrollmentId, 'queued')
    await asService(db, (tx) => tx.query('select * from public.claim_email_sends(1)'))
    await db.query(`update messages set sending_at = now() - interval '1 hour' where id = $1`, [msg])
    const n = await asService(db, async (tx) => (await one<{ n: number }>(tx, 'select public.release_stale_sends(15) as n')).n)
    expect(n).toBe(1)
    const m = await one<{ status: string; note: string }>(db, 'select status, note from messages where id = $1', [msg])
    expect(m.status).toBe('awaiting_user')
    expect(m.note).toMatch(/Sent folder/)
  })

  it('reply_check_batch returns sent threads and rotates', async () => {
    const a = await seedSequence(ALICE, aliceWs)
    const msg = await draftCurrentStep(aliceWs, a.enrollmentId, 'queued')
    await asService(db, (tx) => tx.query('select * from public.claim_email_sends(1)'))
    await asService(db, (tx) => tx.query(`select public.finish_email_send($1, 'gm1', 'th1', '<x@mail>')`, [msg]))

    const batch = await asService(db, (tx) =>
      tx.query<{ enrollment_id: string; thread_id: string; sent: { id: string; provider_id: string }[] }>(
        'select * from public.reply_check_batch(10)',
      ),
    )
    expect(batch.rows).toHaveLength(1)
    expect(batch.rows[0].thread_id).toBe('th1')
    expect(batch.rows[0].sent).toEqual([{ id: msg, provider_id: 'gm1' }])
    const e = await one<{ replies_checked_at: string | null }>(db, 'select replies_checked_at from enrollments where id = $1', [a.enrollmentId])
    expect(e.replies_checked_at).not.toBeNull()
  })

  it('claims each queued email once and advances on finish', async () => {
    const a = await seedSequence(ALICE, aliceWs)
    const msg = await draftCurrentStep(aliceWs, a.enrollmentId, 'queued')

    const first = await asService(db, (tx) => tx.query<{ id: string }>('select id from public.claim_email_sends(1)'))
    const second = await asService(db, (tx) => tx.query<{ id: string }>('select id from public.claim_email_sends(1)'))
    expect(first.rows.map((r) => r.id)).toEqual([msg])
    expect(second.rows).toHaveLength(0)

    await asService(db, (tx) => tx.query(`select public.finish_email_send($1, 'gm1', 'th1', '<x@mail>')`, [msg]))
    await asService(db, (tx) => tx.query(`select public.finish_email_send($1, 'gm1', 'th1', '<x@mail>')`, [msg]))

    const m = await one<{ status: string; provider_thread_id: string }>(db, 'select status, provider_thread_id from messages where id = $1', [msg])
    expect(m).toEqual({ status: 'sent', provider_thread_id: 'th1' })
    expect((await enrollment(a.enrollmentId)).current_step).toBe(2)
  })

  it('review mode: approving queues the email for the worker', async () => {
    const a = await seedSequence(ALICE, aliceWs)
    const msg = await draftCurrentStep(aliceWs, a.enrollmentId)
    const r = await asUser(db, ALICE, async (tx) => (await one<{ r: string }>(tx, 'select public.approve_email($1) as r', [msg])).r)
    expect(r).toBe('queued')
    const claimed = await asService(db, (tx) => tx.query<{ id: string }>('select id from public.claim_email_sends(1)'))
    expect(claimed.rows.map((x) => x.id)).toEqual([msg])
  })

  it('unsubscribe suppresses the address and stops every sequence', async () => {
    const a = await seedSequence(ALICE, aliceWs)
    await draftCurrentStep(aliceWs, a.enrollmentId, 'queued')
    await asService(db, (tx) => tx.query('select public.unsubscribe_contact($1, $2)', [aliceWs, a.contactId]))

    const e = await enrollment(a.enrollmentId)
    expect(e.stopped_reason).toBe('unsubscribed')
    const s = await one<{ n: number }>(db, `select count(*)::int as n from suppressions where handle = 'sam@example.com' and workspace_id = $1`, [aliceWs])
    expect(s.n).toBe(1)
  })

  it('a bounce suppresses globally and marks the address invalid everywhere', async () => {
    const a = await seedSequence(ALICE, aliceWs)
    const b = await seedSequence(BOB, bobWs) // Bob has the same address
    const msg = await draftCurrentStep(aliceWs, a.enrollmentId, 'queued')
    await asService(db, (tx) => tx.query('select * from public.claim_email_sends(1)'))
    await asService(db, (tx) => tx.query(`select public.finish_email_send($1, 'gm1', 'th1', '<x@mail>')`, [msg]))
    await asService(db, (tx) => tx.query('select public.record_bounce($1)', [msg]))

    expect((await enrollment(a.enrollmentId)).stopped_reason).toBe('bounced')
    const bob = await one<{ email_status: string }>(db, 'select email_status from contacts where id = $1', [b.contactId])
    expect(bob.email_status).toBe('invalid')
    const s = await asUser(db, BOB, async (tx) =>
      (await one<{ s: boolean }>(tx, 'select public.is_suppressed($1, $2, $3) as s', [bobWs, 'email', b.contactId])).s,
    )
    expect(s).toBe(true)
  })

  it('forget_email empties the cache and blocks the address', async () => {
    await asService(db, (tx) =>
      tx.query(`insert into finder_cache (key, email, source) values ('k', 'sam@example.com', 'public_page')`),
    )
    await asService(db, (tx) => tx.query(`select public.forget_email('Sam@Example.com ')`))
    expect((await db.query('select * from finder_cache')).rows).toHaveLength(0)
    expect((await db.query(`select * from suppressions where workspace_id is null and reason = 'erased'`)).rows).toHaveLength(1)
  })

  it('pausing holds emails that were already queued', async () => {
    const a = await seedSequence(ALICE, aliceWs)
    await draftCurrentStep(aliceWs, a.enrollmentId, 'queued')
    await asUser(db, ALICE, (tx) => tx.query(`update sequences set status = 'paused' where id = $1`, [a.sequenceId]))
    const paused = await asService(db, (tx) => tx.query('select id from public.claim_email_sends(1)'))
    expect(paused.rows).toHaveLength(0)
    await asUser(db, ALICE, (tx) => tx.query(`update sequences set status = 'active' where id = $1`, [a.sequenceId]))
    const resumed = await asService(db, (tx) => tx.query('select id from public.claim_email_sends(1)'))
    expect(resumed.rows).toHaveLength(1)
  })

  it('paused sequences keep their state', async () => {
    const a = await seedSequence(ALICE, aliceWs, { status: 'paused' })
    expect((await enrollment(a.enrollmentId)).state).toBe('active')
  })
})
