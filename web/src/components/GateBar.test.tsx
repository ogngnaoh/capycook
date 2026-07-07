import { render, screen, fireEvent } from '@testing-library/react'
import GateBar from './GateBar'

test('renders all six verbs and dispatches the wire enum values', () => {
  const calls: string[] = []
  render(<GateBar onVerb={(v) => calls.push(v)} />)
  const labels = ['Accept', 'Edit', 'Regenerate', 'Alternatives', 'Redirect', 'Take over']
  for (const label of labels) {
    fireEvent.click(screen.getByRole('button', { name: label }))
  }
  expect(calls).toEqual(['accept', 'edit', 'regenerate', 'alternatives', 'redirect', 'take_over'])
})

test('disabled bar fires nothing', () => {
  const onVerb = vi.fn()
  render(<GateBar onVerb={onVerb} disabled />)
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
  expect(onVerb).not.toHaveBeenCalled()
})
