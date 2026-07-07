import { render, screen, fireEvent } from '@testing-library/react'
import TrialStrip from './TrialStrip'
import { sampleDraft } from '../fixtures'
import { shortRef, trialAlias } from '../vocab'
import type { VersionItem, VersionsResponse } from '../types'

// Three trials off one dish: v2 and v3 both fork from v1, so both are branch
// siblings; v3 is the trial in service (currentVersionId).
const versions: VersionItem[] = [
  { id: 'ver_1111111100000000', parentVersionId: null, createdAt: '2026-07-06T00:00:00Z', draft: sampleDraft({ title: 'One' }) },
  { id: 'ver_2222222200000000', parentVersionId: 'ver_1111111100000000', createdAt: '2026-07-06T00:01:00Z', draft: sampleDraft({ title: 'Two' }) },
  { id: 'ver_3333333300000000', parentVersionId: 'ver_1111111100000000', createdAt: '2026-07-06T00:02:00Z', draft: sampleDraft({ title: 'Three' }) },
]
const data: VersionsResponse = { currentVersionId: 'ver_3333333300000000', versions }

function mount(over: Partial<Parameters<typeof TrialStrip>[0]> = {}) {
  const props = {
    data, selectedId: null as string | null,
    onSelect: vi.fn(), onPromote: vi.fn(), onCook: vi.fn(), canCook: true,
    ...over,
  }
  render(<TrialStrip {...props} />)
  return props
}

test('renders one pill per trial oldest→newest as TRIAL n · ver_8char, and selects a snapshot on click', () => {
  const { onSelect } = mount()
  const pills = screen.getAllByRole('button', { name: /trial \d/i })
  expect(pills.map((b) => b.textContent)).toEqual([
    expect.stringContaining(trialAlias(1)),
    expect.stringContaining(trialAlias(2)),
    expect.stringContaining(trialAlias(3)),
  ])
  // Each pill carries the 8-char mono hash ref.
  expect(screen.getByText(shortRef('ver_1111111100000000'))).toBeInTheDocument()
  expect(screen.getByText(shortRef('ver_3333333300000000'))).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: /trial 1/i }))
  expect(onSelect).toHaveBeenCalledWith(versions[0])
})

test('marks the current trial with aria-current and a non-color visual marker', () => {
  mount()
  const current = screen.getByRole('button', { name: /trial 3/i })
  expect(current).toHaveAttribute('aria-current', 'true')
  // Non-color channel: the marker carries text for assistive tech.
  expect(current).toHaveTextContent(/current/i)
  expect(screen.getByRole('button', { name: /trial 1/i })).not.toHaveAttribute('aria-current')
})

test('indicates branch forks — trials that share a parent', () => {
  mount()
  // v2 and v3 both fork off v1; the collapsed strip shows only the pill markers.
  expect(screen.getAllByText('branch')).toHaveLength(2)
})

test('the current pill carries the tasting-notes affordance and reworks from the current trial', () => {
  const { onCook } = mount()
  // Only the trial in service is cookable.
  const cook = screen.getAllByRole('button', { name: 'I cooked this' })
  expect(cook).toHaveLength(1)
  fireEvent.click(cook[0])
  const box = screen.getByLabelText(/tasting notes/i)
  fireEvent.change(box, { target: { value: 'too salty — cut the feta' } })
  fireEvent.click(screen.getByRole('button', { name: 'Propose a rework' }))
  expect(onCook).toHaveBeenCalledWith('ver_3333333300000000', 'too salty — cut the feta')
})

test('empty tasting notes cannot be sent', () => {
  const { onCook } = mount()
  fireEvent.click(screen.getByRole('button', { name: 'I cooked this' }))
  fireEvent.click(screen.getByRole('button', { name: 'Propose a rework' }))
  expect(onCook).not.toHaveBeenCalled()
})

test('a busy dish disables the tasting-notes entry point', () => {
  mount({ canCook: false })
  expect(screen.getByRole('button', { name: 'I cooked this' })).toBeDisabled()
})

test('the Trials disclosure expands downward into the full version history', () => {
  mount()
  expect(screen.queryByTestId('version-history')).not.toBeInTheDocument()
  const toggle = screen.getByRole('button', { name: 'Trials' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(toggle)
  expect(screen.getByTestId('version-history')).toBeInTheDocument()
  expect(toggle).toHaveAttribute('aria-expanded', 'true')
})

test('promoting from the expansion calls onPromote for that trial', () => {
  const { onPromote } = mount()
  fireEvent.click(screen.getByRole('button', { name: 'Trials' }))
  // Promote is offered on the non-current trials (v1, v2) in chain order.
  fireEvent.click(screen.getAllByRole('button', { name: 'Promote' })[0])
  expect(onPromote).toHaveBeenCalledWith('ver_1111111100000000')
})

test('optional summaryOf renders a per-pill delta summary as the pill title', () => {
  const summaryOf = (v: VersionItem) => (v.id === 'ver_2222222200000000' ? '+ lemon' : undefined)
  mount({ summaryOf })
  expect(screen.getByRole('button', { name: /trial 2/i })).toHaveAttribute('title', '+ lemon')
  expect(screen.getByRole('button', { name: /trial 1/i })).not.toHaveAttribute('title')
})
