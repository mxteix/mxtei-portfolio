import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

// supabase/setup.sql is the one-paste version of the migrations. If a
// migration changes, run `npm run setup-sql` so the two never drift.
it('setup.sql contains every migration, in order', () => {
  const dir = join(import.meta.dirname, '..', '..', 'supabase')
  const setup = readFileSync(join(dir, 'setup.sql'), 'utf8')
  let from = 0
  for (const f of readdirSync(join(dir, 'migrations')).filter((x) => x.endsWith('.sql')).sort()) {
    const at = setup.indexOf(readFileSync(join(dir, 'migrations', f), 'utf8'), from)
    expect(at, `${f} missing or out of order in setup.sql`).toBeGreaterThan(-1)
    from = at
  }
})
