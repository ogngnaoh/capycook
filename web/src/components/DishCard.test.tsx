import { render, screen } from '@testing-library/react'
import { sampleDraft } from '../fixtures'
import type { Ingredient, Op } from '../types'
import { mergeDiff } from '../lib/mergeDiff'
import { SR_ADDED, SR_REMOVED, SR_WAS } from '../vocab'
import DishCard, { extractStepMeta, formatQty } from './DishCard'

const ing = (name: string, qty: number, unit: string, over: Partial<Ingredient> = {}): Ingredient => ({
  name, qty, unit, fdc_id: null, foodon_id: null, ...over,
})

// --- plain mode ---

test('plain mode renders every section with no diff tint classes', () => {
  const { container } = render(<DishCard draft={sampleDraft()} technical={false} showDetail />)
  const card = screen.getByTestId('dish-card')
  expect(card).toHaveTextContent('Seared Chicken Thighs')
  expect(card).toHaveTextContent('chicken thigh')
  expect(card).toHaveTextContent('Sear skin-side down until crisp.')
  expect(card).toHaveTextContent('thyme pairs with chicken')
  expect(card).toHaveTextContent('Cooking for')
  expect(container.querySelectorAll('.row-add, .row-change').length).toBe(0)
})

test('the station card gives every constraint field a home, cuisine included', () => {
  render(<DishCard draft={sampleDraft()} technical={false} showDetail={false} />)
  const card = screen.getByTestId('dish-card')
  for (const key of ['skill', 'serves', 'avoid', 'dietary', 'equipment', 'on hand', 'cuisine']) {
    expect(card).toHaveTextContent(key)
  }
  expect(card).toHaveTextContent('western') // cuisine value, kept from the old DraftPane
  expect(card).toHaveTextContent('—') // empty array fields render the dash, not a blank
})

// --- diff mode: ingredients ---

test('diff mode: an added ingredient row carries row-add, a New chip, and the SR_ADDED prefix', () => {
  const base = sampleDraft()
  const ops: Op[] = [{ op: 'add', path: '/ingredients/-', value: ing('lemon', 1, 'piece') }]
  const diff = mergeDiff(base, ops)
  render(<DishCard draft={base} diff={diff} technical={false} showDetail={false} />)
  const row = screen.getAllByTestId('ingredient-row').find((r) => r.textContent?.includes('lemon'))!
  expect(row.className).toMatch(/row-add/)
  expect(row).toHaveTextContent('New')
  expect(row.textContent).toContain(SR_ADDED)
})

test('diff mode: a changed ingredient row carries row-change and shows the struck old qty', () => {
  const base = sampleDraft()
  const ops: Op[] = [{ op: 'replace', path: '/ingredients/1/qty', from: 2, value: 3 }]
  const diff = mergeDiff(base, ops)
  render(<DishCard draft={base} diff={diff} technical={false} showDetail={false} />)
  const row = screen.getAllByTestId('ingredient-row').find((r) => r.textContent?.includes('thyme'))!
  expect(row.className).toMatch(/row-change/)
  expect(row).toHaveTextContent('3 sprig')
  const struck = row.querySelector('.line-through')
  expect(struck).toHaveTextContent('2 sprig')
  expect(struck?.textContent).toContain(SR_WAS)
})

test('diff mode: a removed ingredient row is struck, carries no tint class, and is SR_REMOVED-prefixed', () => {
  const base = sampleDraft()
  const ops: Op[] = [{ op: 'remove', path: '/ingredients/1' }]
  const diff = mergeDiff(base, ops)
  render(<DishCard draft={base} diff={diff} technical={false} showDetail={false} />)
  const row = screen.getAllByTestId('ingredient-row').find((r) => r.textContent?.includes('thyme'))!
  expect(row.className).not.toMatch(/row-add|row-change/)
  expect(row.querySelector('.line-through')).not.toBeNull()
  expect(row.textContent).toContain(SR_REMOVED)
})

// --- diff mode: steps ---

