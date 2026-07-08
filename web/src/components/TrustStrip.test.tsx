import { render, screen } from '@testing-library/react'
import { sampleDraft } from '../fixtures'
import { TrustStrip } from './TrustStrip'

// TrustStrip is the "How sure —" line (redesign design lines 190-196): two
// fixed provenance facts (nutrition is USDA-verified, cost is always
// approximate) plus a live count of ungrounded flavor claims, hidden when
// there is nothing to disclose.

test('renders the "how sure" label and the two fixed provenance facts', () => {
  render(<TrustStrip draft={sampleDraft()} />)
  expect(screen.getByText('How sure —')).toBeInTheDocument()
  expect(screen.getByTestId('trust-nutrition')).toHaveTextContent('Nutrition USDA-verified')
  expect(screen.getByTestId('trust-cost')).toHaveTextContent('Cost approximate')
})

test('shows the unverified flavor-claim count, singular', () => {
  const draft = sampleDraft({
    flavor_rationale: [{ claim: 'thyme pairs with chicken', provenance: null, cuisine_context: 'western' }],
  })
  render(<TrustStrip draft={draft} />)
  expect(screen.getByTestId('trust-flavor')).toHaveTextContent('1 flavor claim unverified')
})

test('pluralizes the count when more than one claim is unverified', () => {
  const draft = sampleDraft({
    flavor_rationale: [
      { claim: 'thyme pairs with chicken', provenance: null, cuisine_context: 'western' },
      { claim: 'lemon brightens fat', provenance: null, cuisine_context: 'western' },
    ],
  })
  render(<TrustStrip draft={draft} />)
  expect(screen.getByTestId('trust-flavor')).toHaveTextContent('2 flavor claims unverified')
})

test('hides the row entirely when every claim is grounded', () => {
  const draft = sampleDraft({
    flavor_rationale: [{ claim: 'thyme pairs with chicken', provenance: 'FlavorGraph edge', cuisine_context: 'western' }],
  })
  render(<TrustStrip draft={draft} />)
  expect(screen.queryByTestId('trust-flavor')).not.toBeInTheDocument()
})
