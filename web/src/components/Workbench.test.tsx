import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import Workbench from './Workbench'
import { MockEventSource, dishDetail, jsonResponse, sampleDraft, sampleProposal } from '../fixtures'
import {
  ANNOUNCE_MOVE_CANCELLED, ANNOUNCE_MOVE_FAILED, ANNOUNCE_PROPOSING,
  GATE_ANNOUNCE, MOVE_LABEL, STATE_GLOSS, STATE_LABEL, announceProposalReady,
} from '../vocab'
import type { DishDetail, LLMStatusResponse, VersionsResponse } from '../types'

let detail: DishDetail
let llmStatus: LLMStatusResponse
let versionsData: VersionsResponse
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  sessionStorage.clear()
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
  // Reload mid-move: the dish is proposing and GET reports the in-flight
  // move, whose proposal-ready then lands the card.
  detail = dishDetail({ state: 'proposing', inFlightMoveId: 'mv_9' })
  const es = await mount()
  act(() => es.emit('proposal-ready', { moveId: 'mv_9', proposal: sampleProposal({ id: 'pr_9', move_id: 'mv_9' }) }))
  expect(screen.getByText('A tighter concept.')).toBeInTheDocument()
  for (const label of ['Accept', 'Ask for changes', 'More']) {
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
  }
  fireEvent.click(screen.getByRole('button', { name: 'More' }))
  for (const label of ['Edit', 'Regenerate', 'Alternatives', 'Take over']) {
    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
  }
})

