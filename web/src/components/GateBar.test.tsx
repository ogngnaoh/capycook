import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GateBar from './GateBar'

test('renders all six verbs and dispatches the wire enum values', () => {
  const calls: string[] = []
  render(<GateBar onVerb={(v) => { calls.push(v) }} />)
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

test('Accept is the one filled terracotta primary; the rest are ghosts', () => {
  render(<GateBar onVerb={() => {}} />)
  expect(screen.getByRole('button', { name: 'Accept' }).className).toMatch(/bg-accent/)
  for (const label of ['Edit', 'Regenerate', 'Alternatives', 'Redirect', 'Take over']) {
    expect(screen.getByRole('button', { name: label }).className).not.toMatch(/bg-accent/)
  }
})

test('proposing state replaces the verbs with Cancel', () => {
  const onCancel = vi.fn()
  render(<GateBar state="proposing" onCancel={onCancel} />)
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(onCancel).toHaveBeenCalled()
})

test('blocked state offers only Regenerate and Redirect', () => {
  const calls: string[] = []
  render(<GateBar state="blocked" onVerb={(v) => { calls.push(v) }} />)
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
  fireEvent.click(screen.getByRole('button', { name: 'Redirect' }))
  expect(calls).toEqual(['regenerate', 'redirect'])
  expect(screen.queryByRole('button', { name: /accept|edit|alternatives|take over/i })).not.toBeInTheDocument()
})

test('a promise-returning dispatch locks the bar with a spinner until it settles', async () => {
  let resolve!: () => void
  const onVerb = vi.fn(() => new Promise<void>((r) => { resolve = r }))
  render(<GateBar onVerb={onVerb} />)
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
  await screen.findByTestId('gate-spinner')
  for (const label of ['Accept', 'Edit', 'Regenerate', 'Alternatives', 'Redirect', 'Take over']) {
    expect(screen.getByRole('button', { name: label })).toBeDisabled()
  }
  // Idempotent-click feel: a second click while in flight dispatches nothing.
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
  expect(onVerb).toHaveBeenCalledTimes(1)
  resolve()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled())
  expect(screen.queryByTestId('gate-spinner')).not.toBeInTheDocument()
})

test('a void dispatch (panel verbs) does not lock the bar', () => {
  render(<GateBar onVerb={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled()
  expect(screen.queryByTestId('gate-spinner')).not.toBeInTheDocument()
})
