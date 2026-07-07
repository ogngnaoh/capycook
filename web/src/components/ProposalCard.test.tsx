import { render, screen } from '@testing-library/react'
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

test('renders per-field diffs: old struck-through in muted, new on the success tint', () => {
  render(<ProposalCard proposal={sampleProposal({ change: ops })} />)
  const oldValue = screen.getByText('Old Title')
  expect(oldValue.className).toMatch(/line-through/)
  expect(oldValue.className).toMatch(/text-muted/)
  const newValue = screen.getByText('New Title')
  expect(newValue.className).toMatch(/bg-success-surface/)
  expect(newValue.className).not.toMatch(/line-through/)
  expect(screen.getByText(/garlic/)).toBeInTheDocument()
  expect(screen.getByText('/steps/1')).toBeInTheDocument()
  expect(screen.getByText('/ingredients/2')).toBeInTheDocument()
})

test('labels each op with a tiny square ADD/REMOVE/REPLACE badge', () => {
  render(<ProposalCard proposal={sampleProposal({ change: ops })} />)
  expect(screen.getByText('REPLACE')).toBeInTheDocument()
  expect(screen.getByText('ADD')).toBeInTheDocument()
  expect(screen.getByText('REMOVE')).toBeInTheDocument()
})

test('object and array values render as compact key: value pairs, not raw JSON', () => {
  const change: Op[] = [
    { op: 'add', path: '/ingredients/2', value: { name: 'garlic', fdc_id: null, foodon_id: null, qty: 2, unit: 'clove' } },
    { op: 'replace', path: '/steps', from: [{ text: 'Boil.', technique: 'boil' }], value: [{ text: 'Sear skin-side down.', technique: 'saute' }] },
  ]
  render(<ProposalCard proposal={sampleProposal({ change })} />)
  expect(screen.getByText('name: garlic · qty: 2 · unit: clove')).toBeInTheDocument()
  expect(screen.getByText('(text: Sear skin-side down. · technique: saute)')).toBeInTheDocument()
  expect(document.body.textContent).not.toContain('{"')
})

test('renders rationale, citation, confidence, and [unverified] chips', () => {
  render(<ProposalCard proposal={sampleProposal()} />)
  expect(screen.getByText('A tighter concept.')).toBeInTheDocument()
  expect(screen.getByText('USDA FDC #11215').className).toMatch(/bg-info-surface/)
  expect(screen.getByText('conf 0.72').className).toMatch(/border-hairline/)
  expect(screen.getByText('[unverified] cook time is an estimate').className).toMatch(/bg-warning-surface/)
})

test('deterministic proposals (confidence 1.0) get a deterministic chip, not a number', () => {
  render(<ProposalCard proposal={sampleProposal({ confidence: 1 })} />)
  expect(screen.getByText('deterministic')).toBeInTheDocument()
  expect(screen.queryByText(/conf 1/)).not.toBeInTheDocument()
})

