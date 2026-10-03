import type { SupabaseClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/crypto'
import { appUrl, env } from '@/lib/env'
import { refreshAccessToken, type GoogleApp } from '@/lib/mail/gmail'

/** Pins an in-flight Gmail OAuth flow to the browser that started it. */
export const STATE_COOKIE = 'mxr_gmail_state'

export function googleApp(): GoogleApp {
  return {
    clientId: env('GOOGLE_CLIENT_ID'),
    clientSecret: env('GOOGLE_CLIENT_SECRET'),
    redirectUri: `${appUrl()}/api/gmail/callback`,
  }
}

export type MailboxRow = { id: string; workspace_id: string; email: string; daily_cap: number; status: string }

/** Access tokens for the run, one refresh per mailbox. Service role only. */
export class Mailboxes {
  private tokens = new Map<string, Promise<string>>()
  private rows = new Map<string, MailboxRow | null>()

  constructor(private db: SupabaseClient) {}

  async get(id: string): Promise<MailboxRow | null> {
    if (!this.rows.has(id)) {
      const { data } = await this.db.from('mailboxes').select('id, workspace_id, email, daily_cap, status').eq('id', id).maybeSingle()
      this.rows.set(id, (data as MailboxRow | null) ?? null)
    }
    return this.rows.get(id) ?? null
  }

  accessToken(id: string): Promise<string> {
    if (!this.tokens.has(id)) {
      const p = (async () => {
        const { data, error } = await this.db
          .from('mailbox_secrets')
          .select('refresh_token_enc')
          .eq('mailbox_id', id)
          .single()
        if (error || !data) throw new Error('mailbox has no stored credentials')
        const refresh = decrypt(data.refresh_token_enc, env('TOKEN_ENCRYPTION_KEY'))
        return refreshAccessToken(googleApp(), refresh)
      })()
      // Don't cache a failure: the next caller should get a fresh attempt.
      p.catch(() => this.tokens.delete(id))
      this.tokens.set(id, p)
    }
    return this.tokens.get(id)!
  }

  async markError(id: string, message: string) {
    await this.db.from('mailboxes').update({ status: 'error', last_error: message.slice(0, 500) }).eq('id', id)
    const row = this.rows.get(id)
    if (row) row.status = 'error'
  }
}
