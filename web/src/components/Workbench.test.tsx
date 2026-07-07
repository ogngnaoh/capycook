import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import Workbench from './Workbench'
import { MockEventSource, dishDetail, jsonResponse, sampleProposal } from '../fixtures'
import type { DishDetail, LLMStatusResponse } from '../types'

let detail: DishDetail
let llmStatus: LLMStatusResponse
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  sessionStorage.clear()
  MockEventSource.reset()
  vi.stubGlobal('EventSource', MockEventSource)
  detail = dishDetail()
  llmStatus = { llm_mode: 'live', model: 'deepseek-v4-pro', budget_spent_usd: 0, budget_cap_usd: 10 }
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/dishes/d1') return jsonResponse(detail)
    if (url === '/api/dishes/d1/versions') {
      return jsonResponse({ currentVersionId: detail.currentVersionId, versions: [] })
    }
    if (url === '/api/status') return jsonResponse(llmStatus)
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
})

async function mount() {
  render(<Workbench dishId="d1" onNavigate={() => {}} />)
  // The title renders in both the header and the draft pane.
  await screen.findAllByText('Seared Chicken Thighs')
  return MockEventSource.instances[0]
}

test('opens one EventSource per dish and streams tokens into the thread', async () => {
  const es = await mount()
  expect(MockEventSource.instances).toHaveLength(1)
  expect(es.url).toBe('/api/dishes/d1/stream')
  act(() => es.emit('token', { moveId: 'mv_9', text: 'Building ' }))
  act(() => es.emit('token', { moveId: 'mv_9', text: 'depth.' }))
  expect(screen.getByText(/Building depth\./)).toBeInTheDocument()
})

test('proposal-ready lands the card at the gate with all six verbs', async () => {
  const es = await mount()
  act(() => es.emit('proposal-ready', { moveId: 'mv_9', proposal: sampleProposal({ id: 'pr_9', move_id: 'mv_9' }) }))
  expect(screen.getByText('A tighter concept.')).toBeInTheDocument()
  for (const label of ['Accept', 'Edit', 'Regenerate', 'Alternatives', 'Redirect', 'Take over']) {
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
  }
})

test('accept posts the gate verb with the pending proposal id and session header', async () => {
  detail = dishDetail({
    state: 'awaiting_gate',
    pendingProposal: sampleProposal(),
    pendingProposals: [sampleProposal()],
  })
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
  await waitFor(() => {
    const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/dishes/d1/gate')
    expect(call).toBeTruthy()
    const init = call![1] as RequestInit
    expect(JSON.parse(init.body as string)).toMatchObject({ proposalId: 'pr_1', verb: 'accept' })
    expect((init.headers as Record<string, string>)['X-Session-Id']).toBeTruthy()
  })
})

test('two pending proposals render as a card picker; choosing one targets it', async () => {
  const a = sampleProposal({ id: 'pr_a', rationale: 'Card A rationale.' })
  const b = sampleProposal({ id: 'pr_b', rationale: 'Card B rationale.' })
  detail = dishDetail({ state: 'awaiting_gate', pendingProposal: a, pendingProposals: [a, b] })
  await mount()
  expect(screen.getByText('Card A rationale.')).toBeInTheDocument()
  expect(screen.getByText('Card B rationale.')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Card B rationale.'))
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
  await waitFor(() => {
    const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/dishes/d1/gate')
    expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({ proposalId: 'pr_b' })
  })
})

test('proposal-blocked shows the safety block with only regenerate/redirect', async () => {
  const es = await mount()
  act(() => es.emit('proposal-blocked', {
    moveId: 'mv_9', reason: 'anaerobic garlic-in-oil', ruleId: 'anaerobic-garlic-oil',
  }))
  const block = screen.getByTestId('safety-block')
  expect(block).toHaveTextContent('anaerobic garlic-in-oil')
  expect(block).toHaveTextContent('anaerobic-garlic-oil')
  expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()
})

test('move-failed shows a failure banner distinct from the safety block', async () => {
  const es = await mount()
  act(() => es.emit('move-failed', { moveId: 'mv_9', reason: 'llm: parse error' }))
  expect(screen.getByTestId('move-failed-banner')).toHaveTextContent('llm: parse error')
  expect(screen.queryByTestId('safety-block')).not.toBeInTheDocument()
})

test('cancel button replaces the gate bar while proposing', async () => {
  detail = dishDetail({ state: 'proposing', inFlightMoveId: 'mv_5' })
  await mount()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()
})

test('reconnect after a stream drop re-syncs state via GET', async () => {
  const es = await mount()
  fetchMock.mockClear()
  act(() => es.fail())
  act(() => es.open())
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/dishes/d1'))
})

test('stub mode: /api/status llm_mode=stub renders the header banner', async () => {
  llmStatus = { llm_mode: 'stub', budget_spent_usd: 0, budget_cap_usd: 10 }
  await mount()
  const banner = await screen.findByTestId('stub-banner')
  expect(banner).toHaveTextContent('stub mode — no model key')
})

test('live mode: no stub banner once /api/status has answered', async () => {
  await mount()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/status'))
  expect(screen.queryByTestId('stub-banner')).not.toBeInTheDocument()
})

test('move_auto_advanced collapses into an auto-applied thread entry', async () => {
  await mount()
  // Deterministic move with the dial ON: the 202 resolves before the GET,
  // which returns idle with a fresh version id — no SSE event fires.
  detail = dishDetail({ currentVersionId: 'ver_2' })
  fireEvent.change(screen.getByLabelText(/move type/i), { target: { value: 'scale_servings' } })
  fireEvent.click(screen.getByRole('button', { name: /propose a move/i }))
  const entry = await screen.findByTestId('auto-advanced')
  expect(entry).toHaveTextContent('auto-applied: scale_servings')
})