test('a stale proposal-ready after the gate resolves does not resurrect the card', async () => {
  // The SSE hub replays rationale tokens on a cadence and emits
  // proposal-ready at the end; a fast accept (stub mode resolves moves
  // instantly) lands before that tail. The late event is stale theater —
  // it must not re-open the gate the server already resolved.
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/dishes/d1/move') return jsonResponse({ moveId: 'mv_9' })
    if (url === '/api/dishes/d1/gate') {
      return jsonResponse({ verb: 'accept', proposalId: 'pr_9', newVersionId: 'ver_2' })
    }
    if (url === '/api/dishes/d1') return jsonResponse(detail)
    if (url === '/api/status') return jsonResponse(llmStatus)
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  const es = await mount()
  fireEvent.click(screen.getByRole('button', { name: /propose a move/i }))
  await waitFor(() => {
    expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/dishes/d1/move')).toBe(true)
  })
  const ready = { moveId: 'mv_9', proposal: sampleProposal({ id: 'pr_9', move_id: 'mv_9' }) }
  act(() => es.emit('proposal-ready', ready))
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument())
  // The token replay's trailing proposal-ready arrives after the accept.
  act(() => es.emit('proposal-ready', ready))
  expect(screen.queryByTestId('proposal-card')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument()
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

test('two pending proposals render as a comparison radio group; checking one targets it', async () => {
  const a = sampleProposal({ id: 'pr_a', rationale: 'Card A rationale.' })
  const b = sampleProposal({ id: 'pr_b', rationale: 'Card B rationale.' })
  detail = dishDetail({ state: 'awaiting_gate', pendingProposal: a, pendingProposals: [a, b] })
  await mount()
  const radios = screen.getAllByRole('radio')
  expect(radios).toHaveLength(2)
  expect(radios[0]).toHaveAttribute('aria-checked', 'true')
  // The selected alternative is the recipe-diff canvas below the switcher.
  expect(screen.getByTestId('proposed-draft')).toHaveTextContent('Card A rationale.')
  fireEvent.click(radios[1])
  expect(screen.getByTestId('proposed-draft')).toHaveTextContent('Card B rationale.')
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
  await waitFor(() => {
    const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/dishes/d1/gate')
    expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({ proposalId: 'pr_b' })
  })
})

test('a single proposal takes over the canvas as the would-be recipe', async () => {
  detail = dishDetail({
    state: 'awaiting_gate',
    pendingProposal: sampleProposal(),
    pendingProposals: [sampleProposal()],
  })
  await mount()
  // The decision object owns the fold: the canvas IS the would-be draft.
  expect(screen.getByTestId('proposed-draft')).toBeInTheDocument()
  expect(screen.queryByTestId('draft-pane')).not.toBeInTheDocument()
  // The wire-level card stays one disclosure away.
  expect(screen.queryByTestId('proposal-card')).not.toBeInTheDocument()
})

test('an empty draft with a proposal pending shows the would-be recipe, not an empty note', async () => {
  // The old empty-state invitation is obsolete here: with the proposal
  // rendered as the canvas, the review surface is the canvas itself.
  detail = dishDetail({
    state: 'awaiting_gate',
    draft: sampleDraft({ title: '', concept: '', ingredients: [], steps: [], flavor_rationale: [] }),
    pendingProposal: sampleProposal(),
    pendingProposals: [sampleProposal()],
  })
  render(<Workbench dishId="d1" onNavigate={() => {}} />)
  await screen.findByTestId('proposed-draft')
  expect(screen.queryByText(/empty draft/i)).not.toBeInTheDocument()
  expect(screen.queryByText(/propose the first move/i)).not.toBeInTheDocument()
})

test('proposal-blocked shows the safety hold with its evidence, focused, with only the legal verbs', async () => {
  const es = await mount()
  act(() => es.emit('proposal-blocked', {
    moveId: 'mv_9', reason: 'anaerobic garlic-in-oil', ruleId: 'anaerobic-garlic-oil',
    ops: [{ op: 'add', path: '/steps/-', value: { text: 'Steep garlic in oil overnight.', technique: 'infuse', internal_temp_c: null, why: '' } }],
  }))
  const block = screen.getByTestId('safety-block')
  expect(block).toHaveTextContent('anaerobic garlic-in-oil')
  expect(block).toHaveTextContent('anaerobic-garlic-oil')
  // The held change stays visible as grayed evidence, and the hold takes focus.
  expect(screen.getByTestId('blocked-evidence')).toHaveTextContent('Steep garlic in oil overnight.')
  expect(block).toHaveFocus()
  expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ask for changes' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /accept|^edit$|alternatives|take over|more/i })).not.toBeInTheDocument()
})

test('redirect while blocked opens the steer form and targets the blocked move', async () => {
  const es = await mount()
  act(() => es.emit('proposal-blocked', {
    moveId: 'mv_9', reason: 'anaerobic garlic-in-oil', ruleId: 'anaerobic-garlic-oil',
  }))
  fireEvent.click(screen.getByRole('button', { name: 'Ask for changes' }))
  fireEvent.change(screen.getByLabelText(/^direction$/i), { target: { value: 'use vinegar instead' } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() => {
    const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/dishes/d1/gate')
    expect(call).toBeTruthy()
    expect(JSON.parse((call![1] as RequestInit).body as string)).toMatchObject({
      proposalId: 'mv_9', verb: 'redirect', edit: { steer: 'use vinegar instead' },
    })
  })
})

test('an unsafe human write warns-and-confirms with the reason, not the wire prefix', async () => {
  detail = dishDetail({
    state: 'awaiting_gate',
    pendingProposal: sampleProposal(),
    pendingProposals: [sampleProposal()],
  })
  const reason = 'Room-temperature garlic-in-oil supports Clostridium botulinum growth.'
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/dishes/d1/gate') {
      return jsonResponse({ error: `orchestrator: safety warning requires confirm override: ${reason}` }, 409)
    }
    if (url === '/api/dishes/d1') return jsonResponse(detail)
    if (url === '/api/status') return jsonResponse(llmStatus)
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'More' }))
  fireEvent.click(screen.getByRole('button', { name: 'Take over' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  const prompt = await screen.findByTestId('override-prompt')
  expect(prompt).toHaveTextContent(reason)
  // The internal error prefix is wire plumbing, not cook-facing copy.
  expect(prompt).not.toHaveTextContent(/orchestrator:/)
})

test('the override prompt is a modal alert dialog: named, described, Back-focused, Escape returns to the gate', async () => {
  detail = dishDetail({
    state: 'awaiting_gate',
    pendingProposal: sampleProposal(),
    pendingProposals: [sampleProposal()],
  })
  const reason = 'Room-temperature garlic-in-oil supports Clostridium botulinum growth.'
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/dishes/d1/gate') {
      return jsonResponse({ error: `orchestrator: safety warning requires confirm override: ${reason}` }, 409)
    }
    if (url === '/api/dishes/d1') return jsonResponse(detail)
    if (url === '/api/status') return jsonResponse(llmStatus)
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'More' }))
  fireEvent.click(screen.getByRole('button', { name: 'Take over' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
  const dialog = await screen.findByRole('alertdialog', { name: /safety warning/i })
  // Native modal dialog, described by the safety message.
  expect(dialog.tagName).toBe('DIALOG')
  expect((dialog as HTMLDialogElement).open).toBe(true)
  expect(dialog).toHaveAccessibleDescription(reason)
  // Focus opens on the least destructive action.
  await waitFor(() => expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus())
  // Escape cancels; focus lands back in the gate bar, where the flow began.
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(screen.queryByTestId('override-prompt')).not.toBeInTheDocument()
  await waitFor(() => {
    expect(screen.getByTestId('gate-bar').contains(document.activeElement)).toBe(true)
  })
})

test('a permanent status region narrates the gate lifecycle, never the token stream', async () => {
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url === '/api/dishes/d1/move') return jsonResponse({ moveId: 'mv_9' })
    if (url === '/api/dishes/d1') return jsonResponse(detail)
    if (url === '/api/status') return jsonResponse(llmStatus)
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  const es = await mount()
  const region = screen.getByTestId('gate-live-region')
  expect(region).toHaveAttribute('role', 'status')
  expect(region.className).toMatch(/sr-only/)
  // Tokens stream silently — only lifecycle transitions speak.
  act(() => es.emit('token', { moveId: 'mv_9', text: 'Building depth.' }))
  expect(region).not.toHaveTextContent(/building depth/i)
  fireEvent.click(screen.getByRole('button', { name: /propose a move/i }))
  expect(region).toHaveTextContent(ANNOUNCE_PROPOSING)
  // The POST settles and hands the wait to mv_9 — its proposal announces.
  await waitFor(() => {
    expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/dishes/d1/move')).toBe(true)
  })
  act(() => es.emit('proposal-ready', { moveId: 'mv_9', proposal: sampleProposal({ id: 'pr_9', move_id: 'mv_9' }) }))
  await waitFor(() => expect(region).toHaveTextContent(announceProposalReady(1)))
  act(() => es.emit('move-failed', { moveId: 'mv_9', reason: 'llm: parse error' }))
  expect(region).toHaveTextContent(ANNOUNCE_MOVE_FAILED)
  act(() => es.emit('move-cancelled', { moveId: 'mv_9' }))
  expect(region).toHaveTextContent(ANNOUNCE_MOVE_CANCELLED)
})

