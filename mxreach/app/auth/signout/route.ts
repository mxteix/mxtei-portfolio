import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  await createServerClient().auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}
