import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GateBar from './GateBar'
import { VERB_LABEL } from '../vocab'
import { DEFAULT_SHORTCUTS, setShortcuts } from '../lib/shortcuts'

beforeEach(() => {
  localStorage.clear()
})

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

// ---- APG toolbar semantics (P4) ----

test('the bar is an APG toolbar named for the decision, not a bare group', () => {
  render(<GateBar onVerb={() => {}} />)
  expect(screen.getByRole('toolbar', { name: 'Gate — respond to the proposal' })).toBeInTheDocument()
  expect(screen.queryByRole('group', { name: 'Gate' })).not.toBeInTheDocument()
})

test('the blocked bar is a toolbar too', () => {
  render(<GateBar state="blocked" onVerb={() => {}} />)
  expect(screen.getByRole('toolbar', { name: 'Gate — respond to the safety hold' })).toBeInTheDocument()
})

test('one tab stop; Left/Right rove and wrap; Home/End jump to the ends', () => {
  render(<GateBar onVerb={() => {}} />)
  const accept = screen.getByRole('button', { name: 'Accept' })
  const ask = screen.getByRole('button', { name: 'Ask for changes' })
  const more = screen.getByRole('button', { name: 'More' })
  const toolbar = screen.getByRole('toolbar')
  // Exactly one control is in the tab sequence.
  expect(accept).toHaveAttribute('tabindex', '0')
  expect(ask).toHaveAttribute('tabindex', '-1')
  expect(more).toHaveAttribute('tabindex', '-1')
  fireEvent.keyDown(toolbar, { key: 'ArrowRight' })
  expect(ask).toHaveAttribute('tabindex', '0')
  expect(accept).toHaveAttribute('tabindex', '-1')
  // Left from Accept wraps to the last visible control (More).
  fireEvent.keyDown(toolbar, { key: 'ArrowLeft' })
  expect(accept).toHaveAttribute('tabindex', '0')
  fireEvent.keyDown(toolbar, { key: 'ArrowLeft' })
  expect(more).toHaveAttribute('tabindex', '0')
  fireEvent.keyDown(toolbar, { key: 'Home' })
  expect(accept).toHaveAttribute('tabindex', '0')
  fireEvent.keyDown(toolbar, { key: 'End' })
  expect(more).toHaveAttribute('tabindex', '0')
})

// ---- Non-destructive lock: aria-disabled, not native disabled (#4) ----

test('a promise-returning dispatch locks the bar via aria-disabled, spinner until settled', async () => {
  let resolve!: () => void
  const onVerb = vi.fn(() => new Promise<void>((r) => { resolve = r }))
  render(<GateBar onVerb={onVerb} />)
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
  await screen.findByTestId('gate-spinner')
  // jest-dom toBeDisabled() cannot see aria-disabled — assert the attribute.
  for (const label of ['Accept', 'Ask for changes', 'More']) {
    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-disabled', 'true')
  }
  // aria-disabled buttons still receive clicks; the guard is behavioral.
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
  expect(onVerb).toHaveBeenCalledTimes(1)
  resolve()
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Accept' })).toHaveAttribute('aria-disabled', 'false'),
  )
  expect(screen.queryByTestId('gate-spinner')).not.toBeInTheDocument()
})

test('a void dispatch (panel verbs) does not lock the bar', () => {
  render(<GateBar onVerb={() => {}} />)
  openMore()
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  expect(screen.getByRole('button', { name: 'Accept' })).toHaveAttribute('aria-disabled', 'false')
  expect(screen.queryByTestId('gate-spinner')).not.toBeInTheDocument()
})

// ---- Shortcut affordances: aria-keyshortcuts + visible hint (task 4.4) ----

test('each verb advertises its key via aria-keyshortcuts, with one quiet visible hint', () => {
  render(<GateBar onVerb={() => {}} />)
  expect(screen.getByRole('button', { name: 'Accept' })).toHaveAttribute('aria-keyshortcuts', 'a')
  expect(screen.getByRole('button', { name: 'Ask for changes' })).toHaveAttribute('aria-keyshortcuts', 'r')
  openMore()
  expect(screen.getByRole('button', { name: 'Edit' })).toHaveAttribute('aria-keyshortcuts', 'e')
  const hint = screen.getByText(/keys:/i)
  expect(hint).toHaveTextContent('keys: A · R · E · G · L · T')
  // The hint is decorative — aria-keyshortcuts already carries it to AT.
  expect(hint).toHaveAttribute('aria-hidden', 'true')
})

// ---- Single-key shortcuts (task 4.3, brief §5c) ----

test('single-key shortcuts dispatch the mapped verb at the pass', () => {
  const calls: string[] = []
  render(<GateBar onVerb={(v) => { calls.push(v) }} />)
  for (const key of ['a', 'r', 'g', 'l', 'e', 't']) {
    fireEvent.keyDown(document.body, { key })
  }
  expect(calls).toEqual(['accept', 'redirect', 'regenerate', 'alternatives', 'edit', 'take_over'])
})

test('modifier chords never trigger a gate shortcut', () => {
  const onVerb = vi.fn()
  render(<GateBar onVerb={onVerb} />)
  fireEvent.keyDown(document.body, { key: 'a', metaKey: true })
  fireEvent.keyDown(document.body, { key: 'r', ctrlKey: true })
  fireEvent.keyDown(document.body, { key: 'g', altKey: true })
  expect(onVerb).not.toHaveBeenCalled()
})

test('shortcuts stand down while a text field is focused', () => {
  const onVerb = vi.fn()
  render(<div><input data-testid="box" /><GateBar onVerb={onVerb} /></div>)
  const box = screen.getByTestId('box') as HTMLInputElement
  box.focus()
  fireEvent.keyDown(box, { key: 'a' })
  expect(onVerb).not.toHaveBeenCalled()
})

test('on a safety hold only G (regenerate) and R (redirect) are live', () => {
  const calls: string[] = []
  render(<GateBar state="blocked" onVerb={(v) => { calls.push(v) }} />)
  for (const key of ['a', 'e', 'l', 't', 'g', 'r']) {
    fireEvent.keyDown(document.body, { key })
  }
  expect(calls).toEqual(['regenerate', 'redirect'])
  expect(screen.getByText(/keys:/i)).toHaveTextContent('keys: G · R')
})

test('shortcuts obey the disable switch (WCAG 2.1.4): no keys, no hint, no aria-keyshortcuts', () => {
  setShortcuts({ enabled: false, map: DEFAULT_SHORTCUTS.map })
  const onVerb = vi.fn()
  render(<GateBar onVerb={onVerb} />)
  fireEvent.keyDown(document.body, { key: 'a' })
  expect(onVerb).not.toHaveBeenCalled()
  expect(screen.queryByText(/keys:/i)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Accept' })).not.toHaveAttribute('aria-keyshortcuts')
})

test('a remapped key drives dispatch and the advertised shortcut', () => {
  setShortcuts({ enabled: true, map: { ...DEFAULT_SHORTCUTS.map, accept: 'y' } })
  const onVerb = vi.fn()
  render(<GateBar onVerb={onVerb} />)
  expect(screen.getByRole('button', { name: 'Accept' })).toHaveAttribute('aria-keyshortcuts', 'y')
  fireEvent.keyDown(document.body, { key: 'a' }) // old default no longer bound
  fireEvent.keyDown(document.body, { key: 'y' })
  expect(onVerb).toHaveBeenCalledTimes(1)
  expect(onVerb).toHaveBeenCalledWith('accept')
})
