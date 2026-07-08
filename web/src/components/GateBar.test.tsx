import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GateBar from './GateBar'
import { sampleDraft, sampleProposal } from '../fixtures'
import { GATE_ANOTHER_LABEL, GATE_PROMPT, VERB_LABEL } from '../vocab'
import { DEFAULT_SHORTCUTS, setShortcuts } from '../lib/shortcuts'
import type { Op } from '../types'

beforeEach(() => {
  localStorage.clear()
})

type GateBarProps = React.ComponentProps<typeof GateBar>

function renderBar(overrides: Partial<GateBarProps> = {}) {
  const props: GateBarProps = {
    proposal: sampleProposal(),
    draft: sampleDraft(),
    onAccept: vi.fn(),
    onEditSubmit: vi.fn(),
    onRegenerate: vi.fn(),
    onAlternatives: vi.fn(),
    onRedirectSubmit: vi.fn(),
    onTakeoverSubmit: vi.fn(),
    ...overrides,
  }
  render(<GateBar {...props} />)
  return props
}

function openAnother() {
  fireEvent.click(screen.getByRole('button', { name: GATE_ANOTHER_LABEL }))
}

// ---- decide mode ----

test('decide shows the three controls with vocab labels', () => {
  renderBar()
  expect(screen.getByText(GATE_PROMPT)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: VERB_LABEL.accept })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: VERB_LABEL.edit })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: GATE_ANOTHER_LABEL })).toBeInTheDocument()
})

test('the bar is an APG toolbar named for the decision', () => {
  renderBar()
  expect(screen.getByRole('toolbar', { name: 'Decide on this change' })).toBeInTheDocument()
})

test('"Try another way" opens the four-verb row and hides the decide row', () => {
  renderBar()
  openAnother()
  for (const v of ['regenerate', 'alternatives', 'redirect', 'take_over'] as const) {
    expect(screen.getByRole('button', { name: VERB_LABEL[v] })).toBeInTheDocument()
  }
  expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: VERB_LABEL.accept })).not.toBeInTheDocument()
})

test('every verb button carries a data-verb attribute for robust targeting (task 9)', () => {
  renderBar()
  expect(screen.getByRole('button', { name: VERB_LABEL.accept })).toHaveAttribute('data-verb', 'accept')
  expect(screen.getByRole('button', { name: VERB_LABEL.edit })).toHaveAttribute('data-verb', 'edit')
  openAnother()
  expect(screen.getByRole('button', { name: VERB_LABEL.regenerate })).toHaveAttribute('data-verb', 'regenerate')
  expect(screen.getByRole('button', { name: VERB_LABEL.alternatives })).toHaveAttribute('data-verb', 'alternatives')
  expect(screen.getByRole('button', { name: VERB_LABEL.redirect })).toHaveAttribute('data-verb', 'redirect')
  expect(screen.getByRole('button', { name: VERB_LABEL.take_over })).toHaveAttribute('data-verb', 'take_over')
})

// ---- all six verbs dispatchable ----

test('all six verbs are dispatchable end to end', async () => {
  const onAccept = vi.fn()
  const onEditSubmit = vi.fn()
  const onRegenerate = vi.fn()
  const onAlternatives = vi.fn()
  const onRedirectSubmit = vi.fn()
  const onTakeoverSubmit = vi.fn()
  renderBar({ onAccept, onEditSubmit, onRegenerate, onAlternatives, onRedirectSubmit, onTakeoverSubmit })

  fireEvent.click(screen.getByRole('button', { name: VERB_LABEL.accept }))
  expect(onAccept).toHaveBeenCalledTimes(1)

  fireEvent.click(screen.getByRole('button', { name: VERB_LABEL.edit }))
  const tweakForm = await screen.findByTestId('tweak-form')
  fireEvent.change(tweakForm.querySelector('input')!, { target: { value: 'New Title Edited' } })
  fireEvent.click(screen.getByRole('button', { name: /keep with edit/i }))
  expect(onEditSubmit).toHaveBeenCalledTimes(1)
  expect(onEditSubmit.mock.calls[0][0]).toEqual([
    { op: 'replace', path: '/title', from: 'Old Title', value: 'New Title Edited' },
  ])

  openAnother()
  fireEvent.click(screen.getByRole('button', { name: VERB_LABEL.regenerate }))
  expect(onRegenerate).toHaveBeenCalledTimes(1)

  openAnother()
  fireEvent.click(screen.getByRole('button', { name: VERB_LABEL.alternatives }))
  expect(onAlternatives).toHaveBeenCalledTimes(1)

  openAnother()
  fireEvent.click(screen.getByRole('button', { name: VERB_LABEL.redirect }))
  const redirectForm = await screen.findByTestId('redirect-form')
  fireEvent.change(redirectForm.querySelector('input')!, { target: { value: 'add brightness' } })
  fireEvent.click(screen.getByRole('button', { name: /send/i }))
  expect(onRedirectSubmit).toHaveBeenCalledWith('add brightness')

  openAnother()
  fireEvent.click(screen.getByRole('button', { name: VERB_LABEL.take_over }))
  const takeoverForm = await screen.findByTestId('takeover-form')
  const draft = sampleDraft()
  fireEvent.change(takeoverForm.querySelector('textarea')!, { target: { value: JSON.stringify(draft) } })
  fireEvent.click(screen.getByRole('button', { name: /save draft/i }))
  expect(onTakeoverSubmit).toHaveBeenCalledWith(draft)
})

