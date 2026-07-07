import { fireEvent, render, screen } from '@testing-library/react'
import { sampleDraft, sampleProposal } from '../fixtures'
import type { Ingredient } from '../types'
import { ALTERNATIVES_HEADER } from '../vocab'
import AlternativesPicker from './AlternativesPicker'

const ing = (name: string): Ingredient =>
  ({ name, fdc_id: null, foodon_id: null, qty: 1, unit: 'piece' })

const altA = sampleProposal({
  id: 'pr_a',
  rationale: 'Lemon finish.',
  change: [{ op: 'add', path: '/ingredients/-', value: ing('lemon') }],
})
const altB = sampleProposal({
  id: 'pr_b',
  rationale: 'Yogurt-garlic sauce.',
  change: [{ op: 'add', path: '/ingredients/-', value: ing('yogurt') }],
})

function mount(onSelect = vi.fn()) {
  render(<AlternativesPicker base={sampleDraft()} proposals={[altA, altB]}
    selectedId="pr_a" onSelect={onSelect} />)
  return onSelect
}

test('alternatives form a labeled radio group whose rows state what differs', () => {
  mount()
  const group = screen.getByRole('radiogroup', { name: ALTERNATIVES_HEADER })
  const radios = screen.getAllByRole('radio')
  expect(radios).toHaveLength(2)
  expect(group).toContainElement(radios[0])
  // Comparison rows: letter + ops-derived difference, not "Click to select".
  expect(radios[0]).toHaveAccessibleName(/A.*\+ lemon/)
  expect(radios[1]).toHaveAccessibleName(/B.*\+ yogurt/)
  expect(screen.queryByText(/click to select/i)).not.toBeInTheDocument()
})

test('the selected alternative is checked and holds the roving tab stop', () => {
  mount()
  const [a, b] = screen.getAllByRole('radio')
  expect(a).toHaveAttribute('aria-checked', 'true')
  expect(a).toHaveAttribute('tabindex', '0')
  expect(b).toHaveAttribute('aria-checked', 'false')
  expect(b).toHaveAttribute('tabindex', '-1')
})

test('arrow keys move and check; click checks', () => {
  const onSelect = mount()
  const [a, b] = screen.getAllByRole('radio')
  fireEvent.keyDown(a, { key: 'ArrowRight' })
  expect(onSelect).toHaveBeenCalledWith('pr_b')
  fireEvent.click(b)
  expect(onSelect).toHaveBeenLastCalledWith('pr_b')
})

test('arrows wrap around the group', () => {
  const onSelect = mount()
  const [a] = screen.getAllByRole('radio')
  fireEvent.keyDown(a, { key: 'ArrowLeft' })
  expect(onSelect).toHaveBeenCalledWith('pr_b')
})

test('the selected alternative renders below as the would-be recipe diff', () => {
  mount()
  const view = screen.getByTestId('proposed-draft')
  expect(view).toHaveTextContent('Lemon finish.')
  const added = [...view.querySelectorAll('ins')].map((d) => d.textContent)
  expect(added.some((t) => t?.includes('lemon'))).toBe(true)
})
