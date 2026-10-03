import type { SupabaseClient } from '@supabase/supabase-js'
import { optionalEnv } from '@/lib/env'
import { findContactEmail, type CacheRow } from '@/lib/finder/cascade'
import { hunterFind, hunterVerify } from '@/lib/finder/hunter'
import { findOnPublicPages } from '@/lib/finder/public-pages'
import type { FinderBranch, FinderInput, FinderResult, LookupLog } from '@/lib/finder/types'
import { verifyAddress } from '@/lib/finder/verify'

export type FinderContact = {
  id: string
  workspace_id: string
  name: string | null
  first_name: string | null
  last_name: string | null
  company: string | null
  company_domain: string | null
  website_url: string | null
  preset_id: string | null
}

export function inputFor(contact: FinderContact, extraUrls: string[] = []): FinderInput {
  const urls = [contact.website_url, ...extraUrls]
    .flatMap((u) => (u ?? '').split(/[\s,]+/))
    .map((u) => u.trim())
    .filter(Boolean)
  return {
    firstName: contact.first_name,
    lastName: contact.last_name,
    fullName: contact.name,
    company: contact.company,
    domain: contact.company_domain,
    urls,
  }
}

export function verifier() {
  const key = optionalEnv('HUNTER_API_KEY')
  return (email: string) => verifyAddress(email, { provider: key ? (e) => hunterVerify(e, key) : null })
}

/**
 * Run the cascade for one contact. The shared cache goes through the
 * service client (no customer can read it directly); the lookup log goes
 * through the user's own client so RLS scopes it to their workspace.
 */
export async function runFinder(opts: {
  contact: FinderContact
  branches: FinderBranch[]
  service: SupabaseClient
  user: SupabaseClient
}): Promise<{ result: FinderResult | null; log: LookupLog[] }> {
  const { contact, branches, service, user } = opts
  const key = optionalEnv('HUNTER_API_KEY')
  const log: LookupLog[] = []

  const result = await findContactEmail(inputFor(contact), branches, {
    cacheGet: async (keys) => {
      const { data, error } = await service.from('finder_cache').select('*').in('key', keys)
      if (error) throw new Error(`cache read: ${error.message}`)
      return (data ?? []) as CacheRow[]
    },
    cachePut: async (rows) => {
      if (!rows.length) return
      const { error } = await service.from('finder_cache').upsert(rows, { onConflict: 'key' })
      if (error) throw new Error(`cache write: ${error.message}`)
    },
    domainApi: key
      ? (input) =>
          hunterFind(
            { firstName: input.firstName, lastName: input.lastName, fullName: input.fullName, domain: input.domain },
            key,
          )
      : null,
    publicPages: (urls) => findOnPublicPages(urls),
    verify: verifier(),
    log: (entry) => log.push(entry),
  })

  if (log.length) {
    await user.from('lookups').insert(
      log.map((l) => ({
        workspace_id: contact.workspace_id,
        contact_id: contact.id,
        preset_id: contact.preset_id,
        branch: l.branch,
        outcome: l.outcome,
        email: l.email ?? null,
        detail: l.detail?.slice(0, 500) ?? null,
      })),
    )
  }
  return { result, log }
}
