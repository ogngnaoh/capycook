import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'
import Workbench from './Workbench'
import { MockEventSource, dishDetail, jsonResponse, sampleDraft, sampleProposal } from '../fixtures'
import {
  ANNOUNCE_MOVE_CANCELLED, ANNOUNCE_MOVE_FAILED, ANNOUNCE_PROPOSING,
  BLOCKED_REDIRECT, BLOCKED_REGEN, GATE_ANNOUNCE, GATE_ANOTHER_LABEL,
  MOVE_LABEL, STATE_LABEL, VERB_LABEL, announceProposalReady,
} from '../vocab'
import type { DishDetail, LLMStatusResponse, VersionsResponse } from '../types'

// The Workbench suite drives the whole integrated screen (task 9): the new
// header + timeline spine + stage + gate bar wired to the mock api/stream
// harness. Every §9 behavioral contract is guarded here.
let detail: DishDetail
let llmStatus: LLMStatusResponse
let versionsData: VersionsResponse
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  MockEventSource.reset()
  vi.stubGlobal('EventSource', MockEventSource)
  detail = dishDetail()
  llmStatus = { llm_mode: 'live', model: 'deepseek-v4-pro', budget_spent_usd: 0, budget_cap_usd: 10 }
  versionsData = { currentVersionId: detail.currentVersionId, versions: [] }
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/dishes/d1') return jsonResponse(detail)
    if (url === '/api/dishes/d1/versions') return jsonResponse(versionsData)
    if (url === '/api/status') return jsonResponse(llmStatus)
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
})

// flush drains all pending microtasks plus one macrotask inside act(), so the
// setState that lands at the tail of an async fetch chain (dish → versions →
// status; a move's GET; a resync) is applied under act — never after the
// assertion returns. This is the fix for the old suite's act() warnings: a
// waitFor on a fetch *call* passes the instant fetch is invoked, but the
// resulting setState resolves a few microtasks later, escaping act.
async function flush() {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
}

// mount renders the workbench and settles the three initial GETs (dish,
// versions, status) so a test's synchronous assertions never race an
// unflushed state update.
async function mount() {
  render(<Workbench dishId="d1" onNavigate={() => {}} />)
  await screen.findAllByText('Seared Chicken Thighs')
  await flush()
  return MockEventSource.instances[0]
}

// --- load + render ---------------------------------------------------------

test('opens one EventSource per dish and renders the dish on the stage', async () => {
  const es = await mount()
  expect(MockEventSource.instances).toHaveLength(1)
  expect(es.url).toBe('/api/dishes/d1/stream')
  // The dish card is the stage centrepiece; the title is also the header h1.
  expect(screen.getByTestId('dish-card')).toHaveTextContent('Seared Chicken Thighs')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Seared Chicken Thighs')
})

// --- streaming -------------------------------------------------------------

test('tokens stream into the ProposingCard, whose text grows', async () => {
  detail = dishDetail({ state: 'proposing', inFlightMoveId: 'mv_9' })
  const es = await mount()
  const card = screen.getByTestId('proposing-card')
  act(() => es.emit('token', { moveId: 'mv_9', text: 'Building ' }))
  act(() => es.emit('token', { moveId: 'mv_9', text: 'depth.' }))
  expect(card).toHaveTextContent('Building depth.')
})

test('a token for a different move id never appends (expectedMove guard)', async () => {
  detail = dishDetail({ state: 'proposing', inFlightMoveId: 'mv_9' })
  const es = await mount()
  act(() => es.emit('token', { moveId: 'mv_OTHER', text: 'ghost text' }))
  expect(screen.getByTestId('proposing-card')).not.toHaveTextContent('ghost text')
})

// --- proposal ready → gate -------------------------------------------------

test('proposal-ready lands the gate bar, announces, and drops a pending node in the timeline', async () => {
  detail = dishDetail({ state: 'proposing', inFlightMoveId: 'mv_9' })
  const es = await mount()
  act(() => es.emit('proposal-ready', { moveId: 'mv_9', proposal: sampleProposal({ id: 'pr_9', move_id: 'mv_9' }) }))
  // The gate bar is the decision surface, carrying the front-line verbs.
  const bar = screen.getByTestId('gate-bar')
  expect(within(bar).getByRole('button', { name: new RegExp(VERB_LABEL.accept, 'i') })).toBeInTheDocument()
  // The ProposalHeader banner reads the plain-language intent.
  expect(screen.getByTestId('proposal-header')).toHaveTextContent("Here's the change I'd make")
  // The status region announced the arrival.
  expect(screen.getByTestId('gate-live-region')).toHaveTextContent(announceProposalReady(1))
  // The timeline gained the synthetic "your decision" node.
  expect(screen.getByLabelText('Development timeline')).toHaveTextContent(/your decision/i)
})

