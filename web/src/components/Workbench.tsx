import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type {
  DishDetail, Draft, GateRequestBody, GateVerb, Op, Proposal,
  VersionItem, VersionsResponse,
} from '../types'
import { list } from '../types'
import {
  ApiError, getDish, getLLMStatus, getVersions, openDishStream, postCancel,
  postGate, postMove, promoteVersion, setAutonomyDial,
} from '../api'
import DraftPane from './DraftPane'
import SteeringPane, { type ThreadEntry } from './SteeringPane'
import GateBar from './GateBar'
import ProposedDraftView from './ProposedDraftView'
import AlternativesPicker from './AlternativesPicker'
import SafetyBlock from './SafetyBlock'
import DialToggle from './DialToggle'
import ThemeToggle from './ThemeToggle'
import TrialStrip from './TrialStrip'

import {
  ANNOUNCE_MOVE_CANCELLED, ANNOUNCE_MOVE_FAILED, ANNOUNCE_PROPOSING,
  GATE_ANNOUNCE, STATE_GLOSS, STATE_LABEL, VERB_LABEL,
  announceAlternatives, announceProposalReady, promotedToService, shortRef,
  trialAlias,
} from '../vocab'
import { opLineLabel } from '../lib/pathLabels'

// LastMove is the most recent move this view dispatched — the retry target
// for the move-failed banner.
interface LastMove {
  moveType: string
  steer: string
  baseVersion?: string
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
export default function Workbench({ dishId, onNavigate, routeNonce = 0 }: {
  dishId: string
  onNavigate: (to: string) => void
  // Bumped by App on every route change so the dish title takes focus when
  // the cook navigated here, never on a cold load (audit #9).
  routeNonce?: number
}) {
  const [detail, setDetail] = useState<DishDetail | null>(null)
  // The page h1 (dish title): the route-change focus target and, once loaded,
  // the source of document.title.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const routeFocused = useRef(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [thread, setThread] = useState<ThreadEntry[]>([])
  const [moveFailed, setMoveFailed] = useState<{ moveId: string; reason: string } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  const [panel, setPanel] = useState<VerbPanel>(null)
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null)
  const [suggestedNext, setSuggestedNext] = useState<string[]>([])
  const [versions, setVersions] = useState<VersionsResponse | null>(null)
  const [snapshot, setSnapshot] = useState<VersionItem | null>(null)
  const [stubMode, setStubMode] = useState(false)
  const lastMove = useRef<LastMove | null>(null)
  // expectedMove is the move id this view is waiting a proposal for: set on
  // POST /move, on gate verbs that spawn a move, and from inFlightMoveId on
  // re-sync; cleared when the gate resolves. The SSE hub replays rationale
  // tokens on a cadence and emits proposal-ready at the end, so a fast gate
  // resolution (stub mode is instant) can leave a trailing proposal-ready —
  // stale theater that must not re-open a gate the server already resolved.
  const expectedMove = useRef<string | null>(null)

  // The permanent status region (P1): one sentence per gate-lifecycle
  // transition, pushed here and rendered in a pre-existing sr-only
  // role="status" element. Never the token stream. The nudge toggle makes
  // repeated identical messages re-announce (live regions only speak on
  // DOM change).
  const [liveMessage, setLiveMessage] = useState('')
  const announceNudge = useRef(false)
  const announce = useCallback((msg: string) => {
    announceNudge.current = !announceNudge.current
    setLiveMessage(msg + (announceNudge.current ? '' : ' '))
  }, [])
  // pendingCountRef lets SSE handlers distinguish a first proposal from an
  // arriving alternative without re-subscribing on every detail change.
  const pendingCountRef = useRef(0)

  // The stub-mode banner (task 3.3): GET /api/status reports which model
  // edge is wired. Advisory only — a failed fetch leaves the banner off.
  useEffect(() => {
    getLLMStatus()
      .then((s) => setStubMode(s.llm_mode === 'stub'))
      .catch(() => {})
  }, [])

