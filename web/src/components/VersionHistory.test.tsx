import { render, screen, fireEvent } from '@testing-library/react'
import VersionHistory from './VersionHistory'
import { sampleDraft } from '../fixtures'
import type { VersionsResponse } from '../types'

// The cook-feedback behaviors that used to live here moved to the TrialStrip's
// current pill — see TrialStrip.test.tsx. VersionHistory is now pure history +
// promote, the strip's downward expansion.
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
    onSelect: vi.fn(), onPromote: vi.fn(),
    ...over,
  }
  render(<VersionHistory {...props} />)
  return props
}

test('lists the trial chain, marks current and sibling branches, promotes and selects', () => {
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
