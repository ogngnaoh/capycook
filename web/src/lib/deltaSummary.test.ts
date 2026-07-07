import { sampleDraft } from '../fixtures'
import type { Ingredient, Op } from '../types'
import { deltaSummary } from './deltaSummary'

const ing = (name: string): Ingredient =>
  ({ name, fdc_id: null, foodon_id: null, qty: 1, unit: 'piece' })

test('added and removed ingredients summarize by name', () => {
  const ops: Op[] = [
    { op: 'add', path: '/ingredients/-', value: ing('lemon') },
    { op: 'remove', path: '/ingredients/1' },
  ]
  expect(deltaSummary(ops, sampleDraft())).toBe('+ lemon · − thyme')
})

test('a field change on an ingredient names it from the base draft', () => {
  const ops: Op[] = [{ op: 'replace', path: '/ingredients/0/qty', from: 4, value: 6 }]
  expect(deltaSummary(ops, sampleDraft())).toBe('chicken thigh changed')
})

test('a retitle quotes the new title', () => {
  const ops: Op[] = [{ op: 'replace', path: '/title', value: 'Crispy Thighs' }]
  expect(deltaSummary(ops, sampleDraft())).toBe('retitled "Crispy Thighs"')
})

test('method changes count by section; without a base draft names degrade gracefully', () => {
  const ops: Op[] = [
    { op: 'add', path: '/steps/-', value: { text: 'Rest 5 min.', technique: 'rest', internal_temp_c: null, why: '' } },
    { op: 'replace', path: '/steps/0/text', value: 'Sear hard.' },
  ]
  expect(deltaSummary(ops)).toBe('Method — 2 changes')
})

test('long deltas truncate with a remainder count', () => {
  const ops: Op[] = [
    { op: 'add', path: '/ingredients/-', value: ing('lemon') },
    { op: 'add', path: '/ingredients/-', value: ing('parsley') },
    { op: 'add', path: '/ingredients/-', value: ing('capers') },
    { op: 'add', path: '/ingredients/-', value: ing('dill') },
    { op: 'replace', path: '/title', value: 'New' },
  ]
  expect(deltaSummary(ops, sampleDraft())).toBe('+ lemon · + parsley · + capers · +2 more')
})

test('no ops reads as no changes', () => {
  expect(deltaSummary([], sampleDraft())).toBe('no changes')
})
