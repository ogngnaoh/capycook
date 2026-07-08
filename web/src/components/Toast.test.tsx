import { render, screen } from '@testing-library/react'
import { Toast } from './Toast'

test('renders nothing when the message is empty', () => {
  const { container } = render(<Toast message="" />)
  expect(container).toBeEmptyDOMElement()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('renders as a status region when a message is set', () => {
  render(<Toast message="Trial retired. The kitchen will draft another." />)
  expect(screen.getByRole('status')).toHaveTextContent('Trial retired. The kitchen will draft another.')
})
