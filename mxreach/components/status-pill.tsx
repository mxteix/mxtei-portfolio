const EMAIL: Record<string, [string, string]> = {
  valid: ['ok', 'verified'],
  accept_all: ['ok', 'accepts all'],
  risky: ['warn', 'risky'],
  unknown: ['', 'unchecked'],
  invalid: ['bad', 'invalid'],
}

/** An email verification status as a coloured pill. */
export function StatusPill({ status }: { status: string }) {
  const [tone, label] = EMAIL[status] ?? ['', status]
  return <span className={`pill ${tone}`}>{label}</span>
}