// ---- tweak mode: the real ops editor ----

test('tweak mode lists one input per op (removals excluded) and submits the edited values', async () => {
  const ops: Op[] = [
    { op: 'replace', path: '/title', from: 'Old Title', value: 'New Title' },
    { op: 'add', path: '/ingredients/2', value: { name: 'lemon zest', fdc_id: null, foodon_id: null, qty: 1, unit: 'tsp' } },
    { op: 'remove', path: '/steps/1' },
  ]
  const onEditSubmit = vi.fn()
  renderBar({ proposal: sampleProposal({ change: ops }), onEditSubmit })
  fireEvent.click(screen.getByRole('button', { name: VERB_LABEL.edit }))
  const form = await screen.findByTestId('tweak-form')
  const inputs = form.querySelectorAll('input')
  expect(inputs).toHaveLength(2) // the remove op has nothing to edit
  fireEvent.change(inputs[0], { target: { value: 'Renamed Title' } })
  fireEvent.change(inputs[1], {
    target: { value: JSON.stringify({ name: 'lemon zest', fdc_id: null, foodon_id: null, qty: 2, unit: 'tsp' }) },
  })
  fireEvent.click(screen.getByRole('button', { name: /keep with edit/i }))
  expect(onEditSubmit).toHaveBeenCalledTimes(1)
  const submitted = onEditSubmit.mock.calls[0][0] as Op[]
  expect(submitted[0]).toEqual({ op: 'replace', path: '/title', from: 'Old Title', value: 'Renamed Title' })
  expect(submitted[1].value).toEqual({ name: 'lemon zest', fdc_id: null, foodon_id: null, qty: 2, unit: 'tsp' })
  expect(submitted[2]).toEqual({ op: 'remove', path: '/steps/1' })
})

test('tweak Cancel discards the edit and returns focus to Tweak it', async () => {
  renderBar()
  const tweakIt = screen.getByRole('button', { name: VERB_LABEL.edit })
  fireEvent.click(tweakIt)
  await screen.findByTestId('tweak-form')
  fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
  expect(screen.queryByTestId('tweak-form')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: VERB_LABEL.edit })).toHaveFocus()
})

// ---- redirect mode ----

test('redirect Send is disabled while the steer input is blank', async () => {
  const onRedirectSubmit = vi.fn()
  renderBar({ onRedirectSubmit })
  openAnother()
  fireEvent.click(screen.getByRole('button', { name: VERB_LABEL.redirect }))
  const form = await screen.findByTestId('redirect-form')
  const send = screen.getByRole('button', { name: /send/i })
  expect(send).toBeDisabled()
  fireEvent.change(form.querySelector('input')!, { target: { value: 'add brightness' } })
  expect(send).not.toBeDisabled()
  fireEvent.click(send)
  expect(onRedirectSubmit).toHaveBeenCalledWith('add brightness')
})

// ---- takeover mode: GOV.UK parse-error pattern ----

