import { fireEvent, render, screen } from '@testing-library/react'
import type { Op } from '../types'
import { BLOCKED_REDIRECT, BLOCKED_REGEN } from '../vocab'
import SafetyHold from './SafetyHold'

// Re-homes the pre-redesign safety block test's §9-relevant assertions
// (role=alert + self-focus, ops rendered via opLineLabel, a hold without ops
// still renders) plus SafetyHold's own new behavior: the hold now owns the
// two legal verbs directly instead of leaving them to the gate bar.
const ops: Op[] = [
  { op: 'replace', path: '/title', from: 'Chicken', value: 'Confit Chicken' },
  {
    op: 'add', path: '/steps/-',
    value: { text: 'Steep the garlic in oil overnight at room temperature.', technique: 'infuse', internal_temp_c: null, why: '' },
  },
]

function noop() {}

test('speaks the hold with role=alert, reason, and takes focus on mount', () => {
  render(<SafetyHold reason="anaerobic garlic-in-oil risk" ruleId="anaerobic-garlic-oil" technical={false}
    onRegenerate={noop} onRedirectSubmit={noop} />)
  const hold = screen.getByRole('alert')
  expect(hold).toHaveAttribute('tabindex', '-1')
  expect(hold).toHaveFocus()
  expect(hold).toHaveTextContent('anaerobic garlic-in-oil risk')
})

test('the killed ops render as struck lines via opLineLabel — dish notation, never raw wire tuples', () => {
  render(<SafetyHold reason="r" ruleId="rule-1" ops={ops} technical={false}
    onRegenerate={noop} onRedirectSubmit={noop} />)
  expect(screen.getByText('Title — changed')).toBeInTheDocument()
  expect(screen.getByText('Method — added')).toBeInTheDocument()
})

test('a hold without ops (older events) still renders, with no evidence section', () => {
  render(<SafetyHold reason="r" ruleId="rule-1" ops={null} technical={false}
    onRegenerate={noop} onRedirectSubmit={noop} />)
  expect(screen.getByRole('alert')).toHaveTextContent('r')
  expect(screen.queryByText(/What it would have added/)).not.toBeInTheDocument()
})

test('technical toggles the mono rule_id line', () => {
  const { rerender } = render(<SafetyHold reason="r" ruleId="anaerobic-garlic-oil" technical={false}
    onRegenerate={noop} onRedirectSubmit={noop} />)
  expect(screen.queryByText(/rule_id:/)).not.toBeInTheDocument()
  rerender(<SafetyHold reason="r" ruleId="anaerobic-garlic-oil" technical
    onRegenerate={noop} onRedirectSubmit={noop} />)
  expect(screen.getByText(/rule_id:\s*anaerobic-garlic-oil/)).toBeInTheDocument()
})

test('exactly two verbs live on the hold: ink-filled regenerate, ghost redirect', () => {
  render(<SafetyHold reason="r" ruleId="rule-1" technical={false}
    onRegenerate={noop} onRedirectSubmit={noop} />)
  expect(screen.getAllByRole('button')).toHaveLength(2)
  expect(screen.getByRole('button', { name: BLOCKED_REGEN })).toHaveAttribute('data-verb', 'regenerate')
  expect(screen.getByRole('button', { name: BLOCKED_REDIRECT })).toHaveAttribute('data-verb', 'redirect')
})

test('regenerate fires onRegenerate', () => {
  const onRegenerate = vi.fn()
  render(<SafetyHold reason="r" ruleId="rule-1" technical={false}
    onRegenerate={onRegenerate} onRedirectSubmit={noop} />)
  fireEvent.click(screen.getByRole('button', { name: BLOCKED_REGEN }))
  expect(onRegenerate).toHaveBeenCalled()
})

test('redirect expands an inline steer input; submit fires onRedirectSubmit, disabled while blank', () => {
  const onRedirectSubmit = vi.fn()
  render(<SafetyHold reason="r" ruleId="rule-1" technical={false}
    onRegenerate={noop} onRedirectSubmit={onRedirectSubmit} />)
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: BLOCKED_REDIRECT }))
  const input = screen.getByRole('textbox')
  const send = screen.getByRole('button', { name: 'Send' })
  expect(send).toBeDisabled()
  fireEvent.change(input, { target: { value: 'use pasteurized eggs instead' } })
  expect(send).not.toBeDisabled()
  fireEvent.click(send)
  expect(onRedirectSubmit).toHaveBeenCalledWith('use pasteurized eggs instead')
})
