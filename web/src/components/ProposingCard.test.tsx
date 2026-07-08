import { fireEvent, render, screen } from '@testing-library/react'
import ProposingCard from './ProposingCard'

test('renders the working label and the streamed text', () => {
  render(<ProposingCard text="Considering a brighter finish" onCancel={() => {}} />)
  expect(screen.getByText(/Working on your idea/i)).toBeInTheDocument()
  expect(screen.getByText('Considering a brighter finish')).toBeInTheDocument()
})

test('Stop fires onCancel', () => {
  const onCancel = vi.fn()
  render(<ProposingCard text="" onCancel={onCancel} />)
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
  expect(onCancel).toHaveBeenCalled()
})

test('the spinner is decorative and a blinking caret trails the text', () => {
  render(<ProposingCard text="..." onCancel={() => {}} />)
  expect(screen.getByTestId('proposing-spinner')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.getByTestId('proposing-caret')).toBeInTheDocument()
})
