'use server'

import { revalidatePath } from 'next/cache'
import type { FormState } from '@/components/action-form'
import type { Channel } from '@/lib/channels'
import { csvObjects } from '@/lib/csv'
import { runFinder, verifier, type FinderContact } from '@/lib/finder'
import type { FinderBranch } from '@/lib/finder/types'
import { isEmail } from '@/lib/mail/mime'
import { limitsFor, monthStart } from '@/lib/plans'
import { getSession } from '@/lib/session'
import { createServiceClient } from '@/lib/supabase/server'

const DEFAULT_BRANCHES: FinderBranch[] = ['public_page', 'domain_api']
const BULK_FIND = 10
const MAX_IMPORT = 500

type ContactFields = {
  name: string
  email: string
  company: string
  domain: string
  website: string
  instagram: string
  discord: string
  linkedin: string
  preset: string
}

function clean(v: FormDataEntryValue | string | null | undefined): string {
  return String(v ?? '').trim()
}

function splitName(name: string) {
  const parts = name.split(/\s+/).filter(Boolean)
  return { first_name: parts[0] ?? null, last_name: parts.length > 1 ? parts.slice(1).join(' ') : null }
}

/** Validate one contact; returns the rows to insert or a reason it can't be. */
function prepare(f: ContactFields, presets: Set<string>) {
  const email = f.email.toLowerCase()
  if (!f.name && !email) return { error: 'needs at least a name or an email' }
  if (email && !isEmail(email)) return { error: `"${f.email}" isn't a valid email` }
  if (f.discord && !/^\d{17,20}$/.test(f.discord)) {
    return { error: 'Discord needs the numeric user ID (Developer Mode → right-click → Copy User ID), not the username' }
  }
  if (f.preset && !presets.has(f.preset)) return { error: `unknown preset "${f.preset}"` }

  const channels: { channel: Channel; handle: string }[] = []
  if (f.instagram) channels.push({ channel: 'instagram', handle: f.instagram.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '') })
  if (f.discord) channels.push({ channel: 'discord', handle: f.discord })
  if (f.linkedin) channels.push({ channel: 'linkedin', handle: f.linkedin })

  return {
    contact: {
      name: f.name || null,
      ...splitName(f.name),
      email: email || null,
      email_source: email ? 'manual' : null,
      company: f.company || null,
      company_domain: f.domain.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase() || null,
      website_url: f.website || null,
      preset_id: f.preset || null,
    },
    channels,
  }
}

async function presetIds(supabase: Awaited<ReturnType<typeof getSession>>['supabase']) {
  const { data } = await supabase.from('presets').select('id')
  return new Set((data ?? []).map((p) => p.id as string))
}

export async function addContact(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, workspace } = await getSession()
  const p = prepare(
    {
      name: clean(form.get('name')),
      email: clean(form.get('email')),
      company: clean(form.get('company')),
      domain: clean(form.get('domain')),
      website: clean(form.get('website')),
      instagram: clean(form.get('instagram')),
      discord: clean(form.get('discord')),
      linkedin: clean(form.get('linkedin')),
      preset: clean(form.get('preset')),
    },
    await presetIds(supabase),
  )
  if ('error' in p) return { ok: false, message: `Can't add this contact: ${p.error}.` }

  const { data, error } = await supabase
    .from('contacts')
    .insert({ workspace_id: workspace.id, ...p.contact })
    .select('id')
    .single()
  if (error) {
    return { ok: false, message: error.code === '23505' ? 'You already have a contact with that email.' : error.message }
  }
  if (p.channels.length) {
    await supabase.from('contact_channels').insert(p.channels.map((c) => ({ ...c, workspace_id: workspace.id, contact_id: data.id })))
  }
  revalidatePath('/contacts')
  return { ok: true, message: 'Added.' }
}

export async function importContacts(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase, workspace } = await getSession()
  const rows = csvObjects(clean(form.get('csv')))
  if (!rows.length) return { ok: false, message: 'Paste a CSV with a header row first.' }
  if (rows.length > MAX_IMPORT) return { ok: false, message: `That's ${rows.length} rows; import up to ${MAX_IMPORT} at a time.` }

  const presets = await presetIds(supabase)
  const fallbackPreset = clean(form.get('preset'))

  const { data: existing } = await supabase.from('contacts').select('email').eq('workspace_id', workspace.id).not('email', 'is', null)
  const seen = new Set((existing ?? []).map((c) => c.email as string))

  const errors: string[] = []
  let added = 0
  let duplicates = 0

  for (const [i, r] of rows.entries()) {
    const p = prepare(
      {
        name: r.name ?? r.full_name ?? [r.first_name, r.last_name].filter(Boolean).join(' '),
        email: r.email ?? '',
        company: r.company ?? '',
        domain: r.domain ?? r.company_domain ?? '',
        website: r.website ?? r.url ?? r.link ?? '',
        instagram: r.instagram ?? '',
        discord: r.discord ?? r.discord_id ?? '',
        linkedin: r.linkedin ?? '',
        preset: r.preset || fallbackPreset,
      },
      presets,
    )
    if ('error' in p) {
      errors.push(`row ${i + 2}: ${p.error}`)
      continue
    }
    if (p.contact.email && seen.has(p.contact.email)) {
      duplicates++
      continue
    }
    const { data, error } = await supabase
      .from('contacts')
      .insert({ workspace_id: workspace.id, ...p.contact })
      .select('id')
      .single()
    if (error) {
      errors.push(`row ${i + 2}: ${error.message}`)
      continue
    }
    if (p.contact.email) seen.add(p.contact.email)
    if (p.channels.length) {
      await supabase.from('contact_channels').insert(p.channels.map((c) => ({ ...c, workspace_id: workspace.id, contact_id: data.id })))
    }
    added++
  }

  revalidatePath('/contacts')
  const parts = [`Imported ${added}.`]
  if (duplicates) parts.push(`${duplicates} already existed.`)
  if (errors.length) parts.push(`Skipped ${errors.length}: ${errors.slice(0, 5).join('; ')}${errors.length > 5 ? '…' : ''}`)
  return { ok: errors.length === 0 || added > 0, message: parts.join(' ') }
}

