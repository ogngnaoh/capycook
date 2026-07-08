import { render, screen } from '@testing-library/react'
import { sampleProposal } from '../fixtures'
import ProposalHeader from './ProposalHeader'

test('renders the fixed headline and the rationale', () => {
  render(<ProposalHeader proposal={sampleProposal({ rationale: 'A tighter concept.' })}
    streaming={false} technical={false} />)
  expect(screen.getByRole('heading', { name: "Here's the change I'd make" })).toBeInTheDocument()
  expect(screen.getByText('A tighter concept.')).toBeInTheDocument()
})

test('technical shows the raw move type and rounded confidence percent', () => {
  render(<ProposalHeader proposal={sampleProposal({ move_type: 'flavor_direction', confidence: 0.723 })}
    streaming={false} technical />)
  expect(screen.getByText('flavor_direction · conf 72%')).toBeInTheDocument()
})

test('technical off hides the meta line — confidence never gates anything, it just may not show', () => {
  render(<ProposalHeader proposal={sampleProposal()} streaming={false} technical={false} />)
  expect(screen.queryByText(/conf \d+%/)).not.toBeInTheDocument()
})

test('citations render as `source · ref` chips', () => {
  render(<ProposalHeader proposal={sampleProposal({
    citations: [{ source: 'USDA FDC', ref: '11215', date: '2026-07-06' }],
  })} streaming={false} technical={false} />)
  expect(screen.getByText('USDA FDC · 11215')).toBeInTheDocument()
})

test('unverified claims get a muted field home', () => {
  render(<ProposalHeader proposal={sampleProposal({ unverified: ['cook time is an estimate'] })}
    streaming={false} technical={false} />)
  expect(screen.getByText(/unverified:.*cook time is an estimate/)).toBeInTheDocument()
})

test('streaming renders the rationale with a blinking caret; settled has none', () => {
  const { rerender } = render(<ProposalHeader proposal={sampleProposal()} streaming technical={false} />)
  expect(screen.getByTestId('proposal-header-caret')).toBeInTheDocument()
  rerender(<ProposalHeader proposal={sampleProposal()} streaming={false} technical={false} />)
  expect(screen.queryByTestId('proposal-header-caret')).not.toBeInTheDocument()
})
