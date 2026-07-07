import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type {
  DishDetail, Draft, GateRequestBody, GateVerb, Op, Proposal,
  VersionItem, VersionsResponse,
} from '../types'
import { list } from '../types'
import {
  ApiError, getDish, getVersions, openDishStream, postCancel, postGate,
  postMove, promoteVersion, setAutonomyDial,
} from '../api'
import DraftPane from './DraftPane'
import SteeringPane, { type ThreadEntry } from './SteeringPane'
import GateBar from './GateBar'
import ProposalCard from './ProposalCard'
import SafetyBlock from './SafetyBlock'
import DialToggle from './DialToggle'
import VersionHistory from './VersionHistory'

const STATE_LABEL: Record<string, string> = {
  idle: 'Idle',
  proposing: 'Proposing…',
  awaiting_gate: 'Awaiting gate',
  blocked: 'Blocked by safety gate',
}

// VerbPanel is the verb-specific UI opened over the draft: the edit form,
// the take-over draft editor, the redirect steer prompt, or the
// warn-and-confirm override prompt for human writes.
type VerbPanel =
  | { kind: 'edit'; proposal: Proposal }
  | { kind: 'take_over'; target: string }
  | { kind: 'redirect'; target: string }
  | { kind: 'override'; message: string; resend: GateRequestBody }
  | null

