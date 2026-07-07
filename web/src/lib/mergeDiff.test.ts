import { sampleDraft } from '../fixtures'
import type { Ingredient, Op } from '../types'
import { mergeDiff } from './mergeDiff'

const ing = (name: string): Ingredient =>
  ({ name, fdc_id: null, foodon_id: null, qty: 1, unit: 'piece' })

test('an untouched draft yields all-same rows and unchanged scalars', () => {
  const view = mergeDiff(sampleDraft(), [])
  expect(view.title).toEqual({ kind: 'same', value: 'Seared Chicken Thighs' })
  expect(view.ingredients.map((r) => r.kind)).toEqual(['same', 'same'])
  expect(view.steps.map((r) => r.kind)).toEqual(['same'])
})

test('a replaced title carries old and new', () => {
  const view = mergeDiff(sampleDraft(), [
    { op: 'replace', path: '/title', from: 'Seared Chicken Thighs', value: 'Crispy Thighs' },
  ])
  expect(view.title).toEqual({ kind: 'changed', value: 'Crispy Thighs', old: 'Seared Chicken Thighs' })
})

test('removed rows stay visible in place, struck; adds insert live', () => {
  // base ingredients: [chicken thigh, thyme]
  const ops: Op[] = [
    { op: 'remove', path: '/ingredients/0' },
    // after the remove, live index 0 is thyme — insert lemon before it
    { op: 'add', path: '/ingredients/0', value: ing('lemon') },
    { op: 'add', path: '/ingredients/-', value: ing('parsley') },
  ]
  const rows = mergeDiff(sampleDraft(), ops).ingredients
  expect(rows.map((r) => [r.kind, (r.value as Ingredient).name])).toEqual([
    ['removed', 'chicken thigh'],
    ['added', 'lemon'],
    ['same', 'thyme'],
    ['added', 'parsley'],
  ])
})

test('a field replace marks the row changed with the old row kept', () => {
  const rows = mergeDiff(sampleDraft(), [
    { op: 'replace', path: '/ingredients/1/qty', from: 2, value: 3 },
  ]).ingredients
  expect(rows[1].kind).toBe('changed')
  expect((rows[1].value as Ingredient).qty).toBe(3)
  expect((rows[1].old as Ingredient).qty).toBe(2)
  expect((rows[1].value as Ingredient).name).toBe('thyme')
})

test('ops outside the recipe sections land in other, labeled', () => {
  const view = mergeDiff(sampleDraft(), [
    { op: 'replace', path: '/constraints/servings', from: 2, value: 4 },
  ])
  expect(view.other).toHaveLength(1)
  expect(view.other[0].label).toBe('Station card — changed')
})

test('unresolvable ops are reported, never thrown', () => {
  const view = mergeDiff(sampleDraft(), [
    { op: 'remove', path: '/ingredients/9' },
  ])
  expect(view.failed).toHaveLength(1)
  expect(view.ingredients.map((r) => r.kind)).toEqual(['same', 'same'])
})
