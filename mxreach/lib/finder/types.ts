export type FinderBranch = 'domain_api' | 'public_page'

export type VerifyStatus = 'unknown' | 'valid' | 'accept_all' | 'risky' | 'invalid'

/** Statuses we're willing to send to. */
export const SENDABLE: readonly VerifyStatus[] = ['valid', 'accept_all']

export type FinderInput = {
  firstName: string | null
  lastName: string | null
  fullName: string | null
  company: string | null
  domain: string | null
  /** Pages the person publishes themselves: site, link-in-bio, contact page. */
  urls: string[]
}

export type LookupLog = {
  branch: 'cache' | FinderBranch | 'verify'
  outcome: 'found' | 'not_found' | 'error' | 'skipped'
  email?: string | null
  detail?: string | null
}

export type FinderResult = {
  email: string
  source: 'cache' | FinderBranch
  status: VerifyStatus
  detail: string | null
}