test('accepting announces through the status region', async () => {
  detail = dishDetail({
    state: 'awaiting_gate',
    pendingProposal: sampleProposal(),
    pendingProposals: [sampleProposal()],
  })
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'Accept' }))
  expect(screen.getByTestId('gate-live-region')).toHaveTextContent(GATE_ANNOUNCE.accept)
})

test('proposal arrival moves focus to the proposal heading', async () => {
  detail = dishDetail({ state: 'proposing', inFlightMoveId: 'mv_9' })
  const es = await mount()
  act(() => es.emit('proposal-ready', { moveId: 'mv_9', proposal: sampleProposal({ id: 'pr_9', move_id: 'mv_9' }) }))
  await waitFor(() => {
    const heading = document.getElementById('proposal-heading')
    expect(heading).not.toBeNull()
    expect(heading).toHaveFocus()
  })
})

test('opening a verb panel focuses its first field; cancel returns focus to the gate bar', async () => {
  detail = dishDetail({
    state: 'awaiting_gate',
    pendingProposal: sampleProposal(),
    pendingProposals: [sampleProposal()],
  })
  await mount()
  fireEvent.click(screen.getByRole('button', { name: 'More' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  const form = await screen.findByTestId('edit-form')
  expect(form.querySelector('input')).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await waitFor(() => {
    expect(screen.getByTestId('gate-bar').contains(document.activeElement)).toBe(true)
  })
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

test('post-cook: "I cooked this" on a version posts iterate_feedback with baseVersion and threads the entry', async () => {
  versionsData = {
    currentVersionId: 'ver_1',
    versions: [
      { id: 'ver_1', parentVersionId: null, createdAt: '2026-07-06T00:00:00Z', draft: sampleDraft() },
    ],
  }
  await mount()
  // The trial record is persistent — "I cooked this" sits on the current pill.
  await screen.findByTestId('trial-strip')
  fireEvent.click(screen.getByRole('button', { name: 'I cooked this' }))
  fireEvent.change(screen.getByLabelText(/tasting notes/i),
    { target: { value: 'too salty — cut the feta by half' } })
  fireEvent.click(screen.getByRole('button', { name: 'Propose a rework' }))
  await waitFor(() => {
    const call = fetchMock.mock.calls.find(([u]) => String(u) === '/api/dishes/d1/move')
    expect(call).toBeTruthy()
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
      moveType: 'iterate_feedback',
      steer: 'too salty — cut the feta by half',
      baseVersion: 'ver_1',
    })
  })
  // The iteration entry lands in the thread: cooked version → feedback.
  const entry = screen.getByTestId('cooked-entry')
  expect(entry).toHaveTextContent(/cooked/i)
  expect(entry).toHaveTextContent('ver_1')
  expect(entry).toHaveTextContent('too salty — cut the feta by half')
})

test('a dropped stream shows the quiet reconnecting banner until it reopens', async () => {
  const es = await mount()
  act(() => es.fail())
  expect(screen.getByTestId('reconnect-banner')).toHaveTextContent(/reconnecting — your draft is safe/i)
  act(() => es.open())
  await waitFor(() => expect(screen.queryByTestId('reconnect-banner')).not.toBeInTheDocument())
})

test('move-failed offers Try again, which re-posts the same move', async () => {
  const es = await mount()
  fireEvent.change(screen.getByLabelText(/direction \(optional\)/i), { target: { value: 'brighter' } })
  fireEvent.click(screen.getByRole('button', { name: 'Propose a move' }))
  await waitFor(() => {
    expect(fetchMock.mock.calls.some(([u]) => String(u) === '/api/dishes/d1/move')).toBe(true)
  })
  act(() => es.emit('move-failed', { moveId: 'mv_9', reason: 'llm: parse error' }))
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => {
    const moves = fetchMock.mock.calls.filter(([u]) => String(u) === '/api/dishes/d1/move')
    expect(moves).toHaveLength(2)
    expect(JSON.parse((moves[1][1] as RequestInit).body as string))
      .toEqual(JSON.parse((moves[0][1] as RequestInit).body as string))
  })
})

test('move_auto_advanced collapses into an auto-applied thread entry', async () => {
  await mount()
  // Deterministic move with the dial ON: the 202 resolves before the GET,
  // which returns idle with a fresh version id — no SSE event fires.
  detail = dishDetail({ currentVersionId: 'ver_2' })
  fireEvent.change(screen.getByLabelText(/move type/i), { target: { value: 'scale_servings' } })
  fireEvent.click(screen.getByRole('button', { name: /propose a move/i }))
  const entry = await screen.findByTestId('auto-advanced')
  expect(entry).toHaveTextContent(`auto-applied: ${MOVE_LABEL.scale_servings}`)
})

test('the header speaks kitchen states with a plain gloss and a functional dial name', async () => {
  detail = dishDetail({ state: 'awaiting_gate' })
  await mount()
  expect(screen.getByText(STATE_LABEL.awaiting_gate)).toBeInTheDocument()
  expect(screen.getByText(new RegExp(STATE_GLOSS.awaiting_gate))).toBeInTheDocument()
  // The dial's accessible name contains its visible label (2.5.3).
  expect(screen.getByRole('switch', { name: /auto-apply safe steps/i })).toBeInTheDocument()
})
