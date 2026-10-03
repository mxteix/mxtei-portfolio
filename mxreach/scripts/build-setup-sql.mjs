// Concatenates supabase/migrations/*.sql into supabase/setup.sql, the
// one-paste version for the Supabase SQL Editor. Run: npm run setup-sql
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'

const dir = new URL('../supabase/', import.meta.url)
const files = readdirSync(new URL('migrations/', dir)).filter((f) => f.endsWith('.sql')).sort()
const header = [
  '-- mxReach — everything Supabase needs, in one paste.',
  '-- Generated from supabase/migrations/ by `npm run setup-sql`. Edit the migrations, not this.',
  '-- Paste into Supabase → SQL Editor → New query → Run. Run it once.',
].join('\n')
const body = files.map((f) => `\n\n-- ═══ ${f} ═══\n\n${readFileSync(new URL(`migrations/${f}`, dir), 'utf8')}`).join('')
writeFileSync(new URL('setup.sql', dir), `${header}${body}`)
console.log(`setup.sql ← ${files.join(', ')}`)