test('a stale proposal-ready after the gate resolves does not resurrect the gate', async () => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/dishes/d1/move') return jsonResponse({ moveId: 'mv_9' })
    if (url === '/api/dishes/d1/gate') return jsonResponse({ verb: 'accept', proposalId: 'pr_9', newVersionId: 'ver_2' })
    if (url === '/api/dishes/d1') return jsonResponse(detail)
    if (url === '/api/dishes/d1/versions') return jsonResponse(versionsData)
    if (url === '/api/status') return jsonResponse(llmStatus)
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  const es = await mount()
  // Start a move from the idle intent bar.
  fireEvent.change(screen.getByLabelText(/what do you want to try next/i), { target: { value: 'brighter' } })
  fireEvent.click(screen.getByRole('button', { name: /try it/i }))
  await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/dishes/d1/move')).toBe(true))
  await flush() // settle propose's GET → setDetail
  const ready = { moveId: 'mv_9', proposal: sampleProposal({ id: 'pr_9', move_id: 'mv_9' }) }
  act(() => es.emit('proposal-ready', ready))
  fireEvent.click(within(screen.getByTestId('gate-bar')).getByRole('button', { name: new RegExp(VERB_LABEL.accept, 'i') }))
  await waitFor(() => expect(screen.queryByTestId('gate-bar')).not.toBeInTheDocument())
  await flush() // settle the accept's resync + version refresh
  // The token replay's trailing proposal-ready arrives after the accept.
  act(() => es.emit('proposal-ready', ready))
  expect(screen.queryByTestId('gate-bar')).not.toBeInTheDocument()
})

test('accept posts the gate verb with the pending proposal id and session header, then flashes a toast', async () => {
  detail = dishDetail({ state: 'awaiting_gate', pendingProposal: sampleProposal(), pendingProposals: [sampleProposal()] })
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/dishes/d1/gate') return jsonResponse({ verb: 'accept', proposalId: 'pr_1', newVersionId: 'ver_2' })
    if (url === '/api/dishes/d1') return jsonResponse(detail)
    if (url === '/api/dishes/d1/versions') return jsonResponse(versionsData)
    if (url === '/api/status') return jsonResponse(llmStatus)
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  await mount()
  fireEvent.click(within(screen.getByTestId('gate-bar')).getByRole('button', { name: new RegExp(VERB_LABEL.accept, 'i') }))
  await waitFor(() => {
    const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/dishes/d1/gate')
    expect(call).toBeTruthy()
    const init = call![1] as RequestInit
    expect(JSON.parse(init.body as string)).toMatchObject({ proposalId: 'pr_1', verb: 'accept' })
    expect((init.headers as Record<string, string>)['X-Session-Id']).toBeTruthy()
  })
  await waitFor(() => expect(screen.getByTestId('toast')).toBeInTheDocument())
})

test('accepting announces through the permanent status region', async () => {
  detail = dishDetail({ state: 'awaiting_gate', pendingProposal: sampleProposal(), pendingProposals: [sampleProposal()] })
  await mount()
  fireEvent.click(within(screen.getByTestId('gate-bar')).getByRole('button', { name: new RegExp(VERB_LABEL.accept, 'i') }))
  expect(screen.getByTestId('gate-live-region')).toHaveTextContent(GATE_ANNOUNCE.accept)
  await flush() // settle runGate's async tail so it stays inside act()
})

test('proposal arrival lands focus on the gate bar’s first verb', async () => {
  detail = dishDetail({ state: 'proposing', inFlightMoveId: 'mv_9' })
  const es = await mount()
  act(() => es.emit('proposal-ready', { moveId: 'mv_9', proposal: sampleProposal({ id: 'pr_9', move_id: 'mv_9' }) }))
  await waitFor(() => {
    const accept = within(screen.getByTestId('gate-bar')).getByRole('button', { name: new RegExp(VERB_LABEL.accept, 'i') })
    expect(accept).toHaveFocus()
  })
})

