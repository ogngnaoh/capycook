import { render, screen, fireEvent } from '@testing-library/react'
import DraftPane, { extractStepMeta, formatQty } from './DraftPane'
import { sampleDraft } from '../fixtures'
import { EMPTY_DRAFT, STATION_CARD } from '../vocab'
import type { Ingredient } from '../types'

const ing = (name: string, qty: number, unit: string, over: Partial<Ingredient> = {}): Ingredient => ({
  name, qty, unit, fdc_id: null, foodon_id: null, ...over,
})

// Real (task 2.8) analysis values arrive as unrounded floats from the
// USDA/cost services; the graybox panel rounds them for display. The
// [approximate] / per-nutrient [unverified] chip pile that used to hang off
// the panel is gone — one uncertainty ledger line states it once (task 11) —
// but the rounded numbers stay in the DOM (collapsed, not removed).
test('renders real analysis numbers rounded, with the uncertainty ledger, not a chip pile', () => {
  const draft = sampleDraft()
  draft.analysis.nutrition = {
    calories: 483.39592,
    protein_g: 3.0455499999999997,
    fat_g: 27.44,
    sat_fat_g: 3.86,
    carbs_g: 58.12,
    fiber_g: 9.02,
    sugar_g: 13,
    sodium_mg: 610.377,
    unverified: ['sodium_mg'],
  }
  draft.analysis.cost = {
    total_usd: 0.6104999,
    per_serving_usd: 0.30525,
    approximate: true,
    missing: ['flat-leaf parsley'],
  }
  render(<DraftPane draft={draft} />)

  expect(screen.getByText('483.4')).toBeInTheDocument()
  expect(screen.getByText('3 g')).toBeInTheDocument()
  expect(screen.getByText('610.4 mg')).toBeInTheDocument()
  expect(screen.getByText(/\$0\.61 total · \$0\.31 \/ serving/)).toBeInTheDocument()
  // the chip pile is gone: no [approximate], no per-nutrient [unverified] chip
  expect(screen.queryByText('[approximate]')).toBeNull()
  expect(screen.queryByText('[unverified] sodium_mg')).toBeNull()
  // one ledger line states cost + nutrition uncertainty; its detail carries
  // the per-item names the chips used to
  expect(screen.getByTestId('uncertainty-ledger'))
    .toHaveTextContent('estimates — nutrition unverified (model claim) · cost approximate, 1 unpriced')
  const detail = screen.getByTestId('uncertainty-detail')
  expect(detail).toHaveTextContent('sodium_mg')
  expect(detail).toHaveTextContent('flat-leaf parsley')
})

// The [unverified] chips OUTSIDE the analysis panel (flavor-rationale claims
// the deterministic layer could not ground) are not this task's concern and
// must survive untouched.
test('flavor-rationale [unverified] chip is left untouched by the ledger', () => {
  render(<DraftPane draft={sampleDraft()} />) // flavor_rationale claim has provenance:null
  expect(screen.getByText('[unverified]')).toBeInTheDocument()
})

// --- notation rule 1: dashboard line ---

test('dashboard line renders serves, cost/serving, and kcal from analysis', () => {
  render(<DraftPane draft={sampleDraft()} />)
  const line = screen.getByTestId('dashboard-line')
  expect(line).toHaveTextContent('SERVES 2')
  expect(line).toHaveTextContent('$4.20/SERVING')
  expect(line).toHaveTextContent('520 kcal')
})

test('dashboard line omits segments whose data is absent', () => {
  // sample ingredients are piece/sprig — no clean mass anchor → no g/PORTION;
  // the data model carries no total time → no ~MIN segment.
  render(<DraftPane draft={sampleDraft()} />)
  const line = screen.getByTestId('dashboard-line')
  expect(line).not.toHaveTextContent('PORTION')
  expect(line).not.toHaveTextContent('MIN')
})

