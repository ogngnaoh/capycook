import { render, screen } from '@testing-library/react'
import ProposalCard from './ProposalCard'
import type { Proposal } from '../types'

const stub: Proposal = {
  id: 'p1', diff: [{ op: 'add', path: 'ingredients', value: '2 cloves garlic' }],
  rationale: 'Depth.', citations: [{ source: 'USDA FDC', ref: '11215' }],
  confidence: 0.72, unverified: ['cook time is an estimate'], safetyBlock: null,
}

test('renders diff, a citation, confidence, and an [unverified] flag', () => {
  render(<ProposalCard proposal={stub} />)
  expect(screen.getByText(/2 cloves garlic/)).toBeInTheDocument()
  expect(screen.getByText(/USDA FDC/)).toBeInTheDocument()
  expect(screen.getByText(/72%/)).toBeInTheDocument()
  expect(screen.getByText(/\[unverified\]/)).toBeInTheDocument()
})
