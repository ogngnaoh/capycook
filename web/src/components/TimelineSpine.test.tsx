import { render, screen, fireEvent } from '@testing-library/react'
import TimelineSpine from './TimelineSpine'
import type { TimelineNode } from '../lib/trials'

// Three nodes: a past cooked trial (ver_1), the current trial (ver_2, also
// the one being viewed, and a branch sibling), and a pending decision node
// (buildTimeline's synthetic '__pending' entry — never clickable, never
// promotable).
const nodes: TimelineNode[] = [
  {
    id: 'ver_1', n: 1, head: 'Trial 1', note: 'First concept', when: 'Mon 1:00p',
    cooked: true, cookNote: 'Needed more salt', branch: false,
    isCurrent: false, isViewing: false, pending: false, auto: false,
  },
  {
    id: 'ver_2', n: 2, head: 'Trial 2', note: 'Second concept', when: 'Mon 2:00p',
    cooked: false, cookNote: undefined, branch: true,
    isCurrent: true, isViewing: true, pending: false, auto: false,
  },
  {
    id: 'pending', n: 3, head: 'Trial 3 — your decision', note: 'Cutting salt', when: '',
    cooked: false, cookNote: undefined, branch: false,
    isCurrent: false, isViewing: false, pending: true, auto: false,
  },
]

function mount(over: Partial<Parameters<typeof TimelineSpine>[0]> = {}) {
  const props = {
    nodes, summary: 'Trial 3 · you cooked Trial 1', nextHint: 'Next: propose a move',
    technical: false, onView: vi.fn(), onPromote: vi.fn(),
    ...over,
  }
  render(<TimelineSpine {...props} />)
  return props
}

test('renders one aria-current="true" node — the current trial, not the pending one', () => {
  mount()
  // getByRole throws if more than one match, so this also proves exactly one.
  const current = screen.getByRole('button', { current: true })
  expect(current).toHaveTextContent('Trial 2')
})

test('the pending node has no clickable card — onView never fires for it', () => {
  const { onView } = mount()
  expect(screen.queryByRole('button', { name: /trial 3/i })).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('Trial 3 — your decision'))
  expect(onView).not.toHaveBeenCalled()
})

test('clicking a real, non-pending card calls onView with its id', () => {
  const { onView } = mount()
  fireEvent.click(screen.getByRole('button', { name: /trial 1/i }))
  expect(onView).toHaveBeenCalledWith('ver_1')
})

test('Promote to trunk appears only on non-current real nodes, and fires onPromote(id)', () => {
  const { onPromote } = mount()
  const promoteButtons = screen.getAllByRole('button', { name: 'Promote to trunk' })
  expect(promoteButtons).toHaveLength(1) // ver_2 is current, pending is not real — only ver_1 qualifies
  fireEvent.click(promoteButtons[0])
  expect(onPromote).toHaveBeenCalledWith('ver_1')
})

test('a cooked node renders the Cooked badge and its cook-note quote', () => {
  mount()
  expect(screen.getByText('Cooked')).toBeInTheDocument()
  expect(screen.getByText('Branch')).toBeInTheDocument() // ver_2 only
  expect(screen.getByText(/Needed more salt/)).toBeInTheDocument()
})

// BC-D-7 de-risk: the BRANCH badge alone is color/label-only self-explanation
// ("Branch" carries no context on its own); a branch trial also carries a
// quiet text note naming the trial it forked from, exposed as real text in
// the accessibility tree (not merely implied by position on the rail). A
// dedicated node list (rather than the shared `nodes` fixture) keeps the
// "Trial 1" the note names from colliding with other cards' own "Trial 1"
// accessible names in unrelated tests above.
test('a branch node carries an inline "Branched from Trial N" note naming its parent trial', () => {
  const branchNodes: TimelineNode[] = [
    {
      id: 'ver_1', n: 1, head: 'Trial 1', note: 'First concept', when: 'Mon 1:00p',
      cooked: false, cookNote: undefined, branch: false,
      isCurrent: false, isViewing: false, pending: false, auto: false,
    },
    {
      id: 'ver_2', n: 2, head: 'Trial 2', note: 'Second concept', when: 'Mon 2:00p',
      cooked: false, cookNote: undefined, branch: true, branchFromN: 1,
      isCurrent: true, isViewing: true, pending: false, auto: false,
    },
  ]
  mount({ nodes: branchNodes })
  const branchCard = screen.getByRole('button', { name: /^Trial 2\b/ })
  expect(branchCard).toHaveTextContent(/Branched from/)
  expect(branchCard.textContent).toMatch(/Branched from.*Trial 1/)
})

test('a non-branch node renders no "Branched from" note even when cooked', () => {
  mount()
  const trial1Card = screen.getByRole('button', { name: /^Trial 1\b/ })
  expect(trial1Card).not.toHaveTextContent('Branched from')
})

// BC-F-3: an auto-applied trial carries a durable, text-exposed marker the
// vanished toast can't provide — unconditional on the spine card (never
// gated behind technical view, same as Cooked/Branch), and never color-only.
test('an auto-applied trial renders the Auto-applied badge; a human-accepted one does not', () => {
  const mixed: TimelineNode[] = [
    { ...nodes[0], id: 'ver_1', head: 'Trial 1', auto: true },
    { ...nodes[1], id: 'ver_2', head: 'Trial 2', auto: false },
  ]
  mount({ nodes: mixed })
  expect(screen.getByText('Auto-applied')).toBeInTheDocument()
  const autoCard = screen.getByRole('button', { name: /^Trial 1\b/ })
  const humanCard = screen.getByRole('button', { name: /^Trial 2\b/ })
  expect(autoCard).toHaveTextContent('Auto-applied')
  expect(humanCard).not.toHaveTextContent('Auto-applied')
})

test('technical toggles the ver-id line', () => {
  const { rerender } = render(<TimelineSpine nodes={nodes} summary="s" nextHint="n" technical={false} onView={vi.fn()} onPromote={vi.fn()} />)
  expect(screen.queryByText('ver_1')).not.toBeInTheDocument()

  rerender(<TimelineSpine nodes={nodes} summary="s" nextHint="n" technical onView={vi.fn()} onPromote={vi.fn()} />)
  expect(screen.getByText('ver_1')).toBeInTheDocument()
  expect(screen.getByText('ver_2')).toBeInTheDocument()
})

test('renders the eyebrow summary and the dashed next-node hint', () => {
  mount()
  expect(screen.getByText('Trial 3 · you cooked Trial 1')).toBeInTheDocument()
  expect(screen.getByText('Next: propose a move')).toBeInTheDocument()
})
