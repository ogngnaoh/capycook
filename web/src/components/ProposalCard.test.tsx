import { render, screen, fireEvent } from '@testing-library/react'
import ProposalCard from './ProposalCard'
import { sampleProposal } from '../fixtures'
import type { Op } from '../types'

// An ops fixture in the exact shape internal/proposal.ComputeDiff emits:
// From only on replace, remove is path-only.
const ops: Op[] = [
  { op: 'replace', path: '/title', from: 'Old Title', value: 'New Title' },
  { op: 'add', path: '/ingredients/2', value: { name: 'garlic', fdc_id: null, foodon_id: null, qty: 2, unit: 'clove' } },
  { op: 'remove', path: '/steps/1' },
]

test('renders per-field diffs: old struck-through, new highlighted', () => {
  render(<ProposalCard proposal={sampleProposal({ change: ops })} />)
  const oldValue = screen.getByText('Old Title')
  expect(oldValue.className).toMatch(/line-through/)
  const newValue = screen.getByText('New Title')
  expect(newValue.className).toMatch(/bg-/)
  expect(newValue.className).not.toMatch(/line-through/)
  expect(screen.getByText(/garlic/)).toBeInTheDocument()
  expect(screen.getByText('/steps/1')).toBeInTheDocument()
  expect(screen.getByText('/ingredients/2')).toBeInTheDocument()
})

test('renders rationale, citation, confidence, and [unverified] flags', () => {
  render(<ProposalCard proposal={sampleProposal()} />)
  expect(screen.getByText('A tighter concept.')).toBeInTheDocument()
  expect(screen.getByText(/USDA FDC/)).toBeInTheDocument()
  expect(screen.getByText(/72%/)).toBeInTheDocument()
  expect(screen.getByText(/\[unverified\]/)).toBeInTheDocument()
})

test('acts as a selectable card in a picker', () => {
  const onSelect = vi.fn()
  render(<ProposalCard proposal={sampleProposal()} selected={false} onSelect={onSelect} />)
  fireEvent.click(screen.getByTestId('proposal-card'))
  expect(onSelect).toHaveBeenCalled()
})