test('diff mode: an added step row carries row-add and the New chip', () => {
  const base = sampleDraft()
  const ops: Op[] = [{
    op: 'add', path: '/steps/-',
    value: { text: 'Rest 5 minutes.', technique: 'rest', internal_temp_c: null, why: 'carryover cooking' },
  }]
  const diff = mergeDiff(base, ops)
  render(<DishCard draft={base} diff={diff} technical={false} showDetail={false} />)
  const row = screen.getAllByTestId('step-row').find((r) => r.textContent?.includes('Rest 5 minutes.'))!
  expect(row.className).toMatch(/row-add/)
  expect(row).toHaveTextContent('New')
})

// --- diff mode: header concept ---

test('diff mode: a concept change shows the Reworked badge and the struck old concept', () => {
  const base = sampleDraft()
  const newConcept = 'A lighter herb-forward pan sauce.'
  const ops: Op[] = [{ op: 'replace', path: '/concept', from: base.concept, value: newConcept }]
  const diff = mergeDiff(base, ops)
  render(<DishCard draft={base} diff={diff} technical={false} showDetail={false} />)
  const card = screen.getByTestId('dish-card')
  expect(screen.getByText('Reworked')).toBeInTheDocument()
  expect(card).toHaveTextContent(newConcept)
  const struck = card.querySelector('.line-through')
  expect(struck).toHaveTextContent(base.concept)
  expect(struck?.textContent).toContain(SR_WAS)
})

// --- flavor rationale provenance ---

test('flavor rationale: a null-provenance claim gets the unverified chip, a grounded one gets the check', () => {
  const draft = sampleDraft({
    flavor_rationale: [
      { claim: 'thyme pairs with chicken', provenance: null, cuisine_context: 'western' },
      { claim: 'lemon brightens fat', provenance: 'FlavorGraph edge', cuisine_context: 'western' },
    ],
  })
  render(<DishCard draft={draft} technical={false} showDetail={false} />)
  const rows = screen.getAllByTestId('flavor-row')
  const unverifiedRow = rows.find((r) => r.textContent?.includes('thyme'))!
  const groundedRow = rows.find((r) => r.textContent?.includes('lemon'))!
  expect(unverifiedRow).toHaveTextContent('unverified')
  expect(groundedRow).toHaveTextContent('✓ FlavorGraph edge')
})

// --- dashboard: cost approximation ---

test('the cost/serving dashboard cell never renders without the approx tag', () => {
  render(<DishCard draft={sampleDraft()} technical={false} showDetail={false} />)
  const card = screen.getByTestId('dish-card')
  expect(card).toHaveTextContent('$4.20')
  expect(card).toHaveTextContent('approx')
})

// --- showDetail gate ---

test('showDetail=false hides the cost and nutrition panels', () => {
  render(<DishCard draft={sampleDraft()} technical={false} showDetail={false} />)
  expect(screen.queryByText(/Cost — approximate/)).not.toBeInTheDocument()
  expect(screen.queryByText(/Nutrition — USDA-verified/)).not.toBeInTheDocument()
})

test('showDetail=true lists cost.missing ingredients', () => {
  const draft = sampleDraft()
  draft.analysis.cost.missing = ['flat-leaf parsley']
  render(<DishCard draft={draft} technical={false} showDetail />)
  expect(screen.getByText('Excludes flat-leaf parsley — no price on file.')).toBeInTheDocument()
})

test('showDetail=true prints "All ingredients priced." when nothing is missing', () => {
  render(<DishCard draft={sampleDraft()} technical={false} showDetail />)
  expect(screen.getByText('All ingredients priced.')).toBeInTheDocument()
})

// --- technical view ---

test('technical view shows fdc/foodon id chips and the JSON-Pointer ops lines', () => {
  const draft = sampleDraft({
    ingredients: [ing('olive oil', 30, 'ml', { fdc_id: '171413', foodon_id: '03301240' })],
  })
  const ops: Op[] = [{ op: 'replace', path: '/title', from: 'Old', value: 'New' }]
  render(<DishCard draft={draft} ops={ops} technical showDetail={false} />)
  expect(screen.getByText('fdc:171413')).toBeInTheDocument()
  expect(screen.getByText('foodon:03301240')).toBeInTheDocument()
  const opsBlock = screen.getByText('Structured diff · JSON-Pointer ops').parentElement!
  expect(opsBlock).toHaveTextContent('replace')
  expect(opsBlock).toHaveTextContent('/title')
})

