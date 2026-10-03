import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { optionalEnv } from '@/lib/env'
import { tick } from '@/lib/engine/tick'
import { createServiceClient } from '@/lib/supabase/server'

export const maxDuration = 60

function authorized(request: NextRequest): boolean {
  const secret = optionalEnv('CRON_SECRET')
  if (!secret) return false // not configured: nobody gets in
  const given = Buffer.from(request.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * The worker, every five minutes: replies → drafts → sends. Vercel Cron
 * calls it with "Authorization: Bearer $CRON_SECRET"; anything else can
 * call it the same way (see README for a Supabase pg_cron alternative).
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const result = await tick(createServiceClient())
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('tick failed', e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
