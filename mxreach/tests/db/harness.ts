import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite, type Transaction } from '@electric-sql/pglite'

const root = join(import.meta.dirname, '..', '..')

/** A fresh in-memory Postgres with the Supabase stub and every migration applied. */
export async function freshDb(): Promise<PGlite> {
  const db = await PGlite.create()
  await db.exec(readFileSync(join(import.meta.dirname, 'supabase-stub.sql'), 'utf8'))

  const dir = join(root, 'supabase', 'migrations')
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, file), 'utf8'))
  }
  return db
}

/** Run as a signed-in user, the way PostgREST does: role + JWT claims, per transaction. */
export function asUser<T>(db: PGlite, userId: string, fn: (tx: Transaction) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ])
    await tx.exec('set local role authenticated')
    return fn(tx)
  })
}

/** Run as the service role (the cron worker and OAuth callback). */
export function asService<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ role: 'service_role' }),
    ])
    await tx.exec('set local role service_role')
    return fn(tx)
  })
}

export async function createUser(db: PGlite, id: string, email: string) {
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email])
}

export async function one<T = Record<string, unknown>>(
  tx: Transaction | PGlite,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const res = await tx.query<T>(sql, params)
  if (res.rows.length !== 1) throw new Error(`expected 1 row, got ${res.rows.length}: ${sql}`)
  return res.rows[0]
}
