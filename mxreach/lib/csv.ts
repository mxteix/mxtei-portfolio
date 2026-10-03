/**
 * Small RFC 4180 CSV parser for pasted contact lists: quoted fields,
 * doubled quotes, commas and newlines inside quotes. Also accepts tabs, so a
 * paste straight from a spreadsheet works.
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, '')
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const sep = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ','

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
      continue
    }
    if (ch === '"' && field === '') quoted = true
    else if (ch === sep) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field !== '' || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.map((r) => r.map((f) => f.trim())).filter((r) => r.some((f) => f !== ''))
}

/** Rows as objects keyed by lowercased, trimmed header names. */
export function csvObjects(input: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(input)
  if (!header) return []
  const keys = header.map((h) => h.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''))
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])))
}