test('takeover invalid JSON shows a focused error and does not submit', async () => {
  const onTakeoverSubmit = vi.fn()
  renderBar({ onTakeoverSubmit })
  openAnother()
  fireEvent.click(screen.getByRole('button', { name: VERB_LABEL.take_over }))
  const form = await screen.findByTestId('takeover-form')
  const textarea = form.querySelector('textarea') as HTMLTextAreaElement
  fireEvent.change(textarea, { target: { value: '{ not valid json' } })
  fireEvent.click(screen.getByRole('button', { name: /save draft/i }))
  const error = await screen.findByRole('alert')
  expect(error).toHaveFocus()
  expect(onTakeoverSubmit).not.toHaveBeenCalled()
  expect(textarea).toHaveAttribute('aria-invalid', 'true')
  expect(textarea).toHaveAttribute('aria-describedby', error.id)
})

// ---- APG toolbar: roving tabindex ----

test('ArrowRight cycles focus around the decide toolbar; one tab stop', () => {
  renderBar()
  const toolbar = screen.getByRole('toolbar')
  const useIt = screen.getByRole('button', { name: VERB_LABEL.accept })
  const tweakIt = screen.getByRole('button', { name: VERB_LABEL.edit })
  expect(useIt).toHaveAttribute('tabindex', '0')
  expect(tweakIt).toHaveAttribute('tabindex', '-1')
  fireEvent.keyDown(toolbar, { key: 'ArrowRight' })
  expect(tweakIt).toHaveAttribute('tabindex', '0')
  expect(useIt).toHaveAttribute('tabindex', '-1')
})

// ---- single-key shortcuts + Escape ----

test('the "a" shortcut fires onAccept in decide mode but not while a text field is focused', () => {
  const onAccept = vi.fn()
  render(
    <div>
      <input data-testid="box" />
      <GateBar proposal={sampleProposal()} draft={sampleDraft()} onAccept={onAccept}
        onEditSubmit={vi.fn()} onRegenerate={vi.fn()} onAlternatives={vi.fn()}
        onRedirectSubmit={vi.fn()} onTakeoverSubmit={vi.fn()} />
    </div>,
  )
  const box = screen.getByTestId('box') as HTMLInputElement
  box.focus()
  fireEvent.keyDown(box, { key: 'a' })
  expect(onAccept).not.toHaveBeenCalled()
  box.blur()
  fireEvent.keyDown(document.body, { key: 'a' })
  expect(onAccept).toHaveBeenCalledTimes(1)
})

test('Escape in "another" mode returns to decide', () => {
  renderBar()
  openAnother()
  expect(screen.getByRole('button', { name: VERB_LABEL.regenerate })).toBeInTheDocument()
  fireEvent.keyDown(document.body, { key: 'Escape' })
  expect(screen.getByRole('button', { name: VERB_LABEL.accept })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: VERB_LABEL.regenerate })).not.toBeInTheDocument()
})

test('shortcuts disabled: the "a" mnemonic does not fire accept, but Escape still returns "another" to decide', () => {
  setShortcuts({ enabled: false, map: DEFAULT_SHORTCUTS.map })
  const onAccept = vi.fn()
  renderBar({ onAccept })
  fireEvent.keyDown(document.body, { key: 'a' })
  expect(onAccept).not.toHaveBeenCalled()
  openAnother()
  expect(screen.getByRole('button', { name: VERB_LABEL.regenerate })).toBeInTheDocument()
  fireEvent.keyDown(document.body, { key: 'Escape' })
  expect(screen.getByRole('button', { name: VERB_LABEL.accept })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: VERB_LABEL.regenerate })).not.toBeInTheDocument()
})

// ---- non-destructive in-flight lock (aria-disabled, never native disabled) ----

test('a promise-returning dispatch locks the bar via aria-disabled; re-clicks do not re-fire', async () => {
  let resolve!: () => void
  const onAccept = vi.fn(() => new Promise<void>((r) => { resolve = r }))
  renderBar({ onAccept })
  const useIt = screen.getByRole('button', { name: VERB_LABEL.accept })
  fireEvent.click(useIt)
  expect(useIt).toHaveAttribute('aria-disabled', 'true')
  fireEvent.click(useIt)
  expect(onAccept).toHaveBeenCalledTimes(1)
  resolve()
  await waitFor(() => expect(useIt).toHaveAttribute('aria-disabled', 'false'))
})

test('the disabled prop locks every control with no dispatch pending', () => {
  const onAccept = vi.fn()
  renderBar({ onAccept, disabled: true })
  fireEvent.click(screen.getByRole('button', { name: VERB_LABEL.accept }))
  expect(onAccept).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: VERB_LABEL.accept })).toHaveAttribute('aria-disabled', 'true')
})
