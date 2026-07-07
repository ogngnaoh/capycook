import { render, screen } from '@testing-library/react'
import { ApproximateChip, CitationChip, ConfidenceChip, UnverifiedChip } from './Chips'

test('citation chip renders source and ref in mono on the info surface', () => {
  render(<CitationChip citation={{ source: 'FlavorGraph', ref: 'edge:12', date: '2026-07-06' }} />)
  const chip = screen.getByText('FlavorGraph #edge:12')
  expect(chip.className).toMatch(/bg-info-surface/)
  expect(chip.className).toMatch(/font-mono/)
})

test('unverified chip keeps its text label on the warning surface in AA ink', () => {
  render(<UnverifiedChip label="resting time" />)
  const chip = screen.getByText('[unverified] resting time')
  expect(chip.className).toMatch(/bg-warning-surface/)
  // 11px text on warning-surface must be ink (AA); warning color is border-only.
  expect(chip.className).toMatch(/text-ink/)
  expect(chip.className).toMatch(/border-warning/)
  expect(chip.className).not.toMatch(/text-warning/)
})

test('bare unverified chip renders the [unverified] marker alone', () => {
  render(<UnverifiedChip />)
  expect(screen.getByText('[unverified]')).toBeInTheDocument()
})

test('confidence chip renders the score in mono on a neutral hairline chip', () => {
  render(<ConfidenceChip confidence={0.85} />)
  const chip = screen.getByText('conf 0.85')
  expect(chip.className).toMatch(/border-hairline/)
  expect(chip.className).not.toMatch(/bg-info-surface|bg-warning-surface/)
})

test('deterministic confidence 1.0 renders a deterministic chip on the info surface', () => {
  render(<ConfidenceChip confidence={1} />)
  expect(screen.getByText('deterministic').className).toMatch(/bg-info-surface/)
  expect(screen.queryByText(/conf 1/)).not.toBeInTheDocument()
})

test('approximate cost chip renders on the warning surface in AA ink', () => {
  render(<ApproximateChip />)
  const chip = screen.getByText('[approximate]')
  expect(chip.className).toMatch(/bg-warning-surface/)
  expect(chip.className).toMatch(/text-ink/)
  expect(chip.className).not.toMatch(/text-warning/)
})