test('the ops block is absent without technical, or without ops', () => {
  const ops: Op[] = [{ op: 'replace', path: '/title', from: 'Old', value: 'New' }]
  const { rerender } = render(<DishCard draft={sampleDraft()} ops={ops} technical={false} showDetail={false} />)
  expect(screen.queryByText('Structured diff · JSON-Pointer ops')).not.toBeInTheDocument()
  rerender(<DishCard draft={sampleDraft()} ops={null} technical showDetail={false} />)
  expect(screen.queryByText('Structured diff · JSON-Pointer ops')).not.toBeInTheDocument()
})

// --- unpreviewable disclosure (DiffView.failed / .other) ---

test('failed or other diff changes surface a muted disclosure line above the card', () => {
  const base = sampleDraft()
  const ops: Op[] = [{ op: 'replace', path: '/analysis/nutrition/sodium_mg', from: 640, value: 500 }]
  const diff = mergeDiff(base, ops)
  render(<DishCard draft={base} diff={diff} technical={false} showDetail={false} />)
  expect(screen.getByText(/Some changes could not be previewed/)).toBeInTheDocument()
  expect(screen.getByText(/Analysis — changed/)).toBeInTheDocument()
})

test('a failed-only diff still discloses, with the failed op labeled', () => {
  const base = sampleDraft()
  // Out-of-range array index — mergeDiff routes this to `failed`, not `other`.
  const ops: Op[] = [{ op: 'replace', path: '/ingredients/99/qty', value: 5 }]
  const diff = mergeDiff(base, ops)
  expect(diff.failed).toHaveLength(1)
  expect(diff.other).toHaveLength(0)
  render(<DishCard draft={base} diff={diff} technical={false} showDetail={false} />)
  const line = screen.getByTestId('dish-card-unpreviewable')
  expect(line).toHaveTextContent('Some changes could not be previewed — accepting still applies them.')
  expect(line).toHaveTextContent('Ingredients — changed')
})

test('the disclosure line does not appear in plain mode', () => {
  render(<DishCard draft={sampleDraft()} technical={false} showDetail={false} />)
  expect(screen.queryByText(/Some changes could not be previewed/)).not.toBeInTheDocument()
})

// --- formatQty / extractStepMeta (moved from DraftPane.test.tsx — task 5 owns
// its own verbatim copy; DraftPane keeps its own until task 9 retires it) ---

test('formatQty joins value and unit with a thin space (U+2009)', () => {
  expect(formatQty(30, 'ml')).toBe('30 ml')
  expect(formatQty(10, 'g')).toBe('10 g')
  expect(formatQty(4, 'piece')).toBe('4 piece')
})

test('extractStepMeta pulls paired temps and times out of step prose', () => {
  expect(extractStepMeta('Roast at 204 °C / 400 °F for 35 min')).toEqual(['204 °C / 400 °F', '35 min'])
  expect(extractStepMeta('Bake at 400 °F for 1 hour')).toEqual(['400 °F', '1 hr'])
  expect(extractStepMeta('Rest 10 minutes, then slice')).toEqual(['10 min'])
  expect(extractStepMeta('204°C')).toEqual(['204 °C'])
})

test('extractStepMeta returns nothing when there is no temp or time', () => {
  expect(extractStepMeta('Sear skin-side down until crisp.')).toEqual([])
  expect(extractStepMeta('Add 1 cup flour and a pinch of salt')).toEqual([])
})

test('step temps/times surface as trailing chips on the step row', () => {
  const draft = sampleDraft({
    steps: [{ text: 'Roast at 204 °C / 400 °F for 35 min', technique: 'roast', internal_temp_c: null, why: '' }],
  })
  render(<DishCard draft={draft} technical={false} showDetail={false} />)
  expect(screen.getByText('204 °C / 400 °F')).toBeInTheDocument()
  expect(screen.getByText('35 min')).toBeInTheDocument()
})
