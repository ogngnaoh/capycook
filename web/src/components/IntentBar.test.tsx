import { fireEvent, render, screen } from '@testing-library/react'
import IntentBar from './IntentBar'
import { INTENT_EMPTY_ERROR, MOVE_LABEL, SCALE_INVALID_ERROR } from '../vocab'

type Props = React.ComponentProps<typeof IntentBar>

function renderBar(overrides: Partial<Props> = {}) {
  const props: Props = {
    canPropose: true,
    autonomyOn: false,
    servings: 2,
    suggestedNext: [],
    onMove: vi.fn(),
    ...overrides,
  }
  render(<IntentBar {...props} />)
  return props
}

// ---- canPropose gate ----

test('canPropose=false renders nothing (the stage shows a state card instead)', () => {
  const { container } = render(
    <IntentBar canPropose={false} autonomyOn={false} servings={2} suggestedNext={[]} onMove={vi.fn()} />,
  )
  expect(container).toBeEmptyDOMElement()
})

// ---- free-text intent ----

test('the intent input is labeled "What do you want to try next?"', () => {
  renderBar()
  expect(screen.getByLabelText(/what do you want to try next/i)).toBeInTheDocument()
})

test('typing an intent and pressing Enter fires onMove with an empty moveType and clears the input', () => {
  const onMove = vi.fn()
  renderBar({ onMove })
  const input = screen.getByLabelText(/what do you want to try next/i)
  fireEvent.change(input, { target: { value: 'make it cheaper' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onMove).toHaveBeenCalledWith('', 'make it cheaper')
  expect(input).toHaveValue('')
})

test('the "Try it" button submits the same way and clears the input', () => {
  const onMove = vi.fn()
  renderBar({ onMove })
  const input = screen.getByLabelText(/what do you want to try next/i)
  fireEvent.change(input, { target: { value: 'add a crunchy element' } })
  fireEvent.click(screen.getByRole('button', { name: /try it/i }))
  expect(onMove).toHaveBeenCalledWith('', 'add a crunchy element')
  expect(input).toHaveValue('')
})

test('blank (or whitespace-only) input does not fire, on Enter or on click', () => {
  const onMove = vi.fn()
  renderBar({ onMove })
  const input = screen.getByLabelText(/what do you want to try next/i)
  fireEvent.keyDown(input, { key: 'Enter' })
  fireEvent.click(screen.getByRole('button', { name: /try it/i }))
  fireEvent.change(input, { target: { value: '   ' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  fireEvent.click(screen.getByRole('button', { name: /try it/i }))
  expect(onMove).not.toHaveBeenCalled()
})

// ---- empty-guard validation (BC-A-4 / BC-A-9) ----

test('an empty "Try it" shows a field-linked alert, focuses the intent field, and does not fire', () => {
  const onMove = vi.fn()
  renderBar({ onMove })
  fireEvent.click(screen.getByRole('button', { name: /try it/i }))
  const error = screen.getByRole('alert')
  expect(error).toHaveTextContent(INTENT_EMPTY_ERROR)
  const input = screen.getByLabelText(/what do you want to try next/i)
  expect(input).toHaveFocus()
  expect(input).toHaveAttribute('aria-invalid', 'true')
  expect(input).toHaveAttribute('aria-describedby', error.id)
  expect(onMove).not.toHaveBeenCalled()
})

test('the intent error clears on the next valid submit', () => {
  const onMove = vi.fn()
  renderBar({ onMove })
  fireEvent.click(screen.getByRole('button', { name: /try it/i }))
  expect(screen.getByRole('alert')).toBeInTheDocument()
  const input = screen.getByLabelText(/what do you want to try next/i)
  fireEvent.change(input, { target: { value: 'make it cheaper' } })
  fireEvent.click(screen.getByRole('button', { name: /try it/i }))
  expect(onMove).toHaveBeenCalledWith('', 'make it cheaper')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(input).not.toHaveAttribute('aria-invalid')
})

test.each(['', '0', '-1'])('scale value %j shows a field-linked alert, keeps focus, and does not fire', (bad) => {
  const onMove = vi.fn()
  renderBar({ onMove })
  fireEvent.click(screen.getByRole('button', { name: /scale servings/i }))
  const numberInput = screen.getByRole('spinbutton')
  fireEvent.change(numberInput, { target: { value: bad } })
  fireEvent.click(screen.getByRole('button', { name: /scale it/i }))
  const error = screen.getByRole('alert')
  expect(error).toHaveTextContent(SCALE_INVALID_ERROR)
  expect(numberInput).toHaveFocus()
  expect(numberInput).toHaveAttribute('aria-invalid', 'true')
  expect(numberInput).toHaveAttribute('aria-describedby', error.id)
  expect(onMove).not.toHaveBeenCalled()
})

test('reopening the scale form starts clean — no stale error from the last attempt', () => {
  renderBar()
  fireEvent.click(screen.getByRole('button', { name: /scale servings/i }))
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: /scale it/i }))
  expect(screen.getByRole('alert')).toBeInTheDocument()
  // Close by submitting a valid value, then reopen.
  fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '4' } })
  fireEvent.click(screen.getByRole('button', { name: /scale it/i }))
  fireEvent.click(screen.getByRole('button', { name: /scale servings/i }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('spinbutton')).not.toHaveAttribute('aria-invalid')
})

