import type { Op } from '../types'
import { opLineLabel, sectionLabel } from './pathLabels'

test('pointer paths resolve to cook-vocabulary sections, never wire names', () => {
  expect(sectionLabel('/title')).toBe('Title')
  expect(sectionLabel('/concept')).toBe('Concept')
  expect(sectionLabel('/ingredients/2')).toBe('Ingredients')
  expect(sectionLabel('/ingredients/2/qty')).toBe('Ingredients')
  expect(sectionLabel('/steps/1')).toBe('Method')
  expect(sectionLabel('/steps/1/text')).toBe('Method')
  expect(sectionLabel('/flavor_rationale/0')).toBe("Chef's notes")
  expect(sectionLabel('/constraints/allergens')).toBe('Station card')
  expect(sectionLabel('/analysis/cost/total_usd')).toBe('Analysis')
})

test('an unknown path falls back to a readable form, not the raw pointer', () => {
  expect(sectionLabel('/future_field/3')).toBe('Future field')
})

test('op line labels pair the section with what happened', () => {
  const op = (o: Op['op'], path: string): Op => ({ op: o, path })
  expect(opLineLabel(op('replace', '/ingredients/1/qty'))).toBe('Ingredients — changed')
  expect(opLineLabel(op('add', '/ingredients/-'))).toBe('Ingredients — added')
  expect(opLineLabel(op('remove', '/steps/0'))).toBe('Method — removed')
})
