import type { Metadata } from 'next'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { getTodayQueue } from '@/lib/today-queue'
import { QueueCard } from './queue-card'

export const metadata: Metadata = { title: 'Today' }

export default async function TodayPage() {
  const { supabase, workspace } = await getSession()
  const [items, { count: queued }, { count: sentToday }] = await Promise.all([
    getTodayQueue(workspace.id),
    supabase.from('messages').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id).eq('status', 'queued'),
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspace.id)
      .eq('status', 'sent')
      .gte('sent_at', new Date(Date.now() - 86_400_000).toISOString()),
  ])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Today</h1>
          <p>Messages waiting for you. Social DMs are always sent by you; email sends itself unless it needs a look.</p>
        </div>
        <div className="row small muted">
          <span className="pill">{queued ?? 0} emails queued</span>
          <span className="pill ok">{sentToday ?? 0} sent in 24h</span>
        </div>
      </div>

      {!workspace.sender_address && (
        <p className="notice" style={{ marginBottom: 14 }}>
          Add your postal address in <Link href="/settings">Settings</Link> before any email can send. Every email has to
          include it.
        </p>
      )}

      {items.length === 0 ? (
        <div className="card empty">
          <h2>Nothing waiting</h2>
          <p>
            Drafts show up here when a sequence step is due. Start with <Link href="/contacts">Contacts</Link>, then a{' '}
            <Link href="/sequences">Sequence</Link>.
          </p>
        </div>
      ) : (
        <div className="stack">
          {items.map((item) => (
            <QueueCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </>
  )
}