// --- alternatives ----------------------------------------------------------

test('two sequential proposal-ready events accumulate into the picker; picking one yields the diff view', async () => {
  detail = dishDetail({ state: 'proposing', inFlightMoveId: 'mv_9' })
  const es = await mount()
  const a = sampleProposal({ id: 'pr_a', move_id: 'mv_9', rationale: 'Card A rationale.' })
  const b = sampleProposal({ id: 'pr_b', move_id: 'mv_9', rationale: 'Card B rationale.' })
  act(() => es.emit('proposal-ready', { moveId: 'mv_9', proposal: a }))
  act(() => es.emit('proposal-ready', { moveId: 'mv_9', proposal: b }))
  // Two accumulated proposals render the comparison picker, not a gate bar.
  expect(screen.getAllByTestId('alt-card')).toHaveLength(2)
  expect(screen.queryByTestId('gate-bar')).not.toBeInTheDocument()
  // Picking the second collapses the picker into that proposal's diff view.
  fireEvent.click(screen.getAllByTestId('alt-card')[1])
  expect(screen.queryByTestId('alternatives-picker')).not.toBeInTheDocument()
  expect(screen.getByTestId('dish-card')).toBeInTheDocument()
  const bar = screen.getByTestId('gate-bar')
  fireEvent.click(within(bar).getByRole('button', { name: new RegExp(VERB_LABEL.accept, 'i') }))
  await waitFor(() => {
    const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/dishes/d1/gate')
    expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({ proposalId: 'pr_b' })
  })
})

// --- all six verbs wired through the real GateBar --------------------------

test('regenerate dispatches through the gate bar with the pending proposal id and the right verb', async () => {
  detail = dishDetail({ state: 'awaiting_gate', pendingProposal: sampleProposal({ id: 'pr_7' }), pendingProposals: [sampleProposal({ id: 'pr_7' })] })
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/dishes/d1/gate') return jsonResponse({ verb: 'regenerate', proposalId: 'pr_7' })
    if (url === '/api/dishes/d1') return jsonResponse(detail)
    if (url === '/api/dishes/d1/versions') return jsonResponse(versionsData)
    if (url === '/api/status') return jsonResponse(llmStatus)
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  await mount()
  const bar = screen.getByTestId('gate-bar')
  fireEvent.click(within(bar).getByRole('button', { name: GATE_ANOTHER_LABEL }))
  fireEvent.click(within(bar).getByRole('button', { name: VERB_LABEL.regenerate }))
  await waitFor(() => {
    const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/dishes/d1/gate')
    expect(call).toBeTruthy()
    expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({ proposalId: 'pr_7', verb: 'regenerate' })
  })
  await flush()
})

test('alternatives dispatches through the gate bar with the pending proposal id and the right verb', async () => {
  detail = dishDetail({ state: 'awaiting_gate', pendingProposal: sampleProposal({ id: 'pr_8' }), pendingProposals: [sampleProposal({ id: 'pr_8' })] })
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/dishes/d1/gate') return jsonResponse({ verb: 'alternatives', proposalId: 'pr_8' })
    if (url === '/api/dishes/d1') return jsonResponse(detail)
    if (url === '/api/dishes/d1/versions') return jsonResponse(versionsData)
    if (url === '/api/status') return jsonResponse(llmStatus)
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  await mount()
  const bar = screen.getByTestId('gate-bar')
  fireEvent.click(within(bar).getByRole('button', { name: GATE_ANOTHER_LABEL }))
  fireEvent.click(within(bar).getByRole('button', { name: VERB_LABEL.alternatives }))
  await waitFor(() => {
    const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/dishes/d1/gate')
    expect(call).toBeTruthy()
    expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({ proposalId: 'pr_8', verb: 'alternatives' })
  })
  await flush()
})