/** Distinct contacts found this month, the plan's "new contacts" allowance. */
async function usedThisMonth(supabase: Awaited<ReturnType<typeof getSession>>['supabase'], workspaceId: string) {
  const { data } = await supabase
    .from('lookups')
    .select('contact_id')
    .eq('workspace_id', workspaceId)
    .eq('outcome', 'found')
    .in('branch', ['cache', 'domain_api', 'public_page'])
    .gte('created_at', monthStart().toISOString())
    .limit(20_000)
  return new Set((data ?? []).map((r) => r.contact_id)).size
}

async function findFor(contactIds: string[]): Promise<{ found: number; missed: number; duplicates: number; limited: boolean }> {
  const { supabase, workspace } = await getSession()
  const service = createServiceClient()
  const limit = limitsFor(workspace.plan).contactsPerMonth
  let used = await usedThisMonth(supabase, workspace.id)
  const out = { found: 0, missed: 0, duplicates: 0, limited: false }

  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, workspace_id, name, first_name, last_name, company, company_domain, website_url, preset_id, preset:presets ( finders )')
    .in('id', contactIds)
  for (const c of (contacts ?? []) as unknown as (FinderContact & { preset: { finders: FinderBranch[] } | null })[]) {
    if (used >= limit) {
      out.limited = true
      break
    }
    const { result } = await runFinder({ contact: c, branches: c.preset?.finders ?? DEFAULT_BRANCHES, service, user: supabase })
    if (!result) {
      out.missed++
      continue
    }
    const { error } = await supabase
      .from('contacts')
      .update({ email: result.email, email_status: result.status, email_source: result.source })
      .eq('id', c.id)
    if (error?.code === '23505') {
      // Another contact already has this address: leave this one alone.
      out.duplicates++
      continue
    }
    if (error) throw new Error(`save email: ${error.message}`)
    out.found++
    used++
  }
  revalidatePath('/contacts')
  return out
}

export async function findEmailAction(_prev: FormState, form: FormData): Promise<FormState> {
  const id = clean(form.get('id'))
  try {
    const r = await findFor([id])
    if (r.limited) return { ok: false, message: "This month's contact allowance is used up." }
    if (r.duplicates) return { ok: false, message: 'Found an address that another of your contacts already has.' }
    return { ok: r.found > 0, message: r.found ? 'Found and checked.' : 'Nothing found. See "Last lookup" for why.' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

export async function findMissingAction(_prev: FormState): Promise<FormState> {
  const { supabase, workspace } = await getSession()
  const { data } = await supabase
    .from('contacts')
    .select('id')
    .eq('workspace_id', workspace.id)
    .is('email', null)
    .order('created_at', { ascending: true })
    .limit(BULK_FIND)
  const ids = (data ?? []).map((c) => c.id as string)
  if (!ids.length) return { ok: true, message: 'Every contact already has an email.' }
  const r = await findFor(ids)
  return {
    ok: true,
    message: `Tried ${ids.length}: found ${r.found}, nothing for ${r.missed}.${r.limited ? " Stopped: this month's allowance is used up." : ''}`,
  }
}

export async function verifyEmailAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await getSession()
  const id = clean(form.get('id'))
  const { data: c } = await supabase.from('contacts').select('id, workspace_id, email, preset_id').eq('id', id).single()
  if (!c?.email) return { ok: false, message: 'No email to check.' }

  const v = await verifier()(c.email)
  await supabase.from('contacts').update({ email_status: v.status }).eq('id', id)
  await supabase.from('lookups').insert({
    workspace_id: c.workspace_id,
    contact_id: c.id,
    preset_id: c.preset_id,
    branch: 'verify',
    outcome: v.status === 'invalid' ? 'not_found' : 'found',
    email: c.email,
    detail: v.detail,
  })
  revalidatePath('/contacts')
  return { ok: v.status !== 'invalid', message: v.detail }
}

export async function deleteContactAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { supabase } = await getSession()
  const { error } = await supabase.from('contacts').delete().eq('id', clean(form.get('id')))
  if (error) return { ok: false, message: error.message }
  revalidatePath('/contacts')
  return { ok: true, message: 'Deleted.' }
}
