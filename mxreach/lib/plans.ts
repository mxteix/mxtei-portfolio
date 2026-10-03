/**
 * Plan limits. Mirrors the planned pricing on mxtei.com/mxreach
 * (Pro $29, Max $49, Team $119, Company = talk). Nothing here charges
 * anyone: mxReach isn't launched and billing isn't built.
 */

export type Plan = 'pro' | 'max' | 'team' | 'company'

export const PLAN_LIMITS: Record<Plan, { label: string; seats: number; mailboxes: number; contactsPerMonth: number }> = {
  pro: { label: 'Pro', seats: 1, mailboxes: 2, contactsPerMonth: 200 },
  max: { label: 'Max', seats: 1, mailboxes: 5, contactsPerMonth: 400 },
  team: { label: 'Team', seats: 3, mailboxes: 15, contactsPerMonth: 1000 },
  company: { label: 'Company', seats: 50, mailboxes: 100, contactsPerMonth: 10_000 },
}

export function limitsFor(plan: string) {
  return PLAN_LIMITS[(plan in PLAN_LIMITS ? plan : 'pro') as Plan]
}

/** First instant of the current calendar month, UTC. */
export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}
