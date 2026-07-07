import { fireEvent, render, screen } from '@testing-library/react'
import { sampleDraft, sampleProposal } from '../fixtures'
import type { Ingredient, Proposal } from '../types'
import { MOVE_LABEL } from '../vocab'
import ProposedDraftView, { TECH_VIEW_KEY } from './ProposedDraftView'

const ing = (name: string): Ingredient =>
  ({ name, fdc_id: null, foodon_id: null, qty: 1, unit: 'piece' })

function proposal(over: Partial<Proposal> = {}): Proposal {
  return sampleProposal({
    move_type: 'ingredient_change',
    change: [
      { op: 'replace', path: '/title', from: 'Seared Chicken Thighs', value: 'Lemon Chicken Thighs' },
      { op: 'remove', path: '/ingredients/1' },
      { op: 'add', path: '/ingredients/-', value: ing('lemon') },
    ],
    rationale: 'Brightens the pan sauce.',
    ...over,
  })
}

beforeEach(() => localStorage.clear())

test('the canvas shows the would-be recipe with inline change marks', () => {
  render(<ProposedDraftView base={sampleDraft()} proposal={proposal()} />)
  const view = screen.getByTestId('proposed-draft')
  // Title change reads was/now.
  expect(view).toHaveTextContent('Lemon Chicken Thighs')
  expect(view.querySelector('del')).toHaveTextContent('Seared Chicken Thighs')
  // The removed ingredient is still visible, struck, in place.
  const struck = [...view.querySelectorAll('del')].map((d) => d.textContent)
  expect(struck.some((t) => t?.includes('thyme'))).toBe(true)
  // The added ingredient renders inserted.
  const added = [...view.querySelectorAll('ins')].map((d) => d.textContent)
  expect(added.some((t) => t?.includes('lemon'))).toBe(true)
  // Untouched rows render plain.
  expect(view).toHaveTextContent('chicken thigh')
})

test('the header speaks the move in plain words with the slug demoted and the rationale in one line', () => {
  render(<ProposedDraftView base={sampleDraft()} proposal={proposal()} />)
  expect(screen.getByText(MOVE_LABEL.ingredient_change)).toBeInTheDocument()
  expect(screen.getByText('ingredient_change').className).toMatch(/font-mono/)
  expect(screen.getByText('Brightens the pan sauce.')).toBeInTheDocument()
})

test('raw pointers, confidence, and provenance stay out of the default view', () => {
  render(<ProposedDraftView base={sampleDraft()} proposal={proposal()} />)
  expect(screen.queryByText(/\/ingredients/)).not.toBeInTheDocument()
  expect(screen.queryByText(/conf 0\.72/)).not.toBeInTheDocument()
  expect(screen.queryByTestId('proposal-card')).not.toBeInTheDocument()
})

test('Technical view is a persisted disclosure of the raw proposal card', () => {
  const { unmount } = render(<ProposedDraftView base={sampleDraft()} proposal={proposal()} />)
  const toggle = screen.getByRole('button', { name: /technical view/i })
  expect(toggle).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(toggle)
  expect(screen.getByTestId('proposal-card')).toBeInTheDocument()
  expect(localStorage.getItem(TECH_VIEW_KEY)).toBe('1')
  unmount()
  // The preference persists across mounts — power users see it always.
  render(<ProposedDraftView base={sampleDraft()} proposal={proposal()} />)
  expect(screen.getByTestId('proposal-card')).toBeInTheDocument()
})

test('changes outside the recipe sections render as labeled lines', () => {
  const p = proposal({
    change: [{ op: 'replace', path: '/constraints/servings', from: 2, value: 4 }],
  })
  render(<ProposedDraftView base={sampleDraft()} proposal={p} />)
  expect(screen.getByRole('group', { name: 'Station card — changed' })).toBeInTheDocument()
})
