import { render, screen, waitFor } from '@testing-library/react'
import App from './App'
import type { Proposal } from './types'

const stub: Proposal = {
  id: 'p1', diff: [{ op: 'add', path: 'ingredients', value: '2 cloves garlic' }],
  rationale: 'Depth.', citations: [], confidence: 0.7, unverified: [], safetyBlock: null,
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => stub })) as unknown as typeof fetch)
})

test('loads a proposal into the workbench', async () => {
  render(<App />)
  await waitFor(() => expect(screen.getByText(/2 cloves garlic/)).toBeInTheDocument())
  expect(screen.getByTestId('draft-pane')).toBeInTheDocument()
})
