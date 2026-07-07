import { render, screen, fireEvent } from '@testing-library/react'
import SafetyBlock from './SafetyBlock'

function renderBlock() {
  const onRegenerate = vi.fn()
  const onRedirect = vi.fn()
  render(
    <SafetyBlock
      reason="anaerobic garlic-in-oil risk"
      ruleId="anaerobic-garlic-oil"
      onRegenerate={onRegenerate}
      onRedirect={onRedirect}
    />,
  )
  return { onRegenerate, onRedirect }
}

test('shows the reason and rule id', () => {
  renderBlock()
  const block = screen.getByTestId('safety-block')
  expect(block).toHaveTextContent('anaerobic garlic-in-oil risk')
  expect(block).toHaveTextContent('anaerobic-garlic-oil')
})

test('offers only regenerate and redirect affordances', () => {
  renderBlock()
  expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Redirect' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /accept|edit|alternatives|take over/i })).not.toBeInTheDocument()
})

test('dispatches regenerate and redirect-with-steer', () => {
  const { onRegenerate, onRedirect } = renderBlock()
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))
  expect(onRegenerate).toHaveBeenCalled()
  // Redirect requires steer text: disabled until typed.
  expect(screen.getByRole('button', { name: 'Redirect' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText(/redirect/i), { target: { value: 'use vinegar instead' } })
  fireEvent.click(screen.getByRole('button', { name: 'Redirect' }))
  expect(onRedirect).toHaveBeenCalledWith('use vinegar instead')
})
