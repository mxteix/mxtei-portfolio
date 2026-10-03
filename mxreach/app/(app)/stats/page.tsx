import type { Metadata } from 'next'
import { getSession } from '@/lib/session'

export const metadata: Metadata = { title: 'Hit rates' }

type Stat = { preset_id: string | null; branch: string; found: number; not_found: number; errors: number; attempts: number }

const BRANCH: Record<string, string> = {
  cache: 'Shared cache',
  public_page: 'Their published page',
  domain_api: 'Company-domain lookup',
  verify: 'Verification (passed)',
}
const ORDER = ['cache', 'public_page', 'domain_api', 'verify']

function pct(n: number, d: number) {
  return d ? `${Math.round((n / d) * 100)}%` : '—'
}

/**
 * The plan's "measure ~50 real targets per audience" number: how often each
 * branch of the cascade finds someone. Low hit rates for an audience mean
 * bought data isn't enough there, and custom sourcing would be a real
 * advantage rather than a cost saving.
 */
export default async function StatsPage() {
  const { supabase, workspace } = await getSession()
  const [{ data: stats }, { data: presets }, { data: outcomes }] = await Promise.all([
    supabase.from('lookup_stats').select('preset_id, branch, found, not_found, errors, attempts').eq('workspace_id', workspace.id),
    supabase.from('presets').select('id, name').order('sort'),
    supabase.from('enrollments').select('state, stopped_reason').eq('workspace_id', workspace.id).limit(20_000),
  ])

  const rows = (stats ?? []) as Stat[]
  const groups = [...(presets ?? []).map((p) => ({ id: p.id as string | null, name: p.name as string })), { id: null, name: 'No preset' }]
  const reasons = (outcomes ?? []).reduce<Record<string, number>>((acc, e) => {
    const k = e.state === 'stopped' ? (e.stopped_reason as string) : (e.state as string)
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})
  const totalEnrolled = outcomes?.length ?? 0

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hit rates</h1>
          <p>How often each way of finding an email works, per audience. Aim for ~50 real people per audience before deciding anything.</p>
        </div>
      </div>

      <div className="grid2" style={{ marginBottom: 18 }}>
        {[
          ['Enrolled', totalEnrolled],
          ['Replied', reasons.replied ?? 0],
          ['Bounced', reasons.bounced ?? 0],
          ['Unsubscribed', reasons.unsubscribed ?? 0],
        ].map(([label, n]) => (
          <div key={label} className="card">
            <p className="small muted">{label}</p>
            <p style={{ fontSize: 26, fontWeight: 600 }}>
              {n}
              {label !== 'Enrolled' && <span className="small muted"> · {pct(Number(n), totalEnrolled)}</span>}
            </p>
          </div>
        ))}
      </div>

      <div className="stack">
        {groups.map((g) => {
          const mine = rows.filter((r) => r.preset_id === g.id)
          if (!mine.length) return null
          return (
            <div key={g.id ?? 'none'} className="card table-wrap">
              <h2 style={{ marginBottom: 8 }}>{g.name}</h2>
              <table>
                <thead>
                  <tr>
                    <th>Branch</th>
                    <th>Tried</th>
                    <th>Found</th>
                    <th>Hit rate</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {ORDER.map((b) => {
                    const r = mine.find((x) => x.branch === b)
                    if (!r) return null
                    const tried = r.found + r.not_found
                    return (
                      <tr key={b}>
                        <td>{BRANCH[b]}</td>
                        <td>{tried}</td>
                        <td>{r.found}</td>
                        <td>
                          <strong>{pct(r.found, tried)}</strong>
                        </td>
                        <td className="muted">{r.errors || ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })}
        {!rows.length && (
          <div className="card empty">
            <h2>No lookups yet</h2>
            <p>Run &quot;Find email&quot; on some contacts and the numbers show up here.</p>
          </div>
        )}
      </div>
    </>
  )
}
