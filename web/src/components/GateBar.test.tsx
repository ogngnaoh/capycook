import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GateBar from './GateBar'
import { VERB_LABEL } from '../vocab'

function openMore() {
  fireEvent.click(screen.getByRole('button', { name: 'More' }))
}

test('two decisions up front, four verbs behind More; all six dispatch wire enums', () => {
  const calls: string[] = []
  render(<GateBar onVerb={(v) => { calls.push(v) }} />)
  // Level 1: the decision pair.
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ask for changes' }))
  // The revision/mode-switch verbs are one disclosure away, verbatim names.
  for (const label of ['Edit', 'Regenerate', 'Alternatives', 'Take over']) {
    expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
  }
  const more = screen.getByRole('button', { name: 'More' })
  expect(more).toHaveAttribute('aria-expanded', 'false')
  openMore()
  expect(more).toHaveAttribute('aria-expanded', 'true')
  for (const label of ['Edit', 'Regenerate', 'Alternatives', 'Take over']) {
    fireEvent.click(screen.getByRole('button', { name: label }))
    openMore() // a dispatched More verb closes the group; reopen for the next
  }
  expect(calls).toEqual(['accept', 'redirect', 'edit', 'regenerate', 'alternatives', 'take_over'])
})

test('the redirect slug rides Ask for changes as a silent power-user tell', () => {
  render(<GateBar onVerb={() => {}} />)
  const ask = screen.getByRole('button', { name: 'Ask for changes' })
  // Visible in mono, hidden from the accessible name.
  const slug = ask.querySelector('[aria-hidden="true"].font-mono')
  expect(slug).toHaveTextContent('redirect')
})

test('disabled bar fires nothing and More stays shut', () => {
  const onVerb = vi.fn()
  render(<GateBar onVerb={onVerb} disabled />)
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ask for changes' }))
  fireEvent.click(screen.getByRole('button', { name: 'More' }))
  expect(onVerb).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'More' })).toHaveAttribute('aria-expanded', 'false')
})

test('Accept is the one filled terracotta primary; the rest are ghosts', () => {
  render(<GateBar onVerb={() => {}} />)
  expect(screen.getByRole('button', { name: 'Accept' }).className).toMatch(/bg-accent/)
  expect(screen.getByRole('button', { name: 'Ask for changes' }).className).not.toMatch(/bg-accent/)
  openMore()
  for (const label of ['Edit', 'Regenerate', 'Alternatives', 'Take over']) {
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

test('blocked state offers only Regenerate and Ask for changes, no More', () => {
  const calls: string[] = []
  render(<GateBar state="blocked" onVerb={(v) => { calls.push(v) }} />)
  fireEvent.click(screen.getByRole('button', { name: VERB_LABEL.regenerate }))
  fireEvent.click(screen.getByRole('button', { name: VERB_LABEL.redirect }))
  expect(calls).toEqual(['regenerate', 'redirect'])
  expect(screen.queryByRole('button', { name: /accept|^edit$|alternatives|take over|more/i })).not.toBeInTheDocument()
})

test('a promise-returning dispatch locks the bar with a spinner until it settles', async () => {
  let resolve!: () => void
  const onVerb = vi.fn(() => new Promise<void>((r) => { resolve = r }))
  render(<GateBar onVerb={onVerb} />)
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
  await screen.findByTestId('gate-spinner')
  for (const label of ['Accept', 'Ask for changes', 'More']) {
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
  openMore()
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled()
  expect(screen.queryByTestId('gate-spinner')).not.toBeInTheDocument()
})