test('edit dispatches through the gate bar: opening Tweak, changing one op value, and submitting carries edit.ops', async () => {
  const proposal = sampleProposal({
    id: 'pr_9', change: [{ op: 'replace', path: '/title', from: 'Old Title', value: 'New Title' }],
  })
  detail = dishDetail({ state: 'awaiting_gate', pendingProposal: proposal, pendingProposals: [proposal] })
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/dishes/d1/gate') return jsonResponse({ verb: 'edit', proposalId: 'pr_9', newVersionId: 'ver_2' })
    if (url === '/api/dishes/d1') return jsonResponse(detail)
    if (url === '/api/dishes/d1/versions') return jsonResponse(versionsData)
    if (url === '/api/status') return jsonResponse(llmStatus)
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  await mount()
  const bar = screen.getByTestId('gate-bar')
  fireEvent.click(within(bar).getByRole('button', { name: VERB_LABEL.edit }))
  const form = await screen.findByTestId('tweak-form')
  fireEvent.change(form.querySelector('input')!, { target: { value: 'Edited Title' } })
  fireEvent.click(screen.getByRole('button', { name: /keep with edit/i }))
  await waitFor(() => {
    const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/dishes/d1/gate')
    expect(call).toBeTruthy()
    const body = JSON.parse((call![1] as RequestInit).body as string)
    expect(body).toMatchObject({ proposalId: 'pr_9', verb: 'edit' })
    expect(body.edit.ops).toEqual([{ op: 'replace', path: '/title', from: 'Old Title', value: 'Edited Title' }])
  })
})

// --- safety hold -----------------------------------------------------------

