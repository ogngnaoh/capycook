import { render, screen } from '@testing-library/react'
import DraftPane from './DraftPane'
import { sampleDraft } from '../fixtures'

// Real (task 2.8) analysis values arrive as unrounded floats from the
// USDA/cost services; the graybox panel rounds them for display and keeps
// the [approximate] / [unverified] chips and the never-$0 footnote.
test('renders real analysis numbers rounded, with chips and footnote', () => {
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
  expect(screen.getByText('[approximate]')).toBeInTheDocument()
  expect(screen.getByText('[unverified] sodium_mg')).toBeInTheDocument()
  expect(screen.getByText(/unpriced \(excluded\): flat-leaf parsley/)).toBeInTheDocument()
})
