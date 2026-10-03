import type { Metadata } from 'next'
import { ActionForm, Submit } from '@/components/action-form'
import { limitsFor } from '@/lib/plans'
import { getSession } from '@/lib/session'
import { disconnect, setDailyCap } from './actions'

export const metadata: Metadata = { title: 'Mailboxes' }

const ERRORS: Record<string, string> = {
  denied: 'Google access was cancelled.',
  state: "That sign-in didn't match this session. Try connecting again.",
  scopes: 'mxReach needs both permissions Google asks for: sending email, and reading headers to spot replies. Connect again and leave both ticked.',
  refresh: "Google didn't return a long-lived token. Remove mxReach at myaccount.google.com/permissions, then connect again.",
  google: 'Google returned an error. Try again in a minute.',
  limit: 'Your plan’s mailbox limit is reached. Disconnect one first.',
}

export default async function MailboxesPage(props: PageProps<'/mailboxes'>) {
  const { connected, error } = await props.searchParams
  const { supabase, workspace } = await getSession()
  const limit = limitsFor(workspace.plan).mailboxes

  const { data: mailboxes } = await supabase
    .from('mailboxes')
    .select('id, email, daily_cap, status, last_error, created_at')
    .eq('workspace_id', workspace.id)
    .order('created_at')

  const since = new Date(Date.now() - 86_400_000).toISOString()
  const sent = new Map<string, number>()
  for (const m of mailboxes ?? []) {
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('mailbox_id', m.id)
      .eq('status', 'sent')
      .gte('sent_at', since)
    sent.set(m.id, count ?? 0)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mailboxes</h1>
          <p>
            Email goes out from your own inbox, one at a time, at a human pace. {mailboxes?.length ?? 0} of {limit} connected.
          </p>
        </div>
        {(mailboxes?.length ?? 0) < limit && (
          <a className="btn primary" href="/api/gmail/connect">
            Connect Gmail
          </a>
        )}
      </div>

      {typeof connected === 'string' && <p className="notice ok" style={{ marginBottom: 14 }}>Connected {connected}.</p>}
      {typeof error === 'string' && <p className="notice bad" style={{ marginBottom: 14 }}>{ERRORS[error] ?? 'Something went wrong.'}</p>}

      {mailboxes?.length ? (
        <div className="stack">
          {mailboxes.map((m) => (
            <div key={m.id} className="card spread">
              <div className="stack" style={{ gap: 4 }}>
                <h3>{m.email}</h3>
                <p className="small muted">
                  <span className={`pill ${m.status === 'active' ? 'ok' : 'bad'}`}>{m.status === 'active' ? 'connected' : 'needs reconnecting'}</span>{' '}
                  {sent.get(m.id)} of {m.daily_cap} sent in the last 24h
                </p>
                {m.status !== 'active' && m.last_error && <p className="small muted">{m.last_error}</p>}
              </div>
              <div className="row">
                {m.status !== 'active' && (
                  <a className="btn primary sm" href={`/api/gmail/connect?email=${encodeURIComponent(m.email)}`}>
                    Reconnect
                  </a>
                )}
                <ActionForm action={setDailyCap} inline>
                  <input type="hidden" name="id" value={m.id} />
                  <span className="row" style={{ gap: 6 }}>
                    <input name="daily_cap" type="number" min={1} max={200} defaultValue={m.daily_cap} style={{ width: 80 }} />
                    <Submit className="btn sm">Set daily cap</Submit>
                  </span>
                </ActionForm>
                <ActionForm action={disconnect} inline>
                  <input type="hidden" name="id" value={m.id} />
                  <Submit className="btn ghost sm danger" confirm={`Disconnect ${m.email}?`}>
                    Disconnect
                  </Submit>
                </ActionForm>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card empty">
          <h2>No mailbox yet</h2>
          <p>Connect a Gmail account to send email. Social DMs work without one.</p>
        </div>
      )}

      <div className="card stack" style={{ marginTop: 18 }}>
        <h3>Keeping out of spam</h3>
        <ul className="small muted" style={{ margin: 0, paddingLeft: 18 }}>
          <li>A new address should start around 20 a day and grow slowly. The default cap is 30.</li>
          <li>Use a separate address for outreach (e.g. a second domain) so your main inbox’s reputation stays safe.</li>
          <li>mxReach only asks for permission to send, and to read message headers so it can stop when someone replies. It never reads email bodies.</li>
        </ul>
      </div>
    </>
  )
}
