import { render, screen, fireEvent } from '@testing-library/react'
import GateBar from './GateBar'

test('renders all six verbs and fires onVerb', () => {
  const calls: string[] = []
  render(<GateBar onVerb={(v) => calls.push(v)} />)
  for (const label of ['Accept', 'Edit', 'Regenerate', 'Alternatives', 'Redirect', 'Take over']) {
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
  }
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
  expect(calls).toEqual(['accept'])
})
