import { sampleDraft } from '../fixtures'
import type { Ingredient, Op } from '../types'
import { applyOps } from './applyOps'

const newIngredient = (name: string): Ingredient =>
  ({ name, fdc_id: null, foodon_id: null, qty: 1, unit: 'piece' })

test('replace on a top-level scalar produces the post-move draft', () => {
  const { draft } = applyOps(sampleDraft(), [
    { op: 'replace', path: '/title', from: 'Seared Chicken Thighs', value: 'Crispy Chicken Thighs' },
  ])
  expect(draft.title).toBe('Crispy Chicken Thighs')
})

test('replace reaches into array elements by index', () => {
  const { draft } = applyOps(sampleDraft(), [
    { op: 'replace', path: '/ingredients/1/qty', from: 2, value: 3 },
  ])
  expect(draft.ingredients?.[1].qty).toBe(3)
})

test('add at an index inserts and shifts; add at - appends', () => {
  const { draft } = applyOps(sampleDraft(), [
    { op: 'add', path: '/ingredients/1', value: newIngredient('lemon') },
    { op: 'add', path: '/ingredients/-', value: newIngredient('parsley') },
  ])
  expect(draft.ingredients?.map((i) => i.name))
    .toEqual(['chicken thigh', 'lemon', 'thyme', 'parsley'])
})

test('remove deletes the array element', () => {
  const { draft } = applyOps(sampleDraft(), [
    { op: 'remove', path: '/steps/0' },
  ])
  expect(draft.steps).toEqual([])
})

test('add materializes a null array (Go nil slice)', () => {
  const base = sampleDraft({ ingredients: null })
  const { draft } = applyOps(base, [
    { op: 'add', path: '/ingredients/-', value: newIngredient('salt') },
  ])
  expect(draft.ingredients?.map((i) => i.name)).toEqual(['salt'])
})

test('the input draft is never mutated', () => {
  const base = sampleDraft()
  const frozen = JSON.stringify(base)
  applyOps(base, [
    { op: 'replace', path: '/title', value: 'Changed' },
    { op: 'remove', path: '/steps/0' },
  ])
  expect(JSON.stringify(base)).toBe(frozen)
})

test('an unresolvable op is reported, the rest still apply', () => {
  const ops: Op[] = [
    { op: 'replace', path: '/no_such/field', value: 1 },
    { op: 'replace', path: '/title', value: 'Still Applied' },
    { op: 'remove', path: '/ingredients/9' },
  ]
  const { draft, failed } = applyOps(sampleDraft(), ops)
  expect(draft.title).toBe('Still Applied')
  expect(failed).toEqual([ops[0], ops[2]])
})

test('JSON Pointer escapes ~1 and ~0 resolve', () => {
  const odd = { 'a/b': 1, 'c~d': 2 } as unknown as Record<string, number>
  const base = sampleDraft({ analysis: { ...sampleDraft().analysis, ...( { odd } as object) } })
  const { draft } = applyOps(base, [
    { op: 'replace', path: '/analysis/odd/a~1b', value: 10 },
    { op: 'replace', path: '/analysis/odd/c~0d', value: 20 },
  ])
  const out = (draft.analysis as unknown as { odd: Record<string, number> }).odd
  expect(out['a/b']).toBe(10)
  expect(out['c~d']).toBe(20)
})
