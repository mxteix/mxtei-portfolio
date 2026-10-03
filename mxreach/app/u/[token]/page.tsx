import type { Metadata } from 'next'
import { env } from '@/lib/env'
import { readUnsubscribeToken } from '@/lib/unsubscribe'

export const metadata: Metadata = { title: 'Unsubscribe' }

/** The footer link. Asks for one click so email scanners can't unsubscribe people by prefetching. */
export default async function UnsubscribePage(props: PageProps<'/u/[token]'>) {
  const { token } = await props.params
  const { done } = await props.searchParams
  const valid = readUnsubscribeToken(token, env('APP_SECRET')) !== null

  return (
    <main className="auth">
      <div className="card stack" style={{ textAlign: 'center' }}>
        {!valid ? (
          <>
            <h1>Link not recognised</h1>
            <p className="muted">Reply to the email with &quot;unsubscribe&quot; and the sender will remove you.</p>
          </>
        ) : done ? (
          <>
            <h1>You&apos;re unsubscribed</h1>
            <p className="muted">You won&apos;t get more emails from this sender through mxReach.</p>
          </>
        ) : (
          <>
            <h1>Unsubscribe?</h1>
            <p className="muted">You&apos;ll stop getting emails from this sender.</p>
            <form action={`/api/unsubscribe/${token}`} method="post">
              <button className="btn primary">Unsubscribe</button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
