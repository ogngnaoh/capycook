import { fireEvent, render, screen } from '@testing-library/react'
import { sampleDraft, sampleProposal } from '../fixtures'
import type { Ingredient, Op } from '../types'
import AlternativesPicker, { summarizeOps } from './AlternativesPicker'

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

test('renders one card per proposal, letter-badged with a deltaSummary headline', () => {
  render(<AlternativesPicker proposals={[altA, altB]} base={sampleDraft()} onPick={() => {}} />)
  const cards = screen.getAllByTestId('alt-card')
  expect(cards).toHaveLength(2)
  expect(cards[0]).toHaveTextContent('A')
  expect(cards[0]).toHaveTextContent('+ lemon')
  expect(cards[1]).toHaveTextContent('B')
  expect(cards[1]).toHaveTextContent('+ yogurt')
})

test('each card is one button; picking fires onPick with its proposal id', () => {
  const onPick = vi.fn()
  render(<AlternativesPicker proposals={[altA, altB]} base={sampleDraft()} onPick={onPick} />)
  const cards = screen.getAllByRole('button')
  expect(cards).toHaveLength(2)
  fireEvent.click(cards[1])
  expect(onPick).toHaveBeenCalledWith('pr_b')
})

test('change lines carry a sign and the op label', () => {
  render(<AlternativesPicker proposals={[altA, altB]} base={sampleDraft()} onPick={() => {}} />)
  const cards = screen.getAllByTestId('alt-card')
  expect(cards[0]).toHaveTextContent('+ lemon')
})

test('the blurb trims a long rationale to ~140 chars; a short one renders verbatim', () => {
  const longRationale = 'A'.repeat(200)
  const altLong = sampleProposal({ id: 'pr_long', rationale: longRationale, change: [] })
  render(<AlternativesPicker proposals={[altLong, altB]} base={sampleDraft()} onPick={() => {}} />)
  const blurbs = screen.getAllByTestId('alt-blurb')
  expect(blurbs[0].textContent?.length).toBeLessThanOrEqual(141)
  expect(blurbs[0].textContent?.endsWith('…')).toBe(true)
  expect(blurbs[1].textContent).toBe(altB.rationale)
})

test('summarizeOps: add is "+", replace/remove are "→", capped at 4 lines + "+n more"', () => {
  const base = sampleDraft()
  const ops: Op[] = [
    { op: 'add', path: '/ingredients/-', value: ing('lemon') },
    { op: 'replace', path: '/title', from: 'Old', value: 'New' },
    { op: 'remove', path: '/ingredients/1', from: ing('thyme') },
    { op: 'add', path: '/steps/-', value: { text: 'Sear', technique: 'saute', internal_temp_c: null, why: '' } },
    { op: 'add', path: '/steps/-', value: { text: 'Rest', technique: 'rest', internal_temp_c: null, why: '' } },
  ]
  const lines = summarizeOps(ops, base)
  expect(lines).toHaveLength(5) // 4 real + one "+1 more"
  expect(lines[0]).toEqual({ sign: '+', text: '+ lemon' })
  expect(lines[1].sign).toBe('→')
  expect(lines[2].sign).toBe('→')
  expect(lines[2].text).toContain('thyme')
  expect(lines[4]).toEqual({ sign: '+', text: '+1 more' })
})

test('4 or fewer ops render with no "+n more" line', () => {
  const base = sampleDraft()
  const ops: Op[] = [{ op: 'add', path: '/ingredients/-', value: ing('lemon') }]
  expect(summarizeOps(ops, base)).toHaveLength(1)
})