test('the intent input carries the design placeholder', () => {
  renderBar()
  expect(screen.getByPlaceholderText('make it cheaper · add a crunchy element · what pairs with miso?'))
    .toBeInTheDocument()
})

// ---- suggested-next chips ----

test('suggested-next chips render above the input under a "Try next" eyebrow and fire onMove with the slug', () => {
  const onMove = vi.fn()
  renderBar({ onMove, suggestedNext: ['technique_step'] })
  expect(screen.getByText('Try next —')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: MOVE_LABEL.technique_step }))
  expect(onMove).toHaveBeenCalledWith('technique_step', '')
})

test('suggested-next chips speak the plain vocab label; a slug with no real label never renders (BC-A-14)', () => {
  renderBar({ suggestedNext: ['scale_servings', 'some_unknown_slug'] })
  expect(screen.getByRole('button', { name: MOVE_LABEL.scale_servings })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'some_unknown_slug' })).not.toBeInTheDocument()
})

test('no suggested-next chips render when the list is empty', () => {
  renderBar({ suggestedNext: [] })
  expect(screen.queryByText('Try next —')).not.toBeInTheDocument()
})

test('no suggested-next chips (nor the eyebrow) render when every slug is unrecognized (BC-A-14)', () => {
  renderBar({ suggestedNext: ['totally_unknown_slug'] })
  expect(screen.queryByText('Try next —')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'totally_unknown_slug' })).not.toBeInTheDocument()
})

// ---- "Just the math —" deterministic row ----

test('Convert units / Recompute cost / Recompute nutrition fire directly with an empty steer', () => {
  const onMove = vi.fn()
  renderBar({ onMove })
  fireEvent.click(screen.getByRole('button', { name: MOVE_LABEL.unit_convert }))
  fireEvent.click(screen.getByRole('button', { name: MOVE_LABEL.cost_recompute }))
  fireEvent.click(screen.getByRole('button', { name: MOVE_LABEL.nutrition_recompute }))
  expect(onMove).toHaveBeenNthCalledWith(1, 'unit_convert', '')
  expect(onMove).toHaveBeenNthCalledWith(2, 'cost_recompute', '')
  expect(onMove).toHaveBeenNthCalledWith(3, 'nutrition_recompute', '')
})

test('"Just the math —" eyebrow is present', () => {
  renderBar()
  expect(screen.getByText(/just the math/i)).toBeInTheDocument()
})

