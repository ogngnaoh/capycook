import { fireEvent, render, screen } from '@testing-library/react'
import SteeringPane, { type ThreadEntry } from './SteeringPane'
import { EMPTY_THREAD, MOVE_LABEL } from '../vocab'

// jsdom has no layout: fake the thread container's scroll geometry so the
// pin-to-newest behavior is observable through scrollTop.
function fakeScrollBox(el: HTMLElement, { scrollHeight, clientHeight }: {
  scrollHeight: number
  clientHeight: number
}) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight })
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight })
}

const entry = (text: string): ThreadEntry => ({ kind: 'info', text })

function mount(thread: ThreadEntry[]) {
  const props = {
    suggestedNext: [], canPropose: true, onPropose: () => {},
  }
  const view = render(<SteeringPane thread={thread} {...props} />)
  const box = view.getByTestId('steering-thread')
  return {
    box,
    addEntry: (t: ThreadEntry) => view.rerender(<SteeringPane thread={[...thread, t]} {...props} />),
  }
}

test('a new thread entry pins the scroll to the newest turn', () => {
  const thread = [entry('one'), entry('two')]
  const { box, addEntry } = mount(thread)
  fakeScrollBox(box, { scrollHeight: 500, clientHeight: 200 })
  box.scrollTop = 300 // at the bottom (500 - 200)
  addEntry(entry('three'))
  expect(box.scrollTop).toBe(box.scrollHeight)
})

test('a cook reading older turns is not yanked down by new entries', () => {
  const thread = [entry('one'), entry('two')]
  const { box, addEntry } = mount(thread)
  fakeScrollBox(box, { scrollHeight: 500, clientHeight: 200 })
  box.scrollTop = 0 // scrolled up to the oldest turns
  box.dispatchEvent(new Event('scroll'))
  addEntry(entry('three'))
  expect(box.scrollTop).toBe(0)
})

test('move-type picker speaks plain labels with the wire slug demoted to mono', () => {
  mount([])
  const select = screen.getByRole('combobox')
  expect(screen.getByRole('option', { name: MOVE_LABEL.scale_servings })).toBeInTheDocument()
  for (const opt of screen.getAllByRole('option')) {
    expect(opt.textContent).not.toMatch(/^[a-z]+(_[a-z]+)+$/) // no raw slugs
  }
  fireEvent.change(select, { target: { value: 'scale_servings' } })
  const slugHint = screen.getByText('scale_servings')
  expect(slugHint.className).toMatch(/font-mono/)
})

test('an empty thread opens in the kitchen voice', () => {
  mount([])
  expect(screen.getByText(EMPTY_THREAD)).toBeInTheDocument()
})

test('the steer field is labeled Direction', () => {
  mount([])
  expect(screen.getByLabelText(/direction \(optional\)/i)).toBeInTheDocument()
})

test('suggested-next chips speak plain labels, slug demoted to mono', () => {
  render(<SteeringPane thread={[]} suggestedNext={['scale_servings']}
    canPropose onPropose={() => {}} />)
  const chip = screen.getByRole('button', { name: new RegExp(MOVE_LABEL.scale_servings, 'i') })
  expect(chip.textContent).toContain('scale_servings')
})

test('auto-applied thread entries speak the plain move label', () => {
  mount([{ kind: 'auto', moveType: 'scale_servings', versionId: 'ver_x1' }])
  expect(screen.getByTestId('auto-advanced'))
    .toHaveTextContent(`auto-applied: ${MOVE_LABEL.scale_servings}`)
})
