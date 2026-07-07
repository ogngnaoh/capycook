import { render, screen } from '@testing-library/react'
import type { Op } from '../types'
import { CORRECTIVE_ACTION, SAFETY_HOLD_TITLE } from '../vocab'
import SafetyBlock from './SafetyBlock'

const ops: Op[] = [
  { op: 'replace', path: '/title', from: 'Chicken', value: 'Confit Chicken' },
  {
    op: 'add', path: '/steps/-',
    value: { text: 'Steep the garlic in oil overnight at room temperature.', technique: 'infuse', internal_temp_c: null, why: '' },
  },
]

test('speaks the safety hold with the reason and a mono rule chip', () => {
  render(<SafetyBlock reason="anaerobic garlic-in-oil risk" ruleId="anaerobic-garlic-oil" />)
  const block = screen.getByTestId('safety-block')
  expect(block).toHaveTextContent(SAFETY_HOLD_TITLE)
  expect(block).toHaveTextContent('anaerobic garlic-in-oil risk')
  expect(block).toHaveTextContent('anaerobic-garlic-oil')
})

test('keeps the blocked change as grayed evidence with the rule anchored to the offending line', () => {
  render(<SafetyBlock reason="anaerobic garlic-in-oil risk" ruleId="anaerobic-garlic-oil" ops={ops} />)
  const evidence = screen.getByTestId('blocked-evidence')
  // Both ops render, in cook vocabulary, visibly held (grayed).
  expect(evidence).toHaveTextContent('Title — changed')
  expect(evidence).toHaveTextContent('Method — added')
  expect(evidence).toHaveTextContent('Steep the garlic in oil overnight')
  // The rule anchors to the line whose content matches it, not the header only.
  const anchored = screen.getByTestId('rule-anchor')
  expect(anchored).toHaveTextContent('anaerobic-garlic-oil')
  expect(anchored.closest('li')).toHaveTextContent(/garlic in oil/i)
})

test('a hold without ops (older events) still renders', () => {
  render(<SafetyBlock reason="r" ruleId="rule-1" ops={null} />)
  expect(screen.getByTestId('safety-block')).toHaveTextContent('rule-1')
  expect(screen.queryByTestId('blocked-evidence')).not.toBeInTheDocument()
})

test('a corrective-action row precedes the verbs', () => {
  render(<SafetyBlock reason="r" ruleId="rule-1" ops={ops} />)
  expect(screen.getByTestId('safety-block')).toHaveTextContent(new RegExp(CORRECTIVE_ACTION, 'i'))
})

test('takes focus so the hold is announced and reachable', () => {
  render(<SafetyBlock reason="r" ruleId="rule-1" />)
  expect(screen.getByTestId('safety-block')).toHaveFocus()
})

test('is display-only: the blocked verbs live in the gate bar', () => {
  render(<SafetyBlock reason="r" ruleId="rule-1" ops={ops} />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
