import { render, screen } from '@testing-library/react'
import SafetyBlock from './SafetyBlock'

test('shows the reason and rule id', () => {
  render(<SafetyBlock reason="anaerobic garlic-in-oil risk" ruleId="anaerobic-garlic-oil" />)
  const block = screen.getByTestId('safety-block')
  expect(block).toHaveTextContent('anaerobic garlic-in-oil risk')
  expect(block).toHaveTextContent('anaerobic-garlic-oil')
})

test('is display-only: the blocked verbs live in the gate bar', () => {
  render(<SafetyBlock reason="r" ruleId="rule-1" />)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
