import { describe, expect, it } from 'vitest'
import { placeholders, render, validateStep, valuesFor } from '@/lib/templates'

describe('render', () => {
  it('fills variables and fallbacks', () => {
    const r = render('Hi {{first_name|there}}, from {{ sender_name }}', { first_name: 'Sam', sender_name: 'Marcell' })
    expect(r).toEqual({ text: 'Hi Sam, from Marcell', missing: [], unknown: [] })
    expect(render('Hi {{first_name|there}}', { first_name: '  ' }).text).toBe('Hi there')
  })

  it('reports a missing value instead of leaving a gap silently', () => {
    const r = render('Hi {{first_name}},', {})
    expect(r.text).toBe('Hi ,')
    expect(r.missing).toEqual(['first_name'])
  })

  it('flags unknown variables', () => {
    expect(render('{{favourite_colour}}', {}).unknown).toEqual(['favourite_colour'])
  })
})

describe('validateStep', () => {
  it('blocks leftover [[placeholders]] in body and subject', () => {
    const problems = validateStep({ position: 1, channel: 'email', subject: 'x [[your company]]', body: 'Hi [[their video]]' })
    expect(problems).toEqual(['Step 1: replace [[their video]]', 'Step 1: replace [[your company]]'])
  })

  it('passes a finished step', () => {
    expect(validateStep({ position: 2, channel: 'email', subject: '', body: 'Hi {{first_name|there}}' })).toEqual([])
  })

  it('finds placeholders', () => {
    expect(placeholders('a [[b]] c [[d e]]')).toEqual(['[[b]]', '[[d e]]'])
  })
})

describe('valuesFor', () => {
  it('derives a first name from the full name', () => {
    expect(valuesFor({ name: 'Sam Rivera' }, 'M').first_name).toBe('Sam')
    expect(valuesFor({ first_name: 'Ana', last_name: 'Li' }, null).name).toBe('Ana Li')
  })
})