  const resync = useCallback(async () => {
    try {
      const d = await getDish(dishId)
      if (d.inFlightMoveId) expectedMove.current = d.inFlightMoveId
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
        if (e.moveId !== expectedMove.current) return // stale replay tail
        setSuggestedNext(list(e.proposal.suggested_next))
        setSelectedProposalId((cur) => cur ?? e.proposal.id)
        setDetail((d) => (d ? addPending(d, e.proposal) : d))
        // Announce the arrival and land focus on the decision surface (P1).
        const arriving = pendingCountRef.current + 1
        announce(arriving > 1
          ? announceAlternatives(arriving)
          : announceProposalReady(list(e.proposal.change).length))
        setTimeout(() => document.getElementById('proposal-heading')?.focus(), 0)
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
        announce(ANNOUNCE_MOVE_CANCELLED)
        setThread((t) => [...finishTokens(t, e.moveId), { kind: 'info', text: 'move cancelled' }])
        setDetail((d) => (d && d.state === 'proposing'
          ? { ...d, state: 'idle', inFlightMoveId: undefined }
          : d))
      },
      onMoveFailed: (e) => {
        announce(ANNOUNCE_MOVE_FAILED)
        setThread((t) => finishTokens(t, e.moveId))
        setMoveFailed(e)
        setDetail((d) => (d && d.state === 'proposing'
          ? { ...d, state: 'idle', inFlightMoveId: undefined }
          : d))
      },
      onDrop: () => setReconnecting(true),
      onReconnect: () => {
        setReconnecting(false)
        void resync()
      },
    })
    return () => stream.close()
  }, [dishId, resync])

  const pending = detail
    ? detail.pendingProposals ?? (detail.pendingProposal ? [detail.pendingProposal] : [])
    : []
  const selected = pending.find((p) => p.id === selectedProposalId) ?? pending[0] ?? null

  useEffect(() => { pendingCountRef.current = pending.length }, [pending.length])

  async function refreshVersions() {
    try {
      setVersions(await getVersions(dishId))
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  // The trial strip is persistent (no toggle), so the record loads with
  // the dish and refreshes after every version-changing action.
  useEffect(() => { void refreshVersions() }, [dishId]) // eslint-disable-line react-hooks/exhaustive-deps

  // The workbench owns the per-dish document title; it re-reads when the draft
  // title changes (accept/edit) and only after the dish has loaded (audit #9).
  useEffect(() => {
    if (detail) document.title = `${detail.draft.title || detail.seed} — CapyCook`
  }, [detail?.draft.title, detail?.seed])

  // Route-change focus: land on the dish title once the dish has loaded, but
  // only when the cook navigated here (routeNonce > 0) — and only once, so a
  // later SSE re-render never steals focus back.
  useEffect(() => {
    if (routeNonce > 0 && detail && !routeFocused.current) {
      routeFocused.current = true
      headingRef.current?.focus()
    }
  }, [routeNonce, detail])

  // propose starts a move; with baseVersion it is the post-cook flow — the
  // feedback rides as steer and the move runs against the cooked version.
  async function propose(moveType: string, steer: string, baseVersion?: string) {
    announce(ANNOUNCE_PROPOSING)
    setMoveFailed(null)
    setActionError(null)
    lastMove.current = { moveType, steer, baseVersion }
    const beforeVersion = detail?.currentVersionId ?? null
    try {
      const mv = await postMove(dishId, moveType, steer, baseVersion)
      expectedMove.current = mv.moveId ?? null
      if (baseVersion) {
        setThread((t) => [...t, { kind: 'cooked', versionId: baseVersion, feedback: steer }])
      } else if (steer) {
        setThread((t) => [...t, { kind: 'steer', text: steer }])
      }
      const d = await getDish(dishId)
      setDetail(d)
      // A deterministic move with the dial ON resolved before the 202
      // returned (move_auto_advanced has no SSE event): collapse it into
      // the thread.
      if (d.state === 'idle' && d.currentVersionId && d.currentVersionId !== beforeVersion) {
        const versionId = d.currentVersionId
        setThread((t) => [...t, { kind: 'auto', moveType: moveType || 'move', versionId }])
        void refreshVersions()
      }
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  async function runGate(body: GateRequestBody) {
    announce(GATE_ANNOUNCE[body.verb])
    setActionError(null)
    setMoveFailed(null)
    try {
      const res = await postGate(dishId, body)
      // Verbs that spawn a move (regenerate/redirect/alternatives) hand
      // over the wait to the new move id; resolving verbs clear it.
      expectedMove.current = res.newMoveId ?? null
      setPanel(null)
      setSelectedProposalId(null)
      if (res.newVersionId) {
        setThread((t) => [...t, { kind: 'info', text: `${res.verb} → new version ${res.newVersionId}` }])
      } else if (res.newMoveId) {
        setThread((t) => [...t, { kind: 'info', text: `${res.verb} → new move` }])
      }
      await resync()
      void refreshVersions()
      // Gate resolve returns focus to whatever bar survives (P1): Cancel
      // while the respawned move streams, or nothing when the dish idles.
      focusGateBar()
    } catch (err) {
      // Human writes (edit/take_over) warn-and-confirm on a safety hit:
      // the orchestrator answers 409 confirm-required until the cook
      // explicitly overrides (recorded as safety_warning_overridden).
      if (err instanceof ApiError && err.status === 409 && /confirm override/i.test(err.message)
        && (body.verb === 'edit' || body.verb === 'take_over')) {
        // Show the cook the safety reasons only — the "orchestrator: safety
        // warning requires confirm override:" prefix is wire plumbing.
        const message = err.message.replace(/^.*?confirm override:\s*/i, '')
        setPanel({ kind: 'override', message, resend: { ...body, confirmOverride: true } })
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

  // Dispatching verbs return their promise so the gate bar can lock
  // (disable + spinner) until the gate call settles; panel verbs open
  // their form instantly and return void.
  function onVerb(v: GateVerb): void | Promise<void> {
    const target = gateTarget()
    if (!target) return
    switch (v) {
      case 'accept':
      case 'regenerate':
      case 'alternatives':
        return runGate({ proposalId: target, verb: v })
      case 'edit':
        if (selected) setPanel({ kind: 'edit', proposal: selected })
        return
      case 'redirect':
        setPanel({ kind: 'redirect', target })
        return
      case 'take_over':
        setPanel({ kind: 'take_over', target })
        return
    }
  }

  async function cancelMove() {
    setActionError(null)
    try {
      await postCancel(dishId)
      expectedMove.current = null
      await resync()
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  // Focus protocol (P1): panel cancel and gate resolve return focus to the
  // gate bar — the panel's own controls unmount with it, so the nearest
  // surviving origin of the flow is the bar (preferring the invoking verb
  // when it is still on the surface).
  const focusGateBar = useCallback((preferVerb?: GateVerb) => {
    setTimeout(() => {
      const bar = document.querySelector('[data-testid="gate-bar"]')
      if (!bar) return
      const buttons = Array.from(bar.querySelectorAll('button'))
      const target = (preferVerb && buttons.find((b) => b.textContent === VERB_LABEL[preferVerb]))
        ?? buttons[0]
      target?.focus()
    }, 0)
  }, [])

  function closePanel() {
    setPanel(null)
    focusGateBar()
  }

  function closeOverride(verb: GateVerb) {
    setPanel(null)
    focusGateBar(verb)
  }

  // Skip links (audit #10): the keyboard path to the gate crosses the header,
  // the trial strip, and the whole draft — these jump straight there. Gate
  // lands on the first live verb (its footer anchor when idle, no verbs up).
  function skipToGate(e: React.MouseEvent) {
    e.preventDefault()
    const btn = document.querySelector<HTMLElement>('[data-testid="gate-bar"] button')
    if (btn) btn.focus()
    else document.getElementById('gate-bar-anchor')?.focus()
  }
  function skipToSteering(e: React.MouseEvent) {
    e.preventDefault()
    document.getElementById('steering-anchor')?.focus()
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
      setThread((t) => [...t, { kind: 'info', text: promotedToService(shortRef(versionId)) }])
      setSnapshot(null)
      await resync()
      void refreshVersions()
    } catch (err) {
      setActionError(errMessage(err))
    }
  }


  if (loadError && !detail) {
    return (
      <div className="p-4 space-y-2">
        <p className="text-ink">Could not load this dish: {loadError}. Check the address or pick a dish from the list.</p>
        <button onClick={() => onNavigate('/')}
          className="px-2 py-1 uppercase border border-hairline bg-transparent text-ink transition hover:bg-ink hover:text-page">
          Back to dishes
        </button>
      </div>
    )
  }
  if (!detail) return <div className="p-4 text-muted">Loading the dish…</div>

  // The one permitted header flourish (brief §6): a precise live datum
  // beside the title — TRIAL n · $x/SERVING — each segment only when true.
  const trialIndex = versions ? list(versions.versions).findIndex((v) => v.id === detail.currentVersionId) : -1
  const perServing = detail.draft.analysis.cost.per_serving_usd
  const headerDatum = [
    trialIndex >= 0 ? trialAlias(trialIndex + 1) : null,
    perServing > 0 ? `$${perServing.toFixed(2)}/serving` : null,
  ].filter(Boolean).join(' · ')

  // The verb panels ride whichever canvas is up — the plain draft or the
  // proposed-draft view — so gate flows survive the canvas takeover.
  const verbPanels = (
    <>
      {panel?.kind === 'edit' && (
        <EditForm proposal={panel.proposal} onCancel={closePanel}
          onSubmit={(ops) => void runGate({ proposalId: panel.proposal.id, verb: 'edit', edit: { ops } })} />
      )}
      {panel?.kind === 'take_over' && (
        <TakeOverForm draft={detail.draft} onCancel={closePanel}
          onSubmit={(d) => void runGate({ proposalId: panel.target, verb: 'take_over', edit: { draft: d } })} />
      )}
      {panel?.kind === 'redirect' && (
        <RedirectForm onCancel={closePanel}
          onSubmit={(steer) => void runGate({ proposalId: panel.target, verb: 'redirect', edit: { steer } })} />
      )}
      {panel?.kind === 'override' && (
        <OverridePrompt message={panel.message}
          onCancel={() => closeOverride(panel.resend.verb)}
          onConfirm={() => void runGate(panel.resend)} />
      )}
    </>
  )

  return (
    <div className="flex flex-col h-screen bg-page text-ink">
      {/* Pre-existing at first render — live regions added later miss
          announcements. Gate lifecycle only; never the token stream. */}
      <div data-testid="gate-live-region" role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </div>
      {/* First tabbable elements: keyboard jumps past header + trial strip +
          draft straight to the two hot zones (audit #10). Off-screen until
          focused via the .skip-link rule in index.css. */}
      <a href="#gate-bar-anchor" onClick={skipToGate}
        className="skip-link px-2 py-1 uppercase border border-hairline bg-page text-ink">
        Skip to gate bar
      </a>
      <a href="#steering-anchor" onClick={skipToSteering}
        className="skip-link px-2 py-1 uppercase border border-hairline bg-page text-ink">
        Skip to steering
      </a>
      <header className="h-header shrink-0 px-3 border-b border-hairline bg-page flex items-center gap-2">
        <button onClick={() => onNavigate('/')}
          className="shrink-0 px-2 py-1 uppercase border border-hairline bg-transparent text-ink transition hover:bg-ink hover:text-page">
          Dishes
        </button>
        <h1 ref={headingRef} tabIndex={-1} className="font-medium text-sm truncate focus:outline-none">{detail.draft.title || detail.seed}</h1>
        {headerDatum && (
          <span className="shrink-0 font-mono text-2xs text-muted uppercase">{headerDatum}</span>
        )}
        <span className="uppercase text-muted shrink-0">{STATE_LABEL[detail.state] ?? detail.state}</span>
        {STATE_GLOSS[detail.state] && (
          <span className="normal-case text-2xs text-muted shrink-0">— {STATE_GLOSS[detail.state]}</span>
        )}
        {stubMode && (
          <span data-testid="stub-banner"
            className="shrink-0 px-1 font-mono text-2xs bg-info-surface text-info">
            stub mode — no model key
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <DialToggle on={detail.autonomyDial} onToggle={(n) => void toggleDial(n)} />
          <ThemeToggle />
        </div>
      </header>

      {reconnecting && (
        <div data-testid="reconnect-banner" role="status"
          className="px-3 py-1 bg-surface text-muted border-b border-hairline">
          Reconnecting — your draft is safe.
        </div>
      )}
      {moveFailed && (
        <div data-testid="move-failed-banner" role="alert"
          className="px-3 py-2 bg-warning-surface text-ink border-b border-hairline flex items-center gap-2">
          <span className="uppercase font-medium text-warning shrink-0">Move failed</span>
          <span className="truncate">{moveFailed.reason} — try again.</span>
          <span className="ml-auto shrink-0 flex gap-1">
            {lastMove.current && (
              <button onClick={() => {
                const m = lastMove.current!
                void propose(m.moveType, m.steer, m.baseVersion)
              }}
                className="px-2 py-1 uppercase border border-hairline-strong bg-transparent text-ink transition hover:bg-ink hover:text-page">
                Try again
              </button>
            )}
            <button onClick={() => setMoveFailed(null)}
              className="px-2 py-1 uppercase border border-hairline-strong bg-transparent text-ink transition hover:bg-ink hover:text-page">
              Dismiss
            </button>
          </span>
        </div>
      )}
      {actionError && (
        <div role="alert"
          className="px-3 py-1 bg-critical-surface text-critical border-b border-hairline flex items-center gap-2">
          <span className="truncate">{actionError}</span>
          <button onClick={() => setActionError(null)}
            className="ml-auto shrink-0 uppercase text-2xs underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          <TrialStrip
            data={versions ?? { currentVersionId: detail.currentVersionId, versions: [] }}
            selectedId={snapshot?.id ?? null}
            onSelect={setSnapshot}
            onPromote={(id) => void promote(id)}
            onCook={(versionId, feedback) => void propose('iterate_feedback', feedback, versionId)}
            canCook={detail.state === 'idle'} />
          <div className="flex-1 overflow-y-auto">
            {/* The hold owns the top of the canvas: the stopped change is
                the news, shown grayed right where it would have landed. */}
            {detail.state === 'blocked' && detail.blocked && !snapshot && (
              <div className="p-3 pb-0">
                <SafetyBlock reason={detail.blocked.reason} ruleId={detail.blocked.ruleId}
                  ops={detail.blocked.ops} />
              </div>
            )}
            {snapshot ? (
              <div className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-1 font-mono text-2xs bg-info-surface text-info">
                    read-only snapshot {snapshot.id}
                  </span>
                  <button onClick={() => setSnapshot(null)}
                    className="px-2 py-1 uppercase border border-hairline bg-transparent text-ink transition hover:bg-ink hover:text-page">
                    Back to current draft
                  </button>
                </div>
                <DraftPane draft={snapshot.draft} heading="Snapshot" />
              </div>
            ) : pending.length === 1 ? (
              // The decision object owns the fold: one pending proposal
              // renders as the would-be recipe on the canvas.
              <ProposedDraftView base={detail.draft} proposal={pending[0]}>
                {verbPanels}
              </ProposedDraftView>
            ) : pending.length > 1 ? (
              // Alternatives: a comparison radio group over what differs,
              // the selected one rendered as the recipe diff.
              <AlternativesPicker base={detail.draft} proposals={pending}
                selectedId={selected?.id} onSelect={setSelectedProposalId}>
                {verbPanels}
              </AlternativesPicker>
            ) : (
              <DraftPane draft={detail.draft} emptyNote={emptyNoteFor(detail.state, pending.length)}>
                {verbPanels}
              </DraftPane>
            )}
          </div>

          <div id="gate-bar-anchor" tabIndex={-1} className="p-3 border-t border-hairline bg-page focus:outline-none">
            {detail.state === 'awaiting_gate' && <GateBar onVerb={onVerb} />}
            {detail.state === 'proposing' && <GateBar state="proposing" onCancel={cancelMove} />}
            {detail.state === 'blocked' && detail.blocked && (
              <GateBar state="blocked" onVerb={onVerb} />
            )}
            {detail.state === 'idle' && (
              <p className="text-muted">The bench is ready — propose a move from the steering rail.</p>
            )}
          </div>
        </main>

        <SteeringPane thread={thread} suggestedNext={suggestedNext}
          canPropose={detail.state === 'idle'}
          onPropose={(mt, steer) => void propose(mt, steer)} />

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

// emptyNoteFor keeps the empty-draft line an invitation to an act that is
// actually available: reviewing the pending card, resolving the block, or
// waiting out the in-flight move — proposing only when the dish is idle.
function emptyNoteFor(state: string, pendingCount: number): string | undefined {
  // A single pending proposal never reaches here — it takes over the
  // canvas as ProposedDraftView; only the alternatives picker keeps the
  // plain canvas underneath.
  if (pendingCount > 1) return 'Empty draft — review the proposals below.'
  if (state === 'blocked') return 'Empty draft — resolve the blocked move below.'
  if (state === 'proposing') return 'Empty draft — a move is being proposed.'
  return undefined // idle: the default "propose the first move" invitation
}

// --- verb panels ---

// Shared panel control styles: ghost is the default voice; the panel's one
// primary action fills terracotta — disabled it goes neutral, so only a
// live primary ever wears the accent.
const panelPrimary = 'px-3 py-1 uppercase font-medium enabled:bg-accent enabled:text-on-accent disabled:bg-surface disabled:text-muted'
const panelGhost = 'px-3 py-1 uppercase border border-hairline bg-transparent text-ink transition hover:bg-ink hover:text-page'

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

// Focus protocol (P1): a verb panel opens on its first field.
function useFocusFirstField(ref: React.RefObject<HTMLFormElement | null>) {
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input, textarea')?.focus()
  }, [ref])
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
  const formRef = useRef<HTMLFormElement>(null)
  useFocusFirstField(formRef)
  function submit(e: FormEvent) {
    e.preventDefault()
    onSubmit(ops.map((op, i) => (op.op === 'remove' ? op : { ...op, value: parseEdited(values[i], op.value) })))
  }
  return (
    <form ref={formRef} onSubmit={submit} data-testid="edit-form"
      className="border border-hairline bg-page p-3 space-y-2">
      <h3 className="uppercase text-muted">Edit proposed values</h3>
      {ops.map((op, i) => (
        <label key={i} className="block text-muted">
          <span className="uppercase text-2xs">{opLineLabel(op)}</span>
          <span className="ml-1 font-mono text-2xs opacity-60">{op.path}</span>
          {op.op === 'remove' ? (
            <span className="block text-muted">(removal — nothing to edit)</span>
          ) : (
            <input value={values[i]}
              onChange={(e) => setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
              className="mt-1 w-full border border-hairline-strong bg-page p-1 font-mono text-ink" />
          )}
        </label>
      ))}
      <div className="flex gap-1">
        <button type="submit" className={panelPrimary}>Apply edit</button>
        <button type="button" onClick={onCancel} className={panelGhost}>Cancel</button>
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
  const formRef = useRef<HTMLFormElement>(null)
  useFocusFirstField(formRef)
  const [text, setText] = useState(() => JSON.stringify(draft, null, 2))
  const [parseError, setParseError] = useState<string | null>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  function submit(e: FormEvent) {
    e.preventDefault()
    try {
      onSubmit(JSON.parse(text) as Draft)
    } catch {
      setParseError('The draft is not valid JSON — fix the highlighted text and save again.')
    }
  }
  // GOV.UK error message (part of #15): a parse failure moves focus to the
  // message so it is announced and reachable; the textarea points back at it
  // via aria-describedby (set below).
  useEffect(() => { if (parseError) errorRef.current?.focus() }, [parseError])
  return (
    <form ref={formRef} onSubmit={submit} data-testid="take-over-form"
      className="border border-hairline bg-page p-3 space-y-2">
      <h3 className="uppercase text-muted">Take over — edit the draft directly</h3>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={16}
        aria-label="Draft JSON"
        aria-invalid={parseError ? true : undefined}
        aria-describedby={parseError ? 'take-over-error' : undefined}
        className="w-full border border-hairline-strong bg-page p-2 font-mono text-2xs text-ink" />
      {parseError && (
        <p id="take-over-error" role="alert" tabIndex={-1} ref={errorRef} className="text-critical focus:outline-none">
          <span className="sr-only">Error: </span>{parseError}
        </p>
      )}
      <div className="flex gap-1">
        <button type="submit" className={panelPrimary}>Save draft</button>
        <button type="button" onClick={onCancel} className={panelGhost}>Cancel</button>
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
  const formRef = useRef<HTMLFormElement>(null)
  useFocusFirstField(formRef)
  const [steer, setSteer] = useState('')
  function submit(e: FormEvent) {
    e.preventDefault()
    if (steer.trim() === '') return
    onSubmit(steer.trim())
  }
  return (
    <form ref={formRef} onSubmit={submit} data-testid="redirect-form"
      className="border border-hairline bg-page p-3 space-y-2">
      <h3 className="uppercase text-muted">Ask for changes — direct the next attempt</h3>
      <textarea value={steer} onChange={(e) => setSteer(e.target.value)} rows={2}
        aria-label="Direction"
        className="w-full border border-hairline-strong bg-page p-1 text-ink" />
      <div className="flex gap-1">
        <button type="submit" disabled={steer.trim() === ''} className={panelPrimary}>
          Send
        </button>
        <button type="button" onClick={onCancel} className={panelGhost}>Cancel</button>
      </div>
    </form>
  )
}

// OverridePrompt is the warn-and-confirm step for human writes that hit
// the safety gate: proceeding resends the same gate call with
// confirmOverride, recorded server-side as safety_warning_overridden.
// A native modal <dialog> (APG alert dialog): focus opens on Back — the
// least destructive action — and Escape cancels.
function OverridePrompt({ message, onConfirm, onCancel }: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const backRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) {
      // jsdom implements <dialog> but not showModal(); the attribute
      // fallback keeps tests honest while browsers get the real modal.
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    }
    backRef.current?.focus()
  }, [])

  return (
    <dialog ref={dialogRef} data-testid="override-prompt" role="alertdialog"
      aria-labelledby="override-heading" aria-describedby="override-message"
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      onCancel={onCancel} onClose={onCancel}
      className="border border-warning bg-warning-surface p-3 space-y-2">
      <div id="override-heading" className="uppercase font-medium text-warning">Safety warning</div>
      <p id="override-message" className="text-ink">{message}</p>
      <div className="flex gap-1">
        <button ref={backRef} type="button" onClick={onCancel} className={panelGhost}>Back</button>
        <button type="button" onClick={onConfirm} className={panelGhost}>Proceed anyway</button>
      </div>
    </dialog>
  )
}
