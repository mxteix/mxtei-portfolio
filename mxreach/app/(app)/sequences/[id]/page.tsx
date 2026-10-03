import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ActionForm, Submit } from '@/components/action-form'
import { StatusPill } from '@/components/status-pill'
import { CHANNEL_LABEL, CHANNEL_MODE, type Channel } from '@/lib/channels'
import { activationProblems } from '@/lib/sequences'
import { getSession } from '@/lib/session'
import { TEMPLATE_VARS } from '@/lib/templates'
import {
  addStep,
  deleteSequence,
  deleteStep,
  enrollAction,
  saveStep,
  setStatus,
  stopEnrollmentAction,
  updateSequence,
} from '../actions'

export const metadata: Metadata = { title: 'Sequence' }

type Step = { id: string; position: number; channel: Channel; delay_hours: number; subject: string | null; body: string }
type Enrollment = {
  id: string
  state: string
  current_step: number
  next_action_at: string | null
  stopped_reason: string | null
  contact: { name: string | null; email: string | null } | null
}

const STATE_TONE: Record<string, string> = { active: 'ember', completed: 'ok', stopped: '' }

function when(iso: string | null) {
  if (!iso) return 'waiting on a message'
  const d = new Date(iso)
  const hours = Math.round((d.getTime() - Date.now()) / 3_600_000)
  if (hours <= 0) return 'due now'
  if (hours < 48) return `in ${hours}h`
  return `in ${Math.round(hours / 24)} days`
}