test('proposal-blocked shows the safety hold, focused, with exactly two verbs and the dish still visible', async () => {
  const es = await mount()
  act(() => es.emit('proposal-blocked', {
    moveId: 'mv_9', reason: 'anaerobic garlic-in-oil', ruleId: 'anaerobic-garlic-oil',
    ops: [{ op: 'add', path: '/steps/-', value: { text: 'Steep garlic in oil overnight.', technique: 'infuse', internal_temp_c: null, why: '' } }],
  }))
  const hold = screen.getByTestId('safety-hold')
  expect(hold).toHaveTextContent('anaerobic garlic-in-oil')
  expect(hold).toHaveFocus()
  // Exactly the two legal verbs — never accept/edit/more.
  const verbs = within(hold).getAllByRole('button')
  expect(verbs).toHaveLength(2)
  expect(within(hold).getByRole('button', { name: BLOCKED_REGEN })).toBeInTheDocument()
  expect(within(hold).getByRole('button', { name: BLOCKED_REDIRECT })).toBeInTheDocument()
  expect(screen.queryByTestId('gate-bar')).not.toBeInTheDocument()
  // The dish stays visible under the hold.
  expect(screen.getByTestId('dish-card')).toBeInTheDocument()
  const dish = screen.getByTestId('dish-card')
  expect(hold.compareDocumentPosition(dish) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('redirect while blocked opens the steer form and targets the blocked move', async () => {
  const es = await mount()
  act(() => es.emit('proposal-blocked', {
    moveId: 'mv_9', reason: 'anaerobic garlic-in-oil', ruleId: 'anaerobic-garlic-oil',
  }))
  fireEvent.click(screen.getByRole('button', { name: BLOCKED_REDIRECT }))
  fireEvent.change(screen.getByLabelText(/direct the next attempt/i), { target: { value: 'use vinegar instead' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() => {
    const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/dishes/d1/gate')
    expect(call).toBeTruthy()
    expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({
      proposalId: 'mv_9', verb: 'redirect', edit: { steer: 'use vinegar instead' },
    })
  })
})

test('move-failed shows a failure banner distinct from the safety hold', async () => {
  const es = await mount()
  act(() => es.emit('move-failed', { moveId: 'mv_9', reason: 'llm: parse error' }))
  expect(screen.getByTestId('move-failed-banner')).toHaveTextContent('llm: parse error')
  expect(screen.queryByTestId('safety-hold')).not.toBeInTheDocument()
})

// --- override (409 confirm) ------------------------------------------------

test('an unsafe take-over warns-and-confirms with the reason, then resends with confirmOverride', async () => {
  detail = dishDetail({ state: 'awaiting_gate', pendingProposal: sampleProposal(), pendingProposals: [sampleProposal()] })
  const reason = 'Room-temperature garlic-in-oil supports Clostridium botulinum growth.'
  let gateCalls = 0
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/dishes/d1/gate') {
      gateCalls += 1
      const body = JSON.parse((init!.body as string))
      if (!body.confirmOverride) {
        return jsonResponse({ error: `orchestrator: safety warning requires confirm override: ${reason}` }, 409)
      }
      return jsonResponse({ verb: 'take_over', proposalId: 'pr_1', newVersionId: 'ver_2', overridden: true })
    }
    if (url === '/api/dishes/d1') return jsonResponse(detail)
    if (url === '/api/dishes/d1/versions') return jsonResponse(versionsData)
    if (url === '/api/status') return jsonResponse(llmStatus)
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  await mount()
  const bar = screen.getByTestId('gate-bar')
  // decide → "Try another way" → "Edit it myself" → Save draft.
  fireEvent.click(within(bar).getByRole('button', { name: /try another way/i }))
  fireEvent.click(within(bar).getByRole('button', { name: new RegExp(VERB_LABEL.take_over, 'i') }))
  fireEvent.click(within(bar).getByRole('button', { name: /save draft/i }))
  const prompt = await screen.findByTestId('override-prompt')
  expect(prompt).toHaveTextContent(reason)
  expect(prompt).not.toHaveTextContent(/orchestrator:/)
  // Confirming resends the same gate call with confirmOverride:true.
  fireEvent.click(within(prompt).getByRole('button', { name: /use it anyway/i }))
  await waitFor(() => {
    const last = fetchMock.mock.calls.filter(([u]) => String(u) === '/api/dishes/d1/gate').pop()
    expect(JSON.parse((last![1] as RequestInit).body as string)).toMatchObject({
      verb: 'take_over', confirmOverride: true,
    })
  })
  expect(gateCalls).toBe(2)
})

test('an unsafe edit warns-and-confirms with the reason, then resends with confirmOverride (edit-verb 409 path)', async () => {
  const proposal = sampleProposal({ id: 'pr_1' })
  detail = dishDetail({ state: 'awaiting_gate', pendingProposal: proposal, pendingProposals: [proposal] })
  const reason = 'Room-temperature garlic-in-oil supports Clostridium botulinum growth.'
  let gateCalls = 0
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url === '/api/dishes/d1/gate') {
      gateCalls += 1
      const body = JSON.parse((init!.body as string))
      if (!body.confirmOverride) {
        return jsonResponse({ error: `orchestrator: safety warning requires confirm override: ${reason}` }, 409)
      }
      return jsonResponse({ verb: 'edit', proposalId: 'pr_1', newVersionId: 'ver_2', overridden: true })
    }
    if (url === '/api/dishes/d1') return jsonResponse(detail)
    if (url === '/api/dishes/d1/versions') return jsonResponse(versionsData)
    if (url === '/api/status') return jsonResponse(llmStatus)
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  await mount()
  const bar = screen.getByTestId('gate-bar')
  fireEvent.click(within(bar).getByRole('button', { name: VERB_LABEL.edit }))
  const form = await screen.findByTestId('tweak-form')
  fireEvent.change(form.querySelector('input')!, { target: { value: 'Garlicky Oil, Room Temperature' } })
  fireEvent.click(screen.getByRole('button', { name: /keep with edit/i }))
  const prompt = await screen.findByTestId('override-prompt')
  expect(prompt).toHaveTextContent(reason)
  expect(prompt).not.toHaveTextContent(/orchestrator:/)
  // Confirming resends the identical edit gate call with confirmOverride:true.
  fireEvent.click(within(prompt).getByRole('button', { name: /use it anyway/i }))
  await waitFor(() => {
    const last = fetchMock.mock.calls.filter(([u]) => String(u) === '/api/dishes/d1/gate').pop()
    expect(JSON.parse((last![1] as RequestInit).body as string)).toMatchObject({
      verb: 'edit', confirmOverride: true,
    })
  })
  expect(gateCalls).toBe(2)
})

test('the override prompt is a modal alert dialog: named, described, least-destructive focus, Escape cancels', async () => {
  detail = dishDetail({ state: 'awaiting_gate', pendingProposal: sampleProposal(), pendingProposals: [sampleProposal()] })
  const reason = 'Room-temperature garlic-in-oil supports Clostridium botulinum growth.'
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/dishes/d1/gate') return jsonResponse({ error: `orchestrator: safety warning requires confirm override: ${reason}` }, 409)
    if (url === '/api/dishes/d1') return jsonResponse(detail)
    if (url === '/api/dishes/d1/versions') return jsonResponse(versionsData)
    if (url === '/api/status') return jsonResponse(llmStatus)
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  await mount()
  const bar = screen.getByTestId('gate-bar')
  fireEvent.click(within(bar).getByRole('button', { name: /try another way/i }))
  fireEvent.click(within(bar).getByRole('button', { name: new RegExp(VERB_LABEL.take_over, 'i') }))
  fireEvent.click(within(bar).getByRole('button', { name: /save draft/i }))
  const dialog = await screen.findByRole('alertdialog', { name: /safety rule/i })
  expect(dialog.tagName).toBe('DIALOG')
  expect((dialog as HTMLDialogElement).open).toBe(true)
  expect(dialog).toHaveAccessibleDescription(reason)
  // Focus opens on the least destructive action (go back).
  await waitFor(() => expect(within(dialog).getByRole('button', { name: /go back/i })).toHaveFocus())
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(screen.queryByTestId('override-prompt')).not.toBeInTheDocument()
})

// --- cancel ----------------------------------------------------------------

test('while proposing, the Stop control cancels the move (no gate bar)', async () => {
  detail = dishDetail({ state: 'proposing', inFlightMoveId: 'mv_5' })
  await mount()
  expect(screen.queryByTestId('gate-bar')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/dishes/d1/cancel', expect.anything()))
})

test('the status region narrates the gate lifecycle, never the token stream', async () => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/dishes/d1/move') return jsonResponse({ moveId: 'mv_9' })
    if (url === '/api/dishes/d1') return jsonResponse(detail)
    if (url === '/api/dishes/d1/versions') return jsonResponse(versionsData)
    if (url === '/api/status') return jsonResponse(llmStatus)
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  const es = await mount()
  const region = screen.getByTestId('gate-live-region')
  expect(region).toHaveAttribute('role', 'status')
  expect(region.className).toMatch(/sr-only/)
  fireEvent.change(screen.getByLabelText(/what do you want to try next/i), { target: { value: 'brighter' } })
  fireEvent.click(screen.getByRole('button', { name: /try it/i }))
  expect(region).toHaveTextContent(ANNOUNCE_PROPOSING)
  await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/dishes/d1/move')).toBe(true))
  act(() => es.emit('proposal-ready', { moveId: 'mv_9', proposal: sampleProposal({ id: 'pr_9', move_id: 'mv_9' }) }))
  await waitFor(() => expect(region).toHaveTextContent(announceProposalReady(1)))
  act(() => es.emit('move-failed', { moveId: 'mv_9', reason: 'llm: parse error' }))
  expect(region).toHaveTextContent(ANNOUNCE_MOVE_FAILED)
  act(() => es.emit('move-cancelled', { moveId: 'mv_9' }))
  expect(region).toHaveTextContent(ANNOUNCE_MOVE_CANCELLED)
  // A streamed token never speaks.
  expect(region).not.toHaveTextContent(/brighter/)
})

// --- move failed + retry ---------------------------------------------------

test('move-failed offers Try again, which re-posts the identical move', async () => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/dishes/d1/move') return jsonResponse({ moveId: 'mv_9' })
    if (url === '/api/dishes/d1') return jsonResponse(detail)
    if (url === '/api/dishes/d1/versions') return jsonResponse(versionsData)
    if (url === '/api/status') return jsonResponse(llmStatus)
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  const es = await mount()
  fireEvent.change(screen.getByLabelText(/what do you want to try next/i), { target: { value: 'brighter' } })
  fireEvent.click(screen.getByRole('button', { name: /try it/i }))
  await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/dishes/d1/move')).toBe(true))
  act(() => es.emit('move-failed', { moveId: 'mv_9', reason: 'llm: parse error' }))
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => {
    const moves = fetchMock.mock.calls.filter(([u]) => String(u) === '/api/dishes/d1/move')
    expect(moves).toHaveLength(2)
    expect(JSON.parse((moves[1][1] as RequestInit).body as string))
      .toEqual(JSON.parse((moves[0][1] as RequestInit).body as string))
  })
})

// --- reconnect -------------------------------------------------------------

test('a dropped stream shows the reconnecting banner and re-syncs via GET on reopen', async () => {
  const es = await mount()
  act(() => es.fail())
  expect(screen.getByTestId('reconnect-banner')).toHaveTextContent(/reconnecting/i)
  fetchMock.mockClear()
  act(() => es.open())
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/dishes/d1'))
  await waitFor(() => expect(screen.queryByTestId('reconnect-banner')).not.toBeInTheDocument())
})

// --- snapshot + promote ----------------------------------------------------

test('viewing a past trial shows a read-only banner with a way back; a trial promotes to trunk', async () => {
  versionsData = {
    currentVersionId: 'ver_2',
    versions: [
      { id: 'ver_1', parentVersionId: null, createdAt: '2026-07-06T00:00:00Z', draft: sampleDraft() },
      { id: 'ver_2', parentVersionId: 'ver_1', createdAt: '2026-07-06T01:00:00Z', draft: sampleDraft() },
    ],
  }
  detail = dishDetail({ currentVersionId: 'ver_2' })
  await mount()
  // Viewing Trial 1 (a past trial) opens the read-only snapshot.
  fireEvent.click(screen.getByRole('button', { name: /trial 1/i }))
  expect(screen.getByText(/viewing a past trial/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /back to current/i }))
  expect(screen.queryByText(/viewing a past trial/i)).not.toBeInTheDocument()
  // Trial 1 (not current) can be promoted to trunk.
  fireEvent.click(screen.getByRole('button', { name: /promote to trunk/i }))
  await waitFor(() => {
    const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/dishes/d1/promote')
    expect(call).toBeTruthy()
    expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({ versionId: 'ver_1' })
  })
})

