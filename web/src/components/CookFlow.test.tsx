import { fireEvent, render, screen } from '@testing-library/react'
import CookFlow from './CookFlow'

function renderFlow(onSubmit = vi.fn()) {
  render(<CookFlow versionLabel="Trial 2" onSubmit={onSubmit} />)
  return onSubmit
}

test('the collapsed row shows the cook prompt and the "I cooked this" entry point', () => {
  renderFlow()
  expect(screen.getByText(/cooked this version\?/i)).toBeInTheDocument()
  expect(screen.getByText(/rework against exactly this one/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /i cooked this/i })).toBeInTheDocument()
  expect(screen.queryByLabelText(/tasting notes/i)).not.toBeInTheDocument()
})

test('clicking "I cooked this" expands the tasting form and focuses the textarea', () => {
  renderFlow()
  fireEvent.click(screen.getByRole('button', { name: /i cooked this/i }))
  const textarea = screen.getByLabelText(/tasting notes — what worked, what to change\?/i)
  expect(textarea).toHaveFocus()
})

test('the tasting textarea carries the design placeholder', () => {
  renderFlow()
  fireEvent.click(screen.getByRole('button', { name: /i cooked this/i }))
  expect(screen.getByPlaceholderText(/silky, but too salty by the end/i)).toBeInTheDocument()
})

test('submitting notes calls onSubmit with the typed text and collapses back to the row', () => {
  const onSubmit = vi.fn()
  renderFlow(onSubmit)
  fireEvent.click(screen.getByRole('button', { name: /i cooked this/i }))
  const textarea = screen.getByLabelText(/tasting notes/i)
  fireEvent.change(textarea, { target: { value: 'silky but too salty' } })
  fireEvent.click(screen.getByRole('button', { name: /rework from these notes/i }))
  expect(onSubmit).toHaveBeenCalledWith('silky but too salty')
  expect(screen.queryByLabelText(/tasting notes/i)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /i cooked this/i })).toBeInTheDocument()
})

test('blank notes are allowed through — the caller decides on the "Cooked it." fallback', () => {
  const onSubmit = vi.fn()
  renderFlow(onSubmit)
  fireEvent.click(screen.getByRole('button', { name: /i cooked this/i }))
  fireEvent.click(screen.getByRole('button', { name: /rework from these notes/i }))
  expect(onSubmit).toHaveBeenCalledWith('')
})

test('Cancel collapses back to the row without submitting, and discards the draft notes', () => {
  const onSubmit = vi.fn()
  renderFlow(onSubmit)
  fireEvent.click(screen.getByRole('button', { name: /i cooked this/i }))
  fireEvent.change(screen.getByLabelText(/tasting notes/i), { target: { value: 'notes to discard' } })
  fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
  expect(screen.queryByLabelText(/tasting notes/i)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /i cooked this/i })).toBeInTheDocument()
  expect(onSubmit).not.toHaveBeenCalled()

  // Reopening starts from a clean slate, not the discarded draft.
  fireEvent.click(screen.getByRole('button', { name: /i cooked this/i }))
  expect(screen.getByLabelText(/tasting notes/i)).toHaveValue('')
})

test('the version label is surfaced to the cook', () => {
  renderFlow()
  expect(screen.getByText('Trial 2')).toBeInTheDocument()
})
