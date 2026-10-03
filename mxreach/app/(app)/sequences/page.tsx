import type { Metadata } from 'next'
import Link from 'next/link'
import { ActionForm, Submit } from '@/components/action-form'
import { getSession } from '@/lib/session'
import { createSequence } from './actions'

export const metadata: Metadata = { title: 'Sequences' }

const STATUS_TONE: Record<string, string> = { active: 'ok', paused: 'warn', draft: '' }

export default async function SequencesPage() {
  const { supabase, workspace } = await getSession()
  const [{ data: sequences }, { data: presets }] = await Promise.all([
    supabase
      .from('sequences')
      .select('id, name, status, preset:presets ( name ), steps:sequence_steps ( count ), enrollments ( state, stopped_reason )')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false }),
    supabase.from('presets').select('id, name, description').order('sort'),
  ])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sequences</h1>
          <p>A first message and its follow-ups. Follow-ups stop the moment someone replies.</p>
        </div>
      </div>

      <div className="card stack" style={{ marginBottom: 18 }}>
        <h2>New sequence</h2>
        <ActionForm action={createSequence} className="stack">
          <div className="grid2">
            {(presets ?? []).map((p, i) => (
              <label key={p.id} className="card" style={{ cursor: 'pointer', gap: 6 }}>
                <span className="check">
                  <input type="radio" name="preset" value={p.id} defaultChecked={i === 0} />
                  <strong>{p.name}</strong>
                </span>
                <span className="hint">{p.description}</span>
              </label>
            ))}
          </div>
          <div className="row">
            <input name="name" placeholder="Name (optional)" style={{ maxWidth: 320 }} />
            <Submit>Create from preset</Submit>
          </div>
          <p className="hint">It starts as a draft with starter copy. Replace every [[…]] before it can go live.</p>
        </ActionForm>
      </div>

      {sequences?.length ? (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Sequence</th>
                <th>Status</th>
                <th>Steps</th>
                <th>Active</th>
                <th>Replied</th>
              </tr>
            </thead>
            <tbody>
              {sequences.map((s) => {
                const enr = (s.enrollments ?? []) as { state: string; stopped_reason: string | null }[]
                const steps = (s.steps as unknown as { count: number }[])[0]?.count ?? 0
                return (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/sequences/${s.id}`}>{s.name}</Link>
                      <div className="small muted">{(s.preset as unknown as { name: string } | null)?.name}</div>
                    </td>
                    <td>
                      <span className={`pill ${STATUS_TONE[s.status]}`}>{s.status}</span>
                    </td>
                    <td>{steps}</td>
                    <td>{enr.filter((e) => e.state === 'active').length}</td>
                    <td>{enr.filter((e) => e.stopped_reason === 'replied').length}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card empty">
          <h2>No sequences yet</h2>
          <p>Pick a preset above to start from.</p>
        </div>
      )}
    </>
  )
}
