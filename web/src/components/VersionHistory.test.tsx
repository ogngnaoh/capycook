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

test('lists the chain, marks current and sibling branches, promotes and selects', () => {
  const onSelect = vi.fn()
  const onPromote = vi.fn()
  render(<VersionHistory data={data} selectedId={null} onSelect={onSelect} onPromote={onPromote} />)

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
