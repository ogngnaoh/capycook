import { render } from '@testing-library/react'
import SteeringPane, { type ThreadEntry } from './SteeringPane'

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
