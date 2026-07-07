import { render, screen, fireEvent } from '@testing-library/react'
import UncertaintyLedger from './UncertaintyLedger'
import type { CostAnalysis, NutritionAnalysis } from '../types'

const cost = (over: Partial<CostAnalysis> = {}): CostAnalysis => ({
  total_usd: 8.4, per_serving_usd: 4.2, approximate: false, missing: [], ...over,
})
const nutrition = (over: Partial<NutritionAnalysis> = {}): NutritionAnalysis => ({
  calories: 520, protein_g: 34, fat_g: 40, sat_fat_g: 11,
  carbs_g: 2, fiber_g: 0, sugar_g: 0, sodium_mg: 640, unverified: [], ...over,
})

test('renders nothing when the analysis carries no uncertainty', () => {
  render(<UncertaintyLedger cost={cost()} nutrition={nutrition()} />)
  expect(screen.queryByTestId('uncertainty-ledger')).toBeNull()
})

test('states nutrition and cost uncertainty once, in one mono ledger line', () => {
  render(<UncertaintyLedger
    cost={cost({ approximate: true, missing: ['parsley', 'thyme'] })}
    nutrition={nutrition({ unverified: ['sodium_mg'] })} />)
  const box = screen.getByTestId('uncertainty-ledger')
  expect(box).toHaveTextContent('estimates — nutrition unverified (model claim) · cost approximate, 2 unpriced')
  // one line — not a chip per datum
  expect(screen.queryByText('[unverified] sodium_mg')).toBeNull()
  expect(screen.queryByText('[approximate]')).toBeNull()
})

test('uses the AA warning variant — ink on warning-surface with a warning border, in mono', () => {
  render(<UncertaintyLedger cost={cost({ approximate: true })} nutrition={nutrition()} />)
  const box = screen.getByTestId('uncertainty-ledger')
  expect(box.className).toMatch(/bg-warning-surface/)
  expect(box.className).toMatch(/text-ink/)
  expect(box.className).toMatch(/border-warning/)
  expect(box.className).not.toMatch(/text-warning/)
  expect(box.querySelector('.font-mono')).not.toBeNull()
})

test('expands to the per-item detail the chips used to carry', () => {
  render(<UncertaintyLedger
    cost={cost({ approximate: true, missing: ['flat-leaf parsley'] })}
    nutrition={nutrition({ unverified: ['sodium_mg', 'sugar_g'] })} />)
  const toggle = screen.getByRole('button', { name: /estimates/i })
  const detail = screen.getByTestId('uncertainty-detail')
  // one missing item reads as a singular count in the summary
  expect(toggle).toHaveTextContent('cost approximate, 1 unpriced')
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(detail).not.toBeVisible()
  fireEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
  expect(detail).toBeVisible()
  expect(detail).toHaveTextContent('sodium_mg')
  expect(detail).toHaveTextContent('sugar_g')
  expect(detail).toHaveTextContent('flat-leaf parsley')
})

test('approximate-only cost renders a static line with nothing to expand', () => {
  render(<UncertaintyLedger cost={cost({ approximate: true })} nutrition={nutrition()} />)
  expect(screen.getByTestId('uncertainty-ledger')).toHaveTextContent('estimates — cost approximate')
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.queryByTestId('uncertainty-detail')).toBeNull()
})

test('nutrition-only uncertainty omits the cost clause', () => {
  render(<UncertaintyLedger cost={cost()} nutrition={nutrition({ unverified: ['sodium_mg'] })} />)
  const box = screen.getByTestId('uncertainty-ledger')
  expect(box).toHaveTextContent('estimates — nutrition unverified (model claim)')
  expect(box).not.toHaveTextContent('cost')
})