// --- cook flow -------------------------------------------------------------

test('the cook flow dispatches iterate_feedback against the current version', async () => {
  versionsData = {
    currentVersionId: 'ver_1',
    versions: [{ id: 'ver_1', parentVersionId: null, createdAt: '2026-07-06T00:00:00Z', draft: sampleDraft() }],
  }
  detail = dishDetail({ currentVersionId: 'ver_1' })
  await mount()
  fireEvent.click(screen.getByRole('button', { name: /i cooked this/i }))
  fireEvent.change(screen.getByLabelText(/tasting notes/i), { target: { value: 'too salty — cut the feta by half' } })
  fireEvent.click(screen.getByRole('button', { name: /rework from these notes/i }))
  await waitFor(() => {
    const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/dishes/d1/move')
    expect(call).toBeTruthy()
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
      moveType: 'iterate_feedback',
      steer: 'too salty — cut the feta by half',
      baseVersion: 'ver_1',
    })
  })
})

test('a cook-note round-trip renders in the timeline node for that version', async () => {
  versionsData = {
    currentVersionId: 'ver_1',
    versions: [{ id: 'ver_1', parentVersionId: null, createdAt: '2026-07-06T00:00:00Z', draft: sampleDraft() }],
  }
  detail = dishDetail({ currentVersionId: 'ver_1' })
  await mount()
  fireEvent.click(screen.getByRole('button', { name: /i cooked this/i }))
  fireEvent.change(screen.getByLabelText(/tasting notes/i), { target: { value: 'too salty — cut the feta by half' } })
  fireEvent.click(screen.getByRole('button', { name: /rework from these notes/i }))
  await waitFor(() => {
    const timeline = screen.getByLabelText('Development timeline')
    expect(timeline).toHaveTextContent('You cooked it —')
    expect(timeline).toHaveTextContent('too salty — cut the feta by half')
  })
})

