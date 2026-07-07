import { render, screen, fireEvent } from '@testing-library/react'
import VersionHistory from './VersionHistory'
import { sampleDraft } from '../fixtures'
import type { VersionsResponse } from '../types'

const data: VersionsResponse = {
  currentVersionId: 'v2',
  versions: [
    { id: 'v1', parentVersionId: null, createdAt: '2026-07-06T00:00:00Z', draft: sampleDraft({ title: 'One' }) },
    { id: 'v2', parentVersionId: 'v1', createdAt: '2026-07-06T00:01:00Z', draft: sampleDraft({ title: 'Two' }) },
    { id: 'v3', parentVersionId: 'v1', createdAt: '2026-07-06T00:02:00Z', draft: sampleDraft({ title: 'Three' }) },
  ],
}

function mount(over: Partial<Parameters<typeof VersionHistory>[0]> = {}) {
  const props = {
    data, selectedId: null as string | null,
    onSelect: vi.fn(), onPromote: vi.fn(), onCook: vi.fn(), canCook: true,
    ...over,
  }
  render(<VersionHistory {...props} />)
  return props
}

test('lists the chain, marks current and sibling branches, promotes and selects', () => {
  const { onSelect, onPromote } = mount()

  expect(screen.getByText('One')).toBeInTheDocument()
  expect(screen.getByText('current')).toBeInTheDocument()
  // v2 and v3 share the parent v1: both are marked as branch siblings.
  expect(screen.getAllByText('branch')).toHaveLength(2)
  // Promote offered only on non-current versions.
  expect(screen.getAllByRole('button', { name: 'Promote' })).toHaveLength(2)

  fireEvent.click(screen.getByText('Three'))
  expect(onSelect).toHaveBeenCalledWith(data.versions![2])
  fireEvent.click(screen.getAllByRole('button', { name: 'Promote' })[1])
  expect(onPromote).toHaveBeenCalledWith('v3')
})

test('"I cooked this" opens the feedback form and asks for a rework of that version', () => {
  const { onCook } = mount()
  // Every version is cookable — including the current one.
  expect(screen.getAllByRole('button', { name: 'I cooked this' })).toHaveLength(3)
  fireEvent.click(screen.getAllByRole('button', { name: 'I cooked this' })[2]) // v3
  const box = screen.getByLabelText(/how did it cook/i)
  fireEvent.change(box, { target: { value: 'too salty — cut the feta' } })
  fireEvent.click(screen.getByRole('button', { name: 'Propose a rework' }))
  expect(onCook).toHaveBeenCalledWith('v3', 'too salty — cut the feta')
})

test('empty feedback cannot be sent', () => {
  const { onCook } = mount()
  fireEvent.click(screen.getAllByRole('button', { name: 'I cooked this' })[0])
  fireEvent.click(screen.getByRole('button', { name: 'Propose a rework' }))
  expect(onCook).not.toHaveBeenCalled()
})

test('a busy dish disables the cook entry point', () => {
  // While a move is in flight (canCook=false) the entry point is disabled.
  mount({ canCook: false })
  for (const b of screen.getAllByRole('button', { name: 'I cooked this' })) {
    expect(b).toBeDisabled()
  }
})