export default async function SequencePage(props: PageProps<'/sequences/[id]'>) {
  const { id } = await props.params
  const { supabase, workspace } = await getSession()

  const { data: seq } = await supabase
    .from('sequences')
    .select('id, name, status, review_email, mailbox_id, preset_id')
    .eq('id', id)
    .maybeSingle()
  if (!seq) notFound()

  const [{ data: steps }, { data: mailboxes }, { data: enrollments }, { data: contacts }, problems] = await Promise.all([
    supabase.from('sequence_steps').select('id, position, channel, delay_hours, subject, body').eq('sequence_id', id).order('position'),
    supabase.from('mailboxes').select('id, email, status').eq('workspace_id', workspace.id).order('created_at'),
    supabase
      .from('enrollments')
      .select('id, state, current_step, next_action_at, stopped_reason, contact:contacts ( name, email )')
      .eq('sequence_id', id)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('contacts')
      .select('id, name, email, email_status, preset_id, channels:contact_channels ( channel )')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .limit(500),
    activationProblems(supabase, id),
  ])

  const stepList = (steps ?? []) as Step[]
  // All enrolled contact ids, not just the 300 listed below.
  const { data: enrolledRows } = await supabase.from('enrollments').select('contact_id').eq('sequence_id', id)
  const enrolledIds = new Set((enrolledRows ?? []).map((e) => e.contact_id as string))
  const candidates = (contacts ?? []).filter((c) => !enrolledIds.has(c.id as string))
  const needsEmail = stepList[0]?.channel === 'email'

  return (
    <>
      <div className="page-head">
        <div>
          <p className="small">
            <Link href="/sequences">← Sequences</Link>
          </p>
          <h1 style={{ marginTop: 6 }}>{seq.name}</h1>
          <p>
            <span className={`pill ${seq.status === 'active' ? 'ok' : seq.status === 'paused' ? 'warn' : ''}`}>{seq.status}</span>{' '}
            {enrolledIds.size} enrolled
          </p>
        </div>
        <div className="row">
          {seq.status === 'active' ? (
            <ActionForm action={setStatus} inline>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value="paused" />
              <Submit className="btn">Pause</Submit>
            </ActionForm>
          ) : (
            <ActionForm action={setStatus} inline>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="status" value="active" />
              <Submit className="btn primary">{seq.status === 'paused' ? 'Resume' : 'Go live'}</Submit>
            </ActionForm>
          )}
        </div>
      </div>

      {problems.length > 0 && seq.status !== 'active' && (
        <div className="notice" style={{ marginBottom: 16 }}>
          <strong>Before this can go live:</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <ActionForm action={updateSequence} className="stack">
          <input type="hidden" name="id" value={id} />
          <div className="grid2">
            <label>
              Name
              <input name="name" defaultValue={seq.name} />
            </label>
            <label>
              Sends from
              <select name="mailbox_id" defaultValue={seq.mailbox_id ?? ''}>
                <option value="">No mailbox</option>
                {(mailboxes ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.email}
                    {m.status !== 'active' ? ' (needs reconnecting)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="check">
            <input type="checkbox" name="review_email" defaultChecked={seq.review_email} />
            Hold every email in Today for me to approve first
          </label>
          {!mailboxes?.length && (
            <p className="hint">
              No mailbox yet. <Link href="/mailboxes">Connect Gmail</Link> to send email.
            </p>
          )}
          <div>
            <Submit className="btn">Save settings</Submit>
          </div>
        </ActionForm>
      </div>

      <div className="spread" style={{ marginBottom: 10 }}>
        <h2>Steps</h2>
        <p className="hint">
          Variables: {TEMPLATE_VARS.map((v) => `{{${v}}}`).join(' ')} · <code>{'{{first_name|there}}'}</code> sets a fallback
        </p>
      </div>
      <div className="stack" style={{ marginBottom: 12 }}>
        {stepList.map((s, i) => (
          <div key={s.id} className="card">
            <ActionForm action={saveStep} className="stack">
              <input type="hidden" name="id" value={s.id} />
              <div className="spread">
                <h3>
                  Step {i + 1}{' '}
                  <span className="pill">{CHANNEL_MODE[s.channel] === 'auto' ? 'sends itself' : 'you send it'}</span>
                </h3>
                <div className="row">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <select name="channel" defaultValue={s.channel} style={{ width: 'auto' }}>
                      {Object.entries(CHANNEL_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                    {i === 0 ? 'Wait' : 'Then wait'}
                    <input name="delay_days" type="number" min={0} max={60} step={0.5} defaultValue={s.delay_hours / 24} style={{ width: 72 }} />
                    days
                  </label>
                </div>
              </div>
              {s.channel === 'email' && (
                <label>
                  Subject {i > 0 && <span className="hint">(empty = reply in the same thread)</span>}
                  <input name="subject" defaultValue={s.subject ?? ''} />
                </label>
              )}
              <label>
                Message
                <textarea name="body" defaultValue={s.body} rows={7} />
              </label>
              <div className="row">
                <Submit className="btn">Save step</Submit>
              </div>
            </ActionForm>
            <ActionForm action={deleteStep} inline>
              <input type="hidden" name="id" value={s.id} />
              <Submit className="btn ghost sm danger" confirm="Delete this step?">
                Delete step
              </Submit>
            </ActionForm>
          </div>
        ))}
      </div>
      <ActionForm action={addStep}>
        <input type="hidden" name="sequence_id" value={id} />
        <Submit className="btn">+ Add step</Submit>
      </ActionForm>

      <h2 style={{ margin: '28px 0 10px' }}>Enroll contacts</h2>
      <div className="card">
        {candidates.length === 0 ? (
          <p className="muted">
            Everyone is enrolled already, or there are no contacts. <Link href="/contacts">Add contacts</Link>.
          </p>
        ) : (
          <ActionForm action={enrollAction} className="stack">
            <input type="hidden" name="sequence_id" value={id} />
            <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
              <table>
                <tbody>
                  {candidates.map((c) => {
                    const ok = !needsEmail || c.email_status === 'valid' || c.email_status === 'accept_all'
                    return (
                      <tr key={c.id}>
                        <td style={{ width: 28 }}>
                          <input type="checkbox" name="contact" value={c.id} defaultChecked={ok && c.preset_id === seq.preset_id} />
                        </td>
                        <td>{c.name ?? '—'}</td>
                        <td className="small">
                          {c.email ?? <span className="muted">no email</span>} {c.email && <StatusPill status={c.email_status} />}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {needsEmail && (
              <p className="hint">Contacts without a verified email will have their email steps skipped.</p>
            )}
            <div>
              <Submit>Enroll selected</Submit>
            </div>
          </ActionForm>
        )}
      </div>

      {(enrollments ?? []).length > 0 && (
        <>
          <h2 style={{ margin: '28px 0 10px' }}>Enrolled</h2>
          <div className="card table-wrap" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Contact</th>
                  <th>State</th>
                  <th>Next</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {((enrollments ?? []) as unknown as Enrollment[]).map((e) => (
                  <tr key={e.id}>
                    <td>
                      {e.contact?.name ?? '—'}
                      <div className="small muted">{e.contact?.email}</div>
                    </td>
                    <td>
                      <span className={`pill ${STATE_TONE[e.state]}`}>
                        {e.state === 'stopped' ? `stopped: ${e.stopped_reason}` : e.state}
                      </span>
                    </td>
                    <td className="small muted">
                      {e.state === 'active' ? `step ${e.current_step}, ${when(e.next_action_at)}` : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {e.state === 'active' && (
                        <ActionForm action={stopEnrollmentAction} inline>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="sequence_id" value={id} />
                          <Submit className="btn ghost sm" confirm="Stop this contact's sequence?">
                            Stop
                          </Submit>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div style={{ marginTop: 40 }}>
        <ActionForm action={deleteSequence} inline>
          <input type="hidden" name="id" value={id} />
          <Submit className="btn ghost sm danger" confirm="Delete this sequence, its steps and enrollments? Sent history stays.">
            Delete sequence
          </Submit>
        </ActionForm>
      </div>
    </>
  )
}