// --- auto-advance ----------------------------------------------------------

test('a deterministic move that auto-advances flashes a toast, refreshes versions, and opens no gate', async () => {
  await mount()
  // Dial ON: the 202 resolves before the GET, which returns a fresh version
  // id with the dish idle — no SSE event fires.
  detail = dishDetail({ currentVersionId: 'ver_2' })
  fetchMock.mockClear()
  fireEvent.click(screen.getByRole('button', { name: new RegExp(MOVE_LABEL.unit_convert, 'i') }))
  await waitFor(() => expect(screen.getByTestId('toast')).toHaveTextContent(/applied automatically/i))
  expect(screen.getByTestId('toast')).toHaveTextContent(MOVE_LABEL.unit_convert)
  expect(screen.queryByTestId('gate-bar')).not.toBeInTheDocument()
  // Versions were refreshed after the silent advance.
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/dishes/d1/versions'))
})

// --- header / chrome -------------------------------------------------------

test('the header state pill reads from STATE_LABEL', async () => {
  detail = dishDetail({ state: 'awaiting_gate', pendingProposal: sampleProposal(), pendingProposals: [sampleProposal()] })
  await mount()
  expect(screen.getByTestId('state-pill')).toHaveTextContent(STATE_LABEL.awaiting_gate)
})

