/**
 * Message templates.
 *
 *   {{first_name}}          the contact's first name
 *   {{first_name|there}}    ...or "there" when it's empty
 *   [[your offer]]          a placeholder the user must replace before the
 *                           sequence can be activated
 *
 * A variable with no value and no fallback is reported as missing rather than
 * rendered as an empty gap, so "Hi ," never goes out on its own.
 */

export const TEMPLATE_VARS = [
  'first_name',
  'last_name',
  'name',
  'company',
  'role_title',
  'sender_name',
] as const

export type TemplateVar = (typeof TEMPLATE_VARS)[number]
export type TemplateValues = Partial<Record<TemplateVar, string | null>>

const VAR = /\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g
const PLACEHOLDER = /\[\[[^\]]*\]\]/g

export type Rendered = { text: string; missing: string[]; unknown: string[] }

export function render(template: string, values: TemplateValues): Rendered {
  const missing = new Set<string>()
  const unknown = new Set<string>()

  const text = template.replace(VAR, (_, name: string, fallback: string | undefined) => {
    if (!(TEMPLATE_VARS as readonly string[]).includes(name)) {
      unknown.add(name)
      return ''
    }
    const value = values[name as TemplateVar]?.trim()
    if (value) return value
    if (fallback !== undefined) return fallback.trim()
    missing.add(name)
    return ''
  })

  return { text, missing: [...missing], unknown: [...unknown] }
}

/** [[...]] placeholders left in a template. */
export function placeholders(template: string): string[] {
  return template.match(PLACEHOLDER) ?? []
}

/** Problems that block activating a sequence, one line each. */
export function validateStep(step: { position: number; subject: string | null; body: string; channel: string }) {
  const problems: string[] = []
  const label = `Step ${step.position}`
  const texts = [step.body, step.subject ?? '']

  for (const t of texts) {
    for (const p of placeholders(t)) problems.push(`${label}: replace ${p}`)
    const { unknown } = render(t, {})
    for (const u of unknown) problems.push(`${label}: unknown variable {{${u}}}`)
  }
  if (!step.body.trim()) problems.push(`${label}: the message is empty`)
  return [...new Set(problems)]
}

/** Values for a contact plus the sender. */
export function valuesFor(
  contact: { name?: string | null; first_name?: string | null; last_name?: string | null; company?: string | null; role_title?: string | null },
  senderName: string | null,
): TemplateValues {
  const first = contact.first_name ?? contact.name?.trim().split(/\s+/)[0] ?? null
  return {
    first_name: first,
    last_name: contact.last_name ?? null,
    name: contact.name ?? ([contact.first_name, contact.last_name].filter(Boolean).join(' ') || null),
    company: contact.company ?? null,
    role_title: contact.role_title ?? null,
    sender_name: senderName,
  }
}
