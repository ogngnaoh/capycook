import { render, screen } from '@testing-library/react'
import Workbench, { type GateState } from './Workbench'
import type { Proposal } from '../types'

const stub: Proposal = {
  id: 'p1', diff: [{ op: 'add', path: 'ingredients', value: '2 cloves garlic' }],
  rationale: 'Depth.', citations: [], confidence: 0.7, unverified: [], safetyBlock: null,
}

test.each<[GateState, RegExp]>([
  ['proposing', /Proposing/], ['blocked', /Blocked/], ['awaiting', /Awaiting gate/], ['accepted', /Accepted/],
])('shows the %s state banner', (state, re) => {
  render(<Workbench proposal={stub} state={state} onVerb={() => {}} />)
  expect(screen.getByText(re)).toBeInTheDocument()
})

test('two panes are present', () => {
  render(<Workbench proposal={stub} state="awaiting" onVerb={() => {}} />)
  expect(screen.getByTestId('draft-pane')).toBeInTheDocument()
  expect(screen.getByTestId('steering-pane')).toBeInTheDocument()
})