test('dashboard line adds grams/portion when the recipe is all mass', () => {
  const draft = sampleDraft({
    ingredients: [ing('flour', 500, 'g'), ing('water', 350, 'g'), ing('salt', 10, 'g')],
  })
  render(<DraftPane draft={draft} />)
  // 860 g total / 2 servings = 430
  expect(screen.getByTestId('dashboard-line')).toHaveTextContent('430 g/PORTION')
})

test('dashboard line is a collapsed disclosure that expands to the analysis panel', () => {
  render(<DraftPane draft={sampleDraft()} />)
  const toggle = screen.getByRole('button', { name: /cost and nutrition detail/i })
  const panel = screen.getByTestId('analysis-detail')
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(panel).not.toBeVisible()
  fireEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(panel).toBeVisible()
})

// --- notation rule 2: aligned ingredient table ---

test('formatQty joins value and unit with a thin space (U+2009)', () => {
  expect(formatQty(30, 'ml')).toBe('30 ml')
  expect(formatQty(10, 'g')).toBe('10 g')
  expect(formatQty(4, 'piece')).toBe('4 piece')
})

test('ingredient quantity renders in a right-aligned tabular mono cell with the thin space', () => {
  render(<DraftPane draft={sampleDraft()} />)
  const qty = screen.getByTestId('ing-qty-0')
  expect(qty.textContent).toBe('4 piece')
  expect(qty).toHaveClass('text-right', 'tabular-nums')
})

test('omits the baker’s-percent column when units are not all mass', () => {
  render(<DraftPane draft={sampleDraft()} />) // piece / sprig
  expect(screen.queryByText((c) => /%$/.test(c))).toBeNull()
})

test('adds a baker’s-percent column, anchored to the largest mass, when all mass', () => {
  const draft = sampleDraft({
    ingredients: [ing('flour', 500, 'g'), ing('water', 350, 'g'), ing('salt', 10, 'g')],
  })
  render(<DraftPane draft={draft} />)
  expect(screen.getByText('100.0%')).toBeInTheDocument() // flour = anchor
  expect(screen.getByText('70.0%')).toBeInTheDocument() // 350 / 500
  expect(screen.getByText('2.0%')).toBeInTheDocument() // 10 / 500
})

// --- notation rule 3: temps/times pulled out of step prose ---

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
  render(<DraftPane draft={draft} />)
  expect(screen.getByText('204 °C / 400 °F')).toBeInTheDocument()
  expect(screen.getByText('35 min')).toBeInTheDocument()
})

// --- notation rule 4: STATION CARD block ---

test('constraints block is retitled STATION CARD with rows kept verbatim', () => {
  render(<DraftPane draft={sampleDraft()} />)
  expect(screen.getByText(STATION_CARD)).toBeInTheDocument()
  expect(screen.getByText('western')).toBeInTheDocument() // cuisine row kept
})

// --- notation rule 5: provenance ---

test('provenance footer legend renders once per pane', () => {
  render(<DraftPane draft={sampleDraft()} />)
  expect(screen.getByText('sourced — USDA FoodData Central · FoodOn')).toBeInTheDocument()
})

test('per-line provenance ids stay visible on the draft canvas', () => {
  const draft = sampleDraft({
    ingredients: [ing('olive oil', 30, 'ml', { fdc_id: '171413', foodon_id: '03301240' })],
  })
  render(<DraftPane draft={draft} />)
  expect(screen.getByText('fdc:171413')).toBeInTheDocument()
  expect(screen.getByText('foodon:03301240')).toBeInTheDocument()
})

// --- notation rule 6: empty state ---

test('empty draft uses the house empty-draft copy', () => {
  const draft = sampleDraft({ title: '', ingredients: [], steps: [], flavor_rationale: [] })
  render(<DraftPane draft={draft} />)
  expect(screen.getByText(EMPTY_DRAFT)).toBeInTheDocument()
})

test('a workbench-supplied emptyNote still overrides the default', () => {
  const draft = sampleDraft({ title: '', ingredients: [], steps: [], flavor_rationale: [] })
  render(<DraftPane draft={draft} emptyNote="Empty draft — review the proposals below." />)
  expect(screen.getByText('Empty draft — review the proposals below.')).toBeInTheDocument()
})