test('the autonomy dial PATCHes the dish', async () => {
  await mount()
  fireEvent.click(screen.getByRole('switch', { name: /auto-apply safe steps/i }))
  await waitFor(() => {
    const call = fetchMock.mock.calls.find(([u, i]) => String(u) === '/api/dishes/d1' && (i as RequestInit)?.method === 'PATCH')
    expect(call).toBeTruthy()
    expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({ autonomy_dial: false })
  })
})

test('the technical-view toggle persists under the shared TECH_VIEW_KEY', async () => {
  await mount()
  const toggle = screen.getByRole('button', { name: /technical view/i })
  expect(toggle).toHaveAttribute('aria-pressed', 'false')
  fireEvent.click(toggle)
  expect(toggle).toHaveAttribute('aria-pressed', 'true')
  expect(localStorage.getItem('capycook-technical-view')).toBe('1')
})

test('stub mode renders the stub strip with the budget figures', async () => {
  llmStatus = { llm_mode: 'stub', budget_spent_usd: 0, budget_cap_usd: 5 }
  await mount()
  const banner = await screen.findByTestId('stub-banner')
  expect(banner).toHaveTextContent(/stub mode/i)
  expect(banner).toHaveTextContent('$0.00 / $5.00')
})

test('live mode shows no stub strip once /api/status has answered', async () => {
  await mount()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/status'))
  expect(screen.queryByTestId('stub-banner')).not.toBeInTheDocument()
})

// --- structure / a11y ------------------------------------------------------

test('the dish title is the page h1 and the header sits outside <main>', async () => {
  await mount()
  const h1 = screen.getByRole('heading', { level: 1 })
  expect(h1).toHaveTextContent('Seared Chicken Thighs')
  const main = document.querySelector('main')!
  const header = document.querySelector('header')!
  expect(main).toBeInTheDocument()
  expect(main.contains(header)).toBe(false)
  // The stage (dish card) lives inside <main>.
  expect(main.contains(screen.getByTestId('dish-card'))).toBe(true)
})

test('the workbench sets a per-dish document.title', async () => {
  await mount()
  await waitFor(() => expect(document.title).toBe('Seared Chicken Thighs — CapyCook'))
})

test('a route change (routeNonce) focuses the dish title once the dish has loaded', async () => {
  render(<Workbench dishId="d1" onNavigate={() => {}} routeNonce={1} />)
  await screen.findAllByText('Seared Chicken Thighs')
  const h1 = screen.getByRole('heading', { level: 1 })
  await waitFor(() => expect(h1).toHaveFocus())
})

test('two skip links precede the header and jump to the dish and the decision', async () => {
  detail = dishDetail({ state: 'awaiting_gate', pendingProposal: sampleProposal(), pendingProposals: [sampleProposal()] })
  await mount()
  const dishSkip = screen.getByRole('link', { name: /skip to the dish/i })
  const decisionSkip = screen.getByRole('link', { name: /skip to the decision/i })
  const dishesBtn = screen.getByRole('button', { name: 'Dishes' })
  expect(dishSkip.compareDocumentPosition(dishesBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(decisionSkip.compareDocumentPosition(dishesBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  // The decision skip lands in the gate bar; the dish skip on the stage.
  fireEvent.click(decisionSkip)
  expect(screen.getByTestId('gate-bar').contains(document.activeElement)).toBe(true)
  fireEvent.click(dishSkip)
  expect(document.getElementById('stage')!.contains(document.activeElement) || document.activeElement === document.getElementById('stage-heading')).toBe(true)
})

test('every workbench <section> carries an accessible name', async () => {
  detail = dishDetail({ state: 'awaiting_gate', pendingProposal: sampleProposal(), pendingProposals: [sampleProposal()] })
  await mount()
  const sections = Array.from(document.querySelectorAll('section'))
  expect(sections.length).toBeGreaterThan(0)
  for (const s of sections) {
    expect(s.getAttribute('aria-label') || s.getAttribute('aria-labelledby')).toBeTruthy()
  }
})
