/**
 * robots.txt, just enough to respect it: pick our group (or *), then the
 * longest matching Allow/Disallow rule wins, with * and $ wildcards.
 */

export const USER_AGENT_TOKEN = 'mxReachBot'

type Rule = { allow: boolean; pattern: string }

function groups(txt: string): Map<string, Rule[]> {
  const out = new Map<string, Rule[]>()
  let agents: string[] = []
  let lastWasAgent = false

  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim()
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const field = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()

    if (field === 'user-agent') {
      if (!lastWasAgent) agents = []
      agents.push(value.toLowerCase())
      for (const a of agents) if (!out.has(a)) out.set(a, [])
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (field !== 'allow' && field !== 'disallow') continue
    // "Disallow:" with no path allows everything.
    if (!value) continue
    for (const a of agents) out.get(a)!.push({ allow: field === 'allow', pattern: value })
  }
  return out
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$')
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(path)
}

export function isAllowed(robotsTxt: string, path: string, agent = USER_AGENT_TOKEN): boolean {
  const g = groups(robotsTxt)
  const ours = [...g.keys()].find((k) => k !== '*' && agent.toLowerCase().includes(k))
  const rules = g.get(ours ?? '*') ?? []

  let best: Rule | null = null
  for (const r of rules) {
    if (!matches(r.pattern, path)) continue
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r
  }
  return best ? best.allow : true
}