test('Scale servings… opens an inline number input defaulting to servings×2, and Enter submits it', () => {
  const onMove = vi.fn()
  renderBar({ onMove, servings: 2 })
  fireEvent.click(screen.getByRole('button', { name: /scale servings/i }))
  const numberInput = screen.getByRole('spinbutton')
  expect(numberInput).toHaveValue(4)
  fireEvent.keyDown(numberInput, { key: 'Enter' })
  expect(onMove).toHaveBeenCalledWith('scale_servings', '4')
})

test('the scale number input can be edited before submitting, and enforces min=1/integer step', () => {
  const onMove = vi.fn()
  renderBar({ onMove, servings: 5 })
  fireEvent.click(screen.getByRole('button', { name: /scale servings/i }))
  const numberInput = screen.getByRole('spinbutton')
  expect(numberInput).toHaveAttribute('min', '1')
  expect(numberInput).toHaveAttribute('step', '1')
  fireEvent.change(numberInput, { target: { value: '8' } })
  fireEvent.keyDown(numberInput, { key: 'Enter' })
  expect(onMove).toHaveBeenCalledWith('scale_servings', '8')
})

test('a non-positive scale value does not submit', () => {
  const onMove = vi.fn()
  renderBar({ onMove, servings: 2 })
  fireEvent.click(screen.getByRole('button', { name: /scale servings/i }))
  const numberInput = screen.getByRole('spinbutton')
  fireEvent.change(numberInput, { target: { value: '0' } })
  fireEvent.keyDown(numberInput, { key: 'Enter' })
  expect(onMove).not.toHaveBeenCalled()
})

// ---- typed-input preservation (BC-A-13) ----

test('a restore hands a failed move intent text back to the field', () => {
  const { rerender } = render(
    <IntentBar canPropose autonomyOn={false} servings={2} suggestedNext={[]} onMove={vi.fn()} />,
  )
  // Workbench stashes the submission at dispatch and hands it back once the
  // failure is known — while the bar is still mounted (a failed POST).
  rerender(
    <IntentBar canPropose autonomyOn={false} servings={2} suggestedNext={[]} onMove={vi.fn()}
      restore={{ intent: 'make it cheaper' }} />,
  )
  expect(screen.getByLabelText(/what do you want to try next/i)).toHaveValue('make it cheaper')
})

test('mounting with a restore applies it — the post-cancel remount path', () => {
  render(
    <IntentBar canPropose autonomyOn={false} servings={2} suggestedNext={[]} onMove={vi.fn()}
      restore={{ intent: 'punchier dressing' }} />,
  )
  expect(screen.getByLabelText(/what do you want to try next/i)).toHaveValue('punchier dressing')
})

test('a scale restore reopens the scale form pre-filled with the failed value', () => {
  render(
    <IntentBar canPropose autonomyOn={false} servings={2} suggestedNext={[]} onMove={vi.fn()}
      restore={{ scale: '12' }} />,
  )
  expect(screen.getByRole('spinbutton')).toHaveValue(12)
})

// ---- autonomy "auto" tag ----

test('deterministic chips show a tiny "auto" tag only when autonomyOn', () => {
  const { rerender } = render(
    <IntentBar canPropose autonomyOn={false} servings={2} suggestedNext={[]} onMove={vi.fn()} />,
  )
  expect(screen.queryByText('auto')).not.toBeInTheDocument()
  rerender(<IntentBar canPropose autonomyOn servings={2} suggestedNext={[]} onMove={vi.fn()} />)
  expect(screen.getAllByText('auto')).toHaveLength(4) // scale, convert, cost, nutrition
})

// ---- a11y target sizes ----

test('the primary input and Try-it button meet the 44px target; deterministic chips meet 32px', () => {
  renderBar()
  expect(screen.getByLabelText(/what do you want to try next/i).className).toMatch(/min-h-\[44px\]/)
  expect(screen.getByRole('button', { name: /try it/i }).className).toMatch(/min-h-\[44px\]/)
  expect(screen.getByRole('button', { name: MOVE_LABEL.unit_convert }).className).toMatch(/min-h-\[32px\]/)
})
