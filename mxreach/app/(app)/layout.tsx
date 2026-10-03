import { Nav } from '@/components/nav'
import { limitsFor } from '@/lib/plans'
import { getSession } from '@/lib/session'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, email, workspace } = await getSession()

  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspace.id)
    .eq('status', 'awaiting_user')
    .lte('scheduled_for', new Date().toISOString())

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          mx<span>Reach</span> <small>beta</small>
        </div>
        <Nav todayCount={count ?? 0} />
        <div className="side-foot">
          <div>
            {workspace.name} · {limitsFor(workspace.plan).label}
          </div>
          <div>{email}</div>
          <form action="/auth/signout" method="post">
            <button className="btn ghost sm">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  )
}