// Workbench is the per-dish screen: it loads the dish, holds the one
// persistent EventSource, and drives moves and all six gate verbs against
// the real API. All gate state is server-owned; SSE events update the local
// view and every reconnect re-syncs via GET.
export default function Workbench({ dishId, onNavigate }: {
  dishId: string
  onNavigate: (to: string) => void
}) {
  const [detail, setDetail] = useState<DishDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [thread, setThread] = useState<ThreadEntry[]>([])
  const [moveFailed, setMoveFailed] = useState<{ moveId: string; reason: string } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [panel, setPanel] = useState<VerbPanel>(null)
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null)
  const [suggestedNext, setSuggestedNext] = useState<string[]>([])
  const [versions, setVersions] = useState<VersionsResponse | null>(null)
  const [showVersions, setShowVersions] = useState(false)
  const [snapshot, setSnapshot] = useState<VersionItem | null>(null)

  const resync = useCallback(async () => {
    try {
      const d = await getDish(dishId)
      setDetail(d)
      setLoadError(null)
    } catch (err) {
      setLoadError(errMessage(err))
    }
  }, [dishId])

  // Initial load plus the one persistent per-dish EventSource. A reconnect
  // re-syncs state via GET — the stream carries no history.
  useEffect(() => {
    void resync()
    const stream = openDishStream(dishId, {
      onToken: (e) => setThread((t) => appendToken(t, e.moveId, e.text)),
      onProposalReady: (e) => {
        setThread((t) => finishTokens(t, e.moveId))
        setSuggestedNext(list(e.proposal.suggested_next))
        setSelectedProposalId((cur) => cur ?? e.proposal.id)
        setDetail((d) => (d ? addPending(d, e.proposal) : d))
      },
      onProposalBlocked: (e) => {
        setThread((t) => finishTokens(t, e.moveId))
        setDetail((d) => (d ? {
          ...d, state: 'blocked', blocked: e,
          pendingProposal: undefined, pendingProposals: undefined,
          inFlightMoveId: undefined,
        } : d))
      },
      onMoveCancelled: (e) => {
        setThread((t) => [...finishTokens(t, e.moveId), { kind: 'info', text: 'move cancelled' }])
        setDetail((d) => (d && d.state === 'proposing'
          ? { ...d, state: 'idle', inFlightMoveId: undefined }
          : d))
      },
      onMoveFailed: (e) => {
        setThread((t) => finishTokens(t, e.moveId))
        setMoveFailed(e)
        setDetail((d) => (d && d.state === 'proposing'
          ? { ...d, state: 'idle', inFlightMoveId: undefined }
          : d))
      },
      onReconnect: () => { void resync() },
    })
    return () => stream.close()
  }, [dishId, resync])

  const pending = detail
    ? detail.pendingProposals ?? (detail.pendingProposal ? [detail.pendingProposal] : [])
    : []
  const selected = pending.find((p) => p.id === selectedProposalId) ?? pending[0] ?? null

  async function refreshVersions() {
    try {
      setVersions(await getVersions(dishId))
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  async function propose(moveType: string, steer: string) {
    setMoveFailed(null)
    setActionError(null)
    const beforeVersion = detail?.currentVersionId ?? null
    try {
      await postMove(dishId, moveType, steer)
      if (steer) setThread((t) => [...t, { kind: 'steer', text: steer }])
      const d = await getDish(dishId)
      setDetail(d)
      // A deterministic move with the dial ON resolved before the 202
      // returned (move_auto_advanced has no SSE event): collapse it into
      // the thread.
      if (d.state === 'idle' && d.currentVersionId && d.currentVersionId !== beforeVersion) {
        const versionId = d.currentVersionId
        setThread((t) => [...t, { kind: 'auto', moveType: moveType || 'move', versionId }])
        if (showVersions) void refreshVersions()
      }
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  async function runGate(body: GateRequestBody) {
    setActionError(null)
    setMoveFailed(null)
    try {
      const res = await postGate(dishId, body)
      setPanel(null)
      setSelectedProposalId(null)
      if (res.newVersionId) {
        setThread((t) => [...t, { kind: 'info', text: `${res.verb} → new version ${res.newVersionId}` }])
      } else if (res.newMoveId) {
        setThread((t) => [...t, { kind: 'info', text: `${res.verb} → new move` }])
      }
      await resync()
      if (showVersions) void refreshVersions()
    } catch (err) {
      // Human writes (edit/take_over) warn-and-confirm on a safety hit:
      // the orchestrator answers 409 confirm-required until the cook
      // explicitly overrides (recorded as safety_warning_overridden).
      if (err instanceof ApiError && err.status === 409 && /confirm override/i.test(err.message)
        && (body.verb === 'edit' || body.verb === 'take_over')) {
        setPanel({ kind: 'override', message: err.message, resend: { ...body, confirmOverride: true } })
        return
      }
      setActionError(errMessage(err))
    }
  }

  // gateTarget resolves the gate's idempotency key for the current state: a
  // pending proposal id at the gate, the blocked move id while blocked.
  function gateTarget(): string | null {
    if (!detail) return null
    if (detail.state === 'blocked') return detail.blocked?.moveId ?? null
    return selected?.id ?? null
  }

  function onVerb(v: GateVerb) {
    const target = gateTarget()
    if (!target) return
    switch (v) {
      case 'accept':
        void runGate({ proposalId: target, verb: 'accept' })
        break
      case 'regenerate':
        void runGate({ proposalId: target, verb: 'regenerate' })
        break
      case 'alternatives':
        void runGate({ proposalId: target, verb: 'alternatives' })
        break
      case 'edit':
        if (selected) setPanel({ kind: 'edit', proposal: selected })
        break
      case 'redirect':
        setPanel({ kind: 'redirect', target })
        break
      case 'take_over':
        setPanel({ kind: 'take_over', target })
        break
    }
  }

  async function cancelMove() {
    setActionError(null)
    try {
      await postCancel(dishId)
      await resync()
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  async function toggleDial(next: boolean) {
    try {
      const res = await setAutonomyDial(dishId, next)
      setDetail((d) => (d ? { ...d, autonomyDial: res.autonomyDial } : d))
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  async function promote(versionId: string) {
    try {
      await promoteVersion(dishId, versionId)
      setThread((t) => [...t, { kind: 'info', text: `promoted version ${versionId}` }])
      setSnapshot(null)
      await resync()
      void refreshVersions()
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  function toggleVersionsPanel() {
    const opening = !showVersions
    setShowVersions(opening)
    if (opening) void refreshVersions()
    else setSnapshot(null)
  }

  if (loadError && !detail) {
    return (
      <div className="p-6 space-y-2">
        <p className="text-sm text-gray-700">Could not load this dish: {loadError}</p>
        <button onClick={() => onNavigate('/')} className="text-sm underline">Back to dishes</button>
      </div>
    )
  }
  if (!detail) return <div className="p-6 text-sm text-gray-500">Loading…</div>

  return (
    <div className="flex flex-col h-screen">
      <header className="px-4 py-2 bg-gray-800 text-white text-sm flex items-center gap-3">
        <button onClick={() => onNavigate('/')} className="underline shrink-0">Dishes</button>
        <span className="font-semibold truncate">{detail.draft.title || detail.seed}</span>
        <span className="text-gray-300 shrink-0">— {STATE_LABEL[detail.state] ?? detail.state}</span>
        <div className="ml-auto flex items-center gap-2">
          <DialToggle on={detail.autonomyDial} onToggle={(n) => void toggleDial(n)} />
          <button onClick={toggleVersionsPanel}
            className="px-2 py-1 text-xs border border-gray-400 rounded bg-white text-gray-900">
            {showVersions ? 'Hide versions' : 'Versions'}
          </button>
        </div>
      </header>

      {moveFailed && (
        <div data-testid="move-failed-banner" role="alert"
          className="px-4 py-2 bg-gray-900 text-white text-sm border-b-4 border-dashed border-gray-500 flex items-center gap-2">
          <span className="font-semibold shrink-0">Move failed (system error)</span>
          <span className="truncate">{moveFailed.reason}</span>
          <button onClick={() => setMoveFailed(null)} className="ml-auto underline text-xs shrink-0">dismiss</button>
        </div>
      )}
      {actionError && (
        <div role="alert" className="px-4 py-1.5 bg-gray-200 text-gray-800 text-xs flex items-center gap-2">
          <span className="truncate">{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-auto underline shrink-0">dismiss</button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {snapshot ? (
              <div className="p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span className="px-2 py-0.5 bg-gray-300 rounded">read-only snapshot <span className="font-mono">{snapshot.id}</span></span>
                  <button onClick={() => setSnapshot(null)} className="underline">back to current</button>
                </div>
                <DraftPane draft={snapshot.draft} heading="Snapshot" />
              </div>
            ) : (
              <DraftPane draft={detail.draft}>
                {pending.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs uppercase tracking-wide text-gray-500">
                      {pending.length > 1 ? 'Proposals — pick a card' : 'Proposal'}
                    </h3>
                    {pending.map((p) => (
                      <ProposalCard key={p.id} proposal={p}
                        selected={pending.length > 1 ? p.id === selected?.id : undefined}
                        onSelect={pending.length > 1 ? () => setSelectedProposalId(p.id) : undefined} />
                    ))}
                  </div>
                )}
                {panel?.kind === 'edit' && (
                  <EditForm proposal={panel.proposal} onCancel={() => setPanel(null)}
                    onSubmit={(ops) => void runGate({ proposalId: panel.proposal.id, verb: 'edit', edit: { ops } })} />
                )}
                {panel?.kind === 'take_over' && (
                  <TakeOverForm draft={detail.draft} onCancel={() => setPanel(null)}
                    onSubmit={(d) => void runGate({ proposalId: panel.target, verb: 'take_over', edit: { draft: d } })} />
                )}
                {panel?.kind === 'redirect' && (
                  <RedirectForm onCancel={() => setPanel(null)}
                    onSubmit={(steer) => void runGate({ proposalId: panel.target, verb: 'redirect', edit: { steer } })} />
                )}
                {panel?.kind === 'override' && (
                  <OverridePrompt message={panel.message} onCancel={() => setPanel(null)}
                    onConfirm={() => void runGate(panel.resend)} />
                )}
              </DraftPane>
            )}
          </div>

          <div className="p-4 border-t border-gray-300 bg-gray-50">
            {detail.state === 'awaiting_gate' && <GateBar onVerb={onVerb} />}
            {detail.state === 'proposing' && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">Proposing…</span>
                <button onClick={() => void cancelMove()}
                  className="px-3 py-1 text-sm rounded bg-gray-800 text-white">Cancel</button>
              </div>
            )}
            {detail.state === 'blocked' && detail.blocked && (
              <SafetyBlock reason={detail.blocked.reason} ruleId={detail.blocked.ruleId}
                onRegenerate={() => onVerb('regenerate')}
                onRedirect={(steer) => void runGate({
                  proposalId: detail.blocked!.moveId, verb: 'redirect', edit: { steer },
                })} />
            )}
            {detail.state === 'idle' && (
              <p className="text-xs text-gray-400">Idle — propose a move from the steering pane.</p>
            )}
          </div>
        </div>

        <SteeringPane thread={thread} suggestedNext={suggestedNext}
          canPropose={detail.state === 'idle'}
          onPropose={(mt, steer) => void propose(mt, steer)} />

        {showVersions && versions && (
          <VersionHistory data={versions} selectedId={snapshot?.id ?? null}
            onSelect={setSnapshot} onPromote={(id) => void promote(id)} />
        )}
      </div>
    </div>
  )
}

// --- thread helpers ---

function appendToken(t: ThreadEntry[], moveId: string, text: string): ThreadEntry[] {
  const i = t.findIndex((e) => e.kind === 'tokens' && e.moveId === moveId)
  if (i === -1) return [...t, { kind: 'tokens', moveId, text, done: false }]
  const entry = t[i] as Extract<ThreadEntry, { kind: 'tokens' }>
  const next = [...t]
  next[i] = { ...entry, text: entry.text + text }
  return next
}

function finishTokens(t: ThreadEntry[], moveId: string): ThreadEntry[] {
  return t.map((e) => (e.kind === 'tokens' && e.moveId === moveId ? { ...e, done: true } : e))
}

// addPending lands one proposal-ready payload: alternatives deliver two
// sequentially, so ready proposals accumulate until the gate resolves.
function addPending(d: DishDetail, p: Proposal): DishDetail {
  const cur = d.pendingProposals ?? (d.pendingProposal ? [d.pendingProposal] : [])
  const merged = cur.some((x) => x.id === p.id) ? cur : [...cur, p]
  return {
    ...d, state: 'awaiting_gate',
    pendingProposals: merged, pendingProposal: merged[0],
    inFlightMoveId: undefined, blocked: undefined,
  }
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'request failed'
}

// --- verb panels ---

function editableValue(v: unknown): string {
  if (typeof v === 'string') return v
  return v === undefined ? '' : JSON.stringify(v)
}

// parseEdited mirrors editableValue: string-valued ops stay raw text;
// everything else round-trips through JSON (falling back to the raw string
// when it no longer parses).
function parseEdited(text: string, original: unknown): unknown {
  if (typeof original === 'string') return text
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// EditForm is the gate's edit verb: a form over the proposed values — the
// proposal's ops with each value editable, submitted as edit.ops.
function EditForm({ proposal, onSubmit, onCancel }: {
  proposal: Proposal
  onSubmit: (ops: Op[]) => void
  onCancel: () => void
}) {
  const ops = list(proposal.change)
  const [values, setValues] = useState<string[]>(
    () => ops.map((op) => (op.op === 'remove' ? '' : editableValue(op.value))),
  )
  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit(ops.map((op, i) => (op.op === 'remove' ? op : { ...op, value: parseEdited(values[i], op.value) })))
  }
  return (
    <form onSubmit={submit} data-testid="edit-form"
      className="border border-gray-400 rounded p-3 space-y-2 bg-white">
      <h3 className="text-xs uppercase tracking-wide text-gray-500">Edit proposed values</h3>
      {ops.map((op, i) => (
        <label key={i} className="block text-xs text-gray-600">
          <span className="font-mono">{op.op} {op.path}</span>
          {op.op === 'remove' ? (
            <span className="block text-gray-400">(removal — nothing to edit)</span>
          ) : (
            <input value={values[i]}
              onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
              className="mt-1 w-full border border-gray-300 rounded p-1 text-sm font-mono text-gray-900" />
          )}
        </label>
      ))}
      <div className="flex gap-2">
        <button type="submit" className="px-3 py-1 text-sm rounded bg-gray-800 text-white">Apply edit</button>
        <button type="button" onClick={onCancel} className="px-3 py-1 text-sm rounded border border-gray-400">Cancel</button>
      </div>
    </form>
  )
}

// TakeOverForm is the gate's take_over verb: a draft editor over the
// current draft, submitted whole as edit.draft (the server synthesizes the
// diff via ComputeDiff).
function TakeOverForm({ draft, onSubmit, onCancel }: {
  draft: Draft
  onSubmit: (d: Draft) => void
  onCancel: () => void
}) {
  const [text, setText] = useState(() => JSON.stringify(draft, null, 2))
  const [parseError, setParseError] = useState<string | null>(null)
  function submit(e: FormEvent) {
    e.preventDefault()
    try {
      onSubmit(JSON.parse(text) as Draft)
    } catch {
      setParseError('Draft must be valid JSON.')
    }
  }
  return (
    <form onSubmit={submit} data-testid="take-over-form"
      className="border border-gray-400 rounded p-3 space-y-2 bg-white">
      <h3 className="text-xs uppercase tracking-wide text-gray-500">Take over — edit the draft directly</h3>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={16}
        aria-label="Draft JSON"
        className="w-full border border-gray-300 rounded p-2 text-xs font-mono text-gray-900" />
      {parseError && <p role="alert" className="text-xs text-gray-700">{parseError}</p>}
      <div className="flex gap-2">
        <button type="submit" className="px-3 py-1 text-sm rounded bg-gray-800 text-white">Save draft</button>
        <button type="button" onClick={onCancel} className="px-3 py-1 text-sm rounded border border-gray-400">Cancel</button>
      </div>
    </form>
  )
}

// RedirectForm is the gate's redirect verb: fresh steering text that
// cancels/replaces the current proposal and re-runs the move.
function RedirectForm({ onSubmit, onCancel }: {
  onSubmit: (steer: string) => void
  onCancel: () => void
}) {
  const [steer, setSteer] = useState('')
  function submit(e: FormEvent) {
    e.preventDefault()
    if (steer.trim() === '') return
    onSubmit(steer.trim())
  }
  return (
    <form onSubmit={submit} data-testid="redirect-form"
      className="border border-gray-400 rounded p-3 space-y-2 bg-white">
      <h3 className="text-xs uppercase tracking-wide text-gray-500">Redirect — steer the next attempt</h3>
      <textarea value={steer} onChange={(e) => setSteer(e.target.value)} rows={2}
        aria-label="Redirect steer"
        className="w-full border border-gray-300 rounded p-1 text-sm text-gray-900" />
      <div className="flex gap-2">
        <button type="submit" disabled={steer.trim() === ''}
          className="px-3 py-1 text-sm rounded bg-gray-800 text-white disabled:opacity-40">Send redirect</button>
        <button type="button" onClick={onCancel} className="px-3 py-1 text-sm rounded border border-gray-400">Cancel</button>
      </div>
    </form>
  )
}

// OverridePrompt is the warn-and-confirm step for human writes that hit
// the safety gate: proceeding resends the same gate call with
// confirmOverride, recorded server-side as safety_warning_overridden.
function OverridePrompt({ message, onConfirm, onCancel }: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div data-testid="override-prompt" role="alertdialog"
      className="border-2 border-gray-600 bg-gray-100 rounded p-3 space-y-2">
      <p className="text-sm text-gray-900">Safety warning: {message}</p>
      <div className="flex gap-2">
        <button type="button" onClick={onConfirm}
          className="px-3 py-1 text-sm rounded bg-gray-800 text-white">Proceed anyway</button>
        <button type="button" onClick={onCancel}
          className="px-3 py-1 text-sm rounded border border-gray-400">Back</button>
      </div>
    </div>
  )
}
