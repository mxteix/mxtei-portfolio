import type { Metadata } from 'next'
import { ActionForm, Submit } from '@/components/action-form'
import { StatusPill } from '@/components/status-pill'
import { CHANNEL_LABEL, type Channel } from '@/lib/channels'
import { limitsFor, monthStart } from '@/lib/plans'
import { getSession } from '@/lib/session'
import { addContact, deleteContactAction, findEmailAction, findMissingAction, importContacts, verifyEmailAction } from './actions'

export const metadata: Metadata = { title: 'Contacts' }

type Row = {
  id: string
  name: string | null
  email: string | null
  email_status: string
  email_source: string | null
  company: string | null
  company_domain: string | null
  website_url: string | null
  preset_id: string | null
  channels: { channel: Channel; handle: string }[]
}

type Lookup = { contact_id: string; branch: string; outcome: string; detail: string | null; created_at: string }

const SOURCE_LABEL: Record<string, string> = {
  manual: 'added by you',
  cache: 'from the shared cache',
  domain_api: 'company-domain lookup',
  public_page: 'their published page',
}

export default async function ContactsPage(props: PageProps<'/contacts'>) {
  const { q } = await props.searchParams
  const query = typeof q === 'string' ? q.trim() : ''
  const { supabase, workspace } = await getSession()

  let list = supabase
    .from('contacts')
    .select('id, name, email, email_status, email_source, company, company_domain, website_url, preset_id, channels:contact_channels ( channel, handle )')
    .eq('workspace_id', workspace.id)
    .order('created_at', { ascending: false })
    .limit(300)
  if (query) {
    const like = `%${query.replace(/[%_,()]/g, ' ')}%`
    list = list.or(`name.ilike.${like},email.ilike.${like},company.ilike.${like}`)
  }

  const [{ data: contacts }, { data: presets }, { data: found }, { count: total }] = await Promise.all([
    list,
    supabase.from('presets').select('id, name').order('sort'),
    supabase
      .from('lookups')
      .select('contact_id')
      .eq('workspace_id', workspace.id)
      .eq('outcome', 'found')
      .in('branch', ['cache', 'domain_api', 'public_page'])
      .gte('created_at', monthStart().toISOString())
      .limit(20_000),
    supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id),
  ])
  const rows = (contacts ?? []) as unknown as Row[]
  const presetName = new Map((presets ?? []).map((p) => [p.id as string, p.name as string]))
  const used = new Set((found ?? []).map((f) => f.contact_id)).size
  const allowance = limitsFor(workspace.plan).contactsPerMonth

  const { data: lookups } = rows.length
    ? await supabase
        .from('lookups')
        .select('contact_id, branch, outcome, detail, created_at')
        .in('contact_id', rows.map((r) => r.id))
        .order('created_at', { ascending: false })
        .limit(2000)
    : { data: [] }
  const lastRun = new Map<string, Lookup[]>()
  for (const l of (lookups ?? []) as Lookup[]) {
    const runs = lastRun.get(l.contact_id) ?? []
    // Keep only the latest run: entries within a minute of the newest one.
    if (!runs.length || new Date(runs[0].created_at).getTime() - new Date(l.created_at).getTime() < 60_000) runs.push(l)
    lastRun.set(l.contact_id, runs)
  }

  const presetSelect = (name: string, withNone: boolean) => (
    <select name={name} defaultValue="">
      {withNone && <option value="">No preset (reads their pages first)</option>}
      {(presets ?? []).map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Contacts</h1>
          <p>
            {total ?? 0} contacts · {used} of {allowance} new contacts found this month
          </p>
        </div>
        <div className="row">
          <form className="row">
            <input name="q" defaultValue={query} placeholder="Search name, email, company" style={{ width: 240 }} />
          </form>
          <ActionForm action={findMissingAction} inline>
            <Submit className="btn" pendingLabel="Looking…">
              Find missing emails (10)
            </Submit>
          </ActionForm>
        </div>
      </div>

      <div className="grid2" style={{ marginBottom: 18 }}>
        <details className="card">
          <summary>Add a contact</summary>
          <ActionForm action={addContact} className="stack" resetOnSuccess>
            <div className="grid2" style={{ marginTop: 12 }}>
              <label>Name<input name="name" placeholder="Sam Rivera" /></label>
              <label>Email<input name="email" type="email" placeholder="Leave empty to find it" /></label>
              <label>Company / channel<input name="company" /></label>
              <label>Company domain<input name="domain" placeholder="acme.com" /></label>
              <label>Website or link-in-bio<input name="website" placeholder="https://linktr.ee/sam" /></label>
              <label>Preset{presetSelect('preset', true)}</label>
              <label>Instagram<input name="instagram" placeholder="@handle" /></label>
              <label>
                Discord user ID<input name="discord" inputMode="numeric" placeholder="123456789012345678" />
              </label>
              <label>LinkedIn<input name="linkedin" placeholder="profile URL or slug" /></label>
            </div>
            <div>
              <Submit>Add contact</Submit>
            </div>
          </ActionForm>
        </details>

        <details className="card">
          <summary>Import from CSV</summary>
          <ActionForm action={importContacts} className="stack" resetOnSuccess>
            <p className="hint" style={{ marginTop: 12 }}>
              Header row, then one contact per line. Columns: <code>name, email, company, domain, website, instagram,
              discord, linkedin, preset</code>. Only <code>name</code> or <code>email</code> is required. Paste straight
              from a spreadsheet works too.
            </p>
            <textarea name="csv" placeholder={'name,company,website\nSam Rivera,Sam Makes Videos,https://samrivera.com'} />
            <label>Preset for rows without one{presetSelect('preset', true)}</label>
            <div>
              <Submit pendingLabel="Importing…">Import</Submit>
            </div>
          </ActionForm>
        </details>
      </div>

      {rows.length === 0 ? (
        <div className="card empty">
          <h2>{query ? 'No matches' : 'No contacts yet'}</h2>
          <p>{query ? 'Try another search.' : 'Add one above, or paste a list from a spreadsheet.'}</p>
        </div>
      ) : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Contact</th>
                <th>Email</th>
                <th>Elsewhere</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const runs = lastRun.get(c.id) ?? []
                return (
                  <tr key={c.id}>
                    <td>
                      <div>{c.name ?? <span className="muted">No name</span>}</div>
                      <div className="small muted">
                        {[c.company, c.company_domain].filter(Boolean).join(' · ')}
                        {c.preset_id && <> · {presetName.get(c.preset_id)}</>}
                      </div>
                      {c.website_url && (
                        <div className="small">
                          <a href={c.website_url} target="_blank" rel="noreferrer">
                            {c.website_url.replace(/^https?:\/\//, '')}
                          </a>
                        </div>
                      )}
                    </td>
                    <td>
                      {c.email ? (
                        <>
                          <div>{c.email}</div>
                          <div className="row small" style={{ gap: 6, marginTop: 2 }}>
                            <StatusPill status={c.email_status} />
                            {c.email_source && <span className="muted">{SOURCE_LABEL[c.email_source]}</span>}
                          </div>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
                      {runs.length > 0 && (
                        <details style={{ marginTop: 6 }}>
                          <summary>Last lookup</summary>
                          <ul className="small muted" style={{ margin: '6px 0 0', paddingLeft: 16 }}>
                            {[...runs].reverse().map((l, i) => (
                              <li key={i}>
                                {l.branch.replace('_', ' ')}: {l.outcome.replace('_', ' ')}
                                {l.detail && ` (${l.detail})`}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td className="small">
                      {c.channels.length ? (
                        c.channels.map((ch) => (
                          <div key={ch.channel}>
                            <span className="muted">{CHANNEL_LABEL[ch.channel]}:</span> {ch.handle}
                          </div>
                        ))
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                        {c.email ? (
                          c.email_status !== 'valid' && (
                            <ActionForm action={verifyEmailAction} inline>
                              <input type="hidden" name="id" value={c.id} />
                              <Submit className="btn sm" pendingLabel="Checking…">Verify</Submit>
                            </ActionForm>
                          )
                        ) : (
                          <ActionForm action={findEmailAction} inline>
                            <input type="hidden" name="id" value={c.id} />
                            <Submit className="btn sm primary" pendingLabel="Looking…">Find email</Submit>
                          </ActionForm>
                        )}
                        <ActionForm action={deleteContactAction} inline>
                          <input type="hidden" name="id" value={c.id} />
                          <Submit className="btn sm ghost danger" pendingLabel="…" confirm={`Delete ${c.name ?? c.email}?`}>
                            Delete
                          </Submit>
                        </ActionForm>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
