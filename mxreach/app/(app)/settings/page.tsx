import type { Metadata } from 'next'
import { ActionForm, Submit } from '@/components/action-form'
import { limitsFor } from '@/lib/plans'
import { getSession } from '@/lib/session'
import { saveSettings } from './actions'

export const metadata: Metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const { workspace } = await getSession()
  const plan = limitsFor(workspace.plan)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Who your emails come from.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <ActionForm action={saveSettings} className="stack">
          <div className="grid2">
            <label>
              Workspace name
              <input name="name" defaultValue={workspace.name} />
            </label>
            <label>
              Your name, as it appears on emails
              <input name="sender_name" defaultValue={workspace.sender_name ?? ''} placeholder="Marcell Szoke" />
              <span className="hint">Also fills {'{{sender_name}}'} in templates.</span>
            </label>
          </div>
          <label>
            Postal address
            <textarea name="sender_address" defaultValue={workspace.sender_address ?? ''} rows={2} style={{ minHeight: 0 }} placeholder="Street 1, 1234 City, Country" />
            <span className="hint">
              Printed in every email&apos;s footer next to the unsubscribe link. US law (CAN-SPAM) requires it, and EU rules
              require senders to be identifiable. No email sends until it&apos;s set.
            </span>
          </label>
          <div>
            <Submit>Save</Submit>
          </div>
        </ActionForm>
      </div>

      <div className="card stack">
        <h2>Plan</h2>
        <p className="muted">
          {plan.label}: {plan.mailboxes} mailboxes, {plan.contactsPerMonth.toLocaleString('en')} new contacts a month, {plan.seats}{' '}
          {plan.seats === 1 ? 'seat' : 'seats'}. Early access is free while mxReach is in beta.
        </p>
      </div>
    </>
  )
}
