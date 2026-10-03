'use client'

import { useState, useTransition } from 'react'
import { CHANNEL_LABEL, CHANNEL_MODE, clipboardPayload, conversationUrl } from '@/lib/channels'
import type { QueueItem } from '@/lib/today-queue'
import { approveAction, repliedAction, saveDraftAction, sentAction, skipAction, snoozeAction } from './actions'

/**
 * One drafted message. Assisted channels: Copy & open → paste → Sent.
 * "Sent" only unlocks after the handoff, so it's hard to mark something
 * sent that never left. Email in review mode: Approve, and the connected
 * mailbox sends it.
 */
export function QueueCard({ item }: { item: QueueItem }) {
  const [subject, setSubject] = useState(item.subject ?? '')
  const [body, setBody] = useState(item.body)
  const [editing, setEditing] = useState(Boolean(item.note))
  const [handedOff, setHandedOff] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const assisted = CHANNEL_MODE[item.channel] === 'assisted'
  const dirty = subject !== (item.subject ?? '') || body !== item.body
  const url = item.handle ? conversationUrl(item.channel, item.handle) : null
  const who = item.contact.name ?? item.contact.email ?? 'Unnamed contact'

  const run = (fn: () => Promise<string | null>) =>
    start(async () => {
      try {
        setMessage(await fn())
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'Something went wrong.')
      }
    })

  // Synchronous on purpose: browsers only allow window.open (and clipboard
  // writes) directly inside the click, not after an await.
  const handoff = () => {
    const done = url
      ? 'Copied. Paste it in the tab that just opened, send it, then come back and click Sent.'
      : 'Copied.'
    navigator.clipboard.writeText(clipboardPayload(item.channel, subject || null, body)).catch(() => {})
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
    setHandedOff(true)
    setMessage(done)
    if (dirty) run(async () => (await saveDraftAction(item.id, item.channel === 'email' ? subject || null : null, body), done))
  }

  return (
    <article className="card stack">
      <div className="spread">
        <div>
          <h3>
            {who}
            {item.contact.company && <span className="muted"> · {item.contact.company}</span>}
          </h3>
          <p className="muted small">
            {item.sequence?.name ?? 'No sequence'}
            {item.stepPosition != null && ` · step ${item.stepPosition}`}
            {item.handle && ` · ${item.handle}`}
          </p>
        </div>
        <span className={`pill ${assisted ? '' : 'ember'}`}>{CHANNEL_LABEL[item.channel]}</span>
      </div>

      {item.note && <p className="notice">{item.note}</p>}

      {editing ? (
        <div className="stack">
          {item.channel === 'email' && (
            <label>
              Subject
              <input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </label>
          )}
          <label>
            Message
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} />
          </label>
        </div>
      ) : (
        <div className="stack" style={{ gap: 6 }}>
          {item.channel === 'email' && subject && <p className="small"><span className="muted">Subject:</span> {subject}</p>}
          <pre className="body">{body}</pre>
        </div>
      )}

      {message && <p className="small muted">{message}</p>}

      <div className="row">
        {assisted ? (
          <>
            <button className="btn primary" disabled={pending || !item.handle} onClick={handoff}>
              Copy &amp; open {CHANNEL_LABEL[item.channel]}
            </button>
            <button
              className="btn"
              disabled={pending || !handedOff}
              title={handedOff ? '' : 'Copy & open first'}
              onClick={() => run(() => sentAction(item.id))}
            >
              Sent
            </button>
          </>
        ) : (
          <button
            className="btn primary"
            disabled={pending || !subject.trim() || !body.trim()}
            onClick={() =>
              run(async () => {
                if (dirty) await saveDraftAction(item.id, subject || null, body)
                return approveAction(item.id)
              })
            }
          >
            Approve &amp; send
          </button>
        )}
        {editing ? (
          dirty && (
            <button className="btn" disabled={pending} onClick={() => run(() => saveDraftAction(item.id, item.channel === 'email' ? subject || null : null, body))}>
              Save edits
            </button>
          )
        ) : (
          <button className="btn ghost" onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn ghost sm" disabled={pending} onClick={() => run(() => snoozeAction(item.id))}>
          Tomorrow
        </button>
        <button className="btn ghost sm" disabled={pending} onClick={() => run(() => skipAction(item.id))}>
          Skip step
        </button>
        {item.enrollmentId && (
          <button className="btn ghost sm" disabled={pending} onClick={() => run(() => repliedAction(item.enrollmentId!))}>
            They replied
          </button>
        )}
      </div>
    </article>
  )
}
