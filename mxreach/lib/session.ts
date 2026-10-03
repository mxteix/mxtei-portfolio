import { cache } from 'react'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export type Workspace = {
  id: string
  name: string
  plan: string
  sender_name: string | null
  sender_address: string | null
}

/**
 * The signed-in user and their workspace, once per request. Redirects to
 * /login when there's no valid session: the proxy's check is only optimistic.
 */
export const getSession = cache(async () => {
  // Per-user, so never prerendered at build time.
  await connection()
  const supabase = createServerClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) redirect('/login')

  const { data: wsId, error } = await supabase.rpc('ensure_workspace')
  if (error || !wsId) throw new Error(`workspace: ${error?.message ?? 'none'}`)

  const { data: workspace, error: wsError } = await supabase
    .from('workspaces')
    .select('id, name, plan, sender_name, sender_address')
    .eq('id', wsId)
    .single()
  if (wsError || !workspace) throw new Error(`workspace: ${wsError?.message ?? 'not found'}`)

  return {
    supabase,
    userId: claims.sub as string,
    email: (claims.email as string | undefined) ?? null,
    workspace: workspace as Workspace,
  }
})
