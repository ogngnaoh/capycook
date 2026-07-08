import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  DishDetail, DishState, GateRequestBody, GateVerb, LLMStatusResponse,
  MoveType, Proposal, VersionItem, VersionsResponse,
} from '../types'
import { list } from '../types'
import {
  ApiError, getDish, getLLMStatus, getVersions, openDishStream, postCancel,
  postGate, postMove, promoteVersion, setAutonomyDial,
} from '../api'
import TimelineSpine from './TimelineSpine'
import DishCard from './DishCard'
import { TrustStrip } from './TrustStrip'
import GateBar from './GateBar'
import ProposingCard from './ProposingCard'
import SafetyHold from './SafetyHold'
import ProposalHeader from './ProposalHeader'
import AlternativesPicker from './AlternativesPicker'
import { Toast } from './Toast'
import IntentBar from './IntentBar'
import CookFlow from './CookFlow'
import DialToggle from './DialToggle'
import ThemeToggle from './ThemeToggle'
import { buildTimeline } from '../lib/trials'
import { mergeDiff } from '../lib/mergeDiff'
import {
  ANNOUNCE_MOVE_CANCELLED, ANNOUNCE_MOVE_FAILED, ANNOUNCE_PROPOSING,
  GATE_ANNOUNCE, MOVE_LABEL, STATE_LABEL, VERB_LABEL,
  announceAlternatives, announceProposalReady, promotedToService, shortRef,
  trialAlias,
} from '../vocab'

// The persisted Technical-view preference: once a power user flips it on,
// raw ops/confidence/provenance return at full density on every proposal.
// Same key the retired proposed-draft view used, so the preference survives
// the redesign unchanged.
const TECH_VIEW_KEY = 'capycook-technical-view'

// LastMove is the most recent move this view dispatched — the retry target
// for the move-failed banner.
interface LastMove {
  moveType: string
  steer: string
  baseVersion?: string
}

// Workbench is the per-dish screen (redesign direction A): a sticky header
// of chrome, the timeline spine, and the stage — the dish rendered in one of
// its lifecycle states with the gate bar the one fixed decision control. It
// loads the dish, holds the one persistent EventSource, and drives moves and
// all six gate verbs against the real API. All gate state is server-owned;
// SSE events update the local view and every reconnect re-syncs via GET.
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

  // The proposing stream (replaces the old thread): rationale tokens for the
  // move this view awaits, accumulated live and rendered in the ProposingCard.
  const [streamText, setStreamText] = useState('')
  // Cook feedback captured per version, surfaced back in the timeline node.
  const [cookNotes, setCookNotes] = useState<Record<string, string>>({})
  // The one-line bottom-center confirmation chip.
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [technical, setTechnical] = useState(() => localStorage.getItem(TECH_VIEW_KEY) === '1')

  const [moveFailed, setMoveFailed] = useState<{ moveId: string; reason: string } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [reconnecting, setReconnecting] = useState(false)
  // The warn-and-confirm override for a human write that trips the safety gate.
  const [override, setOverride] = useState<{ message: string; resend: GateRequestBody } | null>(null)
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null)
  // Among two+ alternatives, whether the cook has picked one to develop — the
  // compare view then yields to that proposal's diff view + gate bar.
  const [picked, setPicked] = useState(false)
  const [suggestedNext, setSuggestedNext] = useState<string[]>([])
  const [versions, setVersions] = useState<VersionsResponse | null>(null)
  const [snapshot, setSnapshot] = useState<VersionItem | null>(null)
  const [status, setStatus] = useState<LLMStatusResponse | null>(null)
  const lastMove = useRef<LastMove | null>(null)
  // expectedMove is the move id this view is waiting a proposal for: set on
  // POST /move, on gate verbs that spawn a move, and from inFlightMoveId on
  // re-sync; cleared when the gate resolves. The SSE hub replays rationale
  // tokens on a cadence and emits proposal-ready at the end, so a fast gate
  // resolution (stub mode is instant) can leave a trailing proposal-ready —
  // stale theater that must not re-open a gate the server already resolved.
  const expectedMove = useRef<string | null>(null)

  // The permanent status region (P1): one sentence per gate-lifecycle
  // transition, pushed here and rendered in an sr-only role="status" element.
  // Never the token stream. The nudge toggle makes repeated identical
  // messages re-announce (live regions only speak on DOM change).
  const [liveMessage, setLiveMessage] = useState('')
  const announceNudge = useRef(false)
  const announce = useCallback((msg: string) => {
    announceNudge.current = !announceNudge.current
    setLiveMessage(msg + (announceNudge.current ? '' : ' '))
  }, [])
  // pendingCountRef lets SSE handlers distinguish a first proposal from an
  // arriving alternative without re-subscribing on every detail change.
  const pendingCountRef = useRef(0)

  // flash shows the toast for a beat, then clears it (timer kept in a ref so a
  // second flash resets the clock rather than stacking timers).
  const flash = useCallback((msg: string) => {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2600)
  }, [])
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  // The stub-mode strip: GET /api/status reports which model edge is wired
  // plus the budget meter. Advisory only — a failed fetch leaves it off.
  useEffect(() => {
    getLLMStatus().then(setStatus).catch(() => {})
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
      onToken: (e) => {
        // Only the awaited move's tokens grow the ProposingCard.
        if (e.moveId === expectedMove.current) setStreamText((t) => t + e.text)
      },
      onProposalReady: (e) => {
        if (e.moveId !== expectedMove.current) return // stale replay tail
        setStreamText('')
        setSuggestedNext(list(e.proposal.suggested_next))
        setSelectedProposalId((cur) => cur ?? e.proposal.id)
        setDetail((d) => (d ? addPending(d, e.proposal) : d))
        // Announce the arrival and land focus on the decision surface (P1).
        const arriving = pendingCountRef.current + 1
        announce(arriving > 1
          ? announceAlternatives(arriving)
          : announceProposalReady(list(e.proposal.change).length))
        focusDecision()
      },
      onProposalBlocked: (e) => {
        setStreamText('')
        setDetail((d) => (d ? {
          ...d, state: 'blocked', blocked: e,
          pendingProposal: undefined, pendingProposals: undefined,
          inFlightMoveId: undefined,
        } : d))
      },
      onMoveCancelled: () => {
        setStreamText('')
        announce(ANNOUNCE_MOVE_CANCELLED)
        setDetail((d) => (d && d.state === 'proposing'
          ? { ...d, state: 'idle', inFlightMoveId: undefined }
          : d))
      },
      onMoveFailed: (e) => {
        setStreamText('')
        announce(ANNOUNCE_MOVE_FAILED)
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
    // focusDecision/announce are stable callbacks; resync is the only real dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dishId, resync])

  const pending = detail
    ? detail.pendingProposals ?? (detail.pendingProposal ? [detail.pendingProposal] : [])
    : []
  const selected = pending.find((p) => p.id === selectedProposalId) ?? pending[0] ?? null

  useEffect(() => { pendingCountRef.current = pending.length }, [pending.length])

  const refreshVersions = useCallback(async () => {
    try {
      setVersions(await getVersions(dishId))
    } catch (err) {
      setActionError(errMessage(err))
    }
  }, [dishId])

  // The timeline loads with the dish and refreshes after every version-changing
  // action.
  useEffect(() => { void refreshVersions() }, [refreshVersions])

  // The workbench owns the per-dish document title; it re-reads when the draft
  // title changes (accept/edit) and only after the dish has loaded (audit #9).
  useEffect(() => {
    if (detail) document.title = `${detail.draft.title || detail.seed} — CapyCook`
  }, [detail?.draft.title, detail?.seed, detail])

  // Route-change focus: land on the dish title once the dish has loaded, but
  // only when the cook navigated here (routeNonce > 0) — and only once, so a
  // later SSE re-render never steals focus back.
  useEffect(() => {
    if (routeNonce > 0 && detail && !routeFocused.current) {
      routeFocused.current = true
      headingRef.current?.focus()
    }
  }, [routeNonce, detail])

  // focusDecision lands focus on whatever decision surface survives a
  // transition (P1): the gate bar's first verb when awaiting, the Stop control
  // while proposing, the stage heading otherwise. The blocked hold focuses
  // itself on mount, so it needs nothing here.
  const focusDecision = useCallback(() => {
    setTimeout(() => {
      const gateBtn = document.querySelector<HTMLElement>('[data-testid="gate-bar"] button[data-verb]')
      if (gateBtn) { gateBtn.focus(); return }
      const stop = document.querySelector<HTMLElement>('[data-testid="proposing-card"] button')
      if (stop) { stop.focus(); return }
      document.getElementById('stage-heading')?.focus()
    }, 0)
  }, [])

  // propose starts a move; with baseVersion it is the post-cook flow — the
  // feedback rides as steer and the move runs against the cooked version.
  const propose = useCallback(async (moveType: string, steer: string, baseVersion?: string) => {
    announce(ANNOUNCE_PROPOSING)
    setMoveFailed(null)
    setActionError(null)
    setStreamText('')
    lastMove.current = { moveType, steer, baseVersion }
    const beforeVersion = detail?.currentVersionId ?? null
    try {
      const mv = await postMove(dishId, moveType, steer, baseVersion)
      expectedMove.current = mv.moveId ?? null
      const d = await getDish(dishId)
      setDetail(d)
      // A deterministic move with the dial ON resolved before the 202 returned
      // (move_auto_advanced has no SSE event): confirm it with a toast and
      // refresh the timeline — no gate.
      if (d.state === 'idle' && d.currentVersionId && d.currentVersionId !== beforeVersion) {
        const label = MOVE_LABEL[moveType as MoveType] ?? (moveType || 'move')
        flash(`${label} — applied automatically (safe step)`)
        announce(`${label} — applied automatically`)
        void refreshVersions()
      }
    } catch (err) {
      setActionError(errMessage(err))
    }
  }, [announce, detail?.currentVersionId, dishId, flash, refreshVersions])

  const runGate = useCallback(async (body: GateRequestBody) => {
    announce(GATE_ANNOUNCE[body.verb])
    setActionError(null)
    setMoveFailed(null)
    try {
      const res = await postGate(dishId, body)
      // Verbs that spawn a move (regenerate/redirect/alternatives) hand over
      // the wait to the new move id; resolving verbs clear it.
      expectedMove.current = res.newMoveId ?? null
      setSelectedProposalId(null)
      setPicked(false)
      setStreamText('')
      if (res.newVersionId) flash(`${VERB_LABEL[res.verb]} — saved to the timeline`)
      await resync()
      void refreshVersions()
      focusDecision()
    } catch (err) {
      // Human writes (edit/take_over) warn-and-confirm on a safety hit: the
      // orchestrator answers 409 confirm-required until the cook explicitly
      // overrides (recorded as safety_warning_overridden).
      if (err instanceof ApiError && err.status === 409 && /confirm override/i.test(err.message)
        && (body.verb === 'edit' || body.verb === 'take_over')) {
        // Show the cook the safety reasons only — the wire prefix is plumbing.
        const message = err.message.replace(/^.*?confirm override:\s*/i, '')
        setOverride({ message, resend: { ...body, confirmOverride: true } })
        return
      }
      setActionError(errMessage(err))
    }
  }, [announce, dishId, flash, focusDecision, refreshVersions, resync])

  // gateTarget resolves the gate's idempotency key for the current state: a
  // pending proposal id at the gate, the blocked move id while blocked.
  function gateTarget(): string | null {
    if (!detail) return null
    if (detail.state === 'blocked') return detail.blocked?.moveId ?? null
    return selected?.id ?? null
  }

  // onVerb dispatches the three verbs that resolve or respawn straight from a
  // decision surface (accept/regenerate/alternatives); the form verbs
  // (edit/redirect/take_over) submit from inside the GateBar/SafetyHold forms.
  function onVerb(v: Extract<GateVerb, 'accept' | 'regenerate' | 'alternatives'>): Promise<void> | void {
    const target = gateTarget()
    if (!target) return
    return runGate({ proposalId: target, verb: v })
  }

  async function cancelMove() {
    setActionError(null)
    setStreamText('')
    try {
      await postCancel(dishId)
      expectedMove.current = null
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

  function toggleTechnical() {
    setTechnical((on) => {
      localStorage.setItem(TECH_VIEW_KEY, on ? '0' : '1')
      return !on
    })
  }

  async function promote(versionId: string) {
    try {
      await promoteVersion(dishId, versionId)
      flash(promotedToService(shortRef(versionId)))
      setSnapshot(null)
      await resync()
      void refreshVersions()
    } catch (err) {
      setActionError(errMessage(err))
    }
  }

  function viewSnapshot(id: string) {
    const vs = list(versions?.versions)
    const i = vs.findIndex((v) => v.id === id)
    if (i < 0) return
    setSnapshot(vs[i])
    announce(`Viewing ${trialAlias(i + 1)}, read-only.`)
  }

  // Skip links (audit #10): jump the keyboard straight past the header to the
  // dish or to whichever decision surface is live.
  function skipToDish(e: React.MouseEvent) {
    e.preventDefault()
    document.getElementById('stage-heading')?.focus()
  }
  function skipToDecision(e: React.MouseEvent) {
    e.preventDefault()
    const gateBtn = document.querySelector<HTMLElement>('[data-testid="gate-bar"] button[data-verb]')
    if (gateBtn) return gateBtn.focus()
    const hold = document.querySelector<HTMLElement>('[data-testid="safety-hold"]')
    if (hold) return hold.focus()
    const intent = document.getElementById('cc-intent')
    if (intent) return intent.focus()
    document.getElementById('stage-heading')?.focus()
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

  const displayDraft = snapshot ? snapshot.draft : detail.draft
  const singlePending = pending.length === 1 ? pending[0] : null
  const timelineData: VersionsResponse = versions ?? { currentVersionId: detail.currentVersionId, versions: [] }
  const timelineNodes = buildTimeline(timelineData, {
    viewingId: snapshot?.id ?? null,
    cookNotes,
    pendingProposal: singlePending ? { move_type: singlePending.move_type, change: singlePending.change ?? null } : null,
    baseDraft: detail.draft,
  })
  const trialCount = list(timelineData.versions).length
  const summary = trialCount === 0
    ? 'No trials yet'
    : `${trialCount} ${trialCount === 1 ? 'trial' : 'trials'} on the line`
  const nextHint = detail.state === 'awaiting_gate' ? 'A change is waiting on your call.'
    : detail.state === 'blocked' ? 'Resolve the safety hold to continue.'
    : detail.state === 'proposing' ? 'A move is in progress…'
    : 'Your next move continues the line of development.'
  const currentIndex = list(timelineData.versions).findIndex((v) => v.id === detail.currentVersionId)
  const currentLabel = trialAlias((currentIndex >= 0 ? currentIndex : 0) + 1)
  const snapshotIndex = snapshot ? list(versions?.versions).findIndex((v) => v.id === snapshot.id) : -1

  // Which surface owns the stage. Snapshot (read-only) wins; then the
  // lifecycle state; alternatives yield to the picked proposal's diff view.
  const isBlocked = !snapshot && detail.state === 'blocked' && !!detail.blocked
  const isProposing = !snapshot && detail.state === 'proposing'
  const showAlternatives = !snapshot && detail.state === 'awaiting_gate' && pending.length >= 2 && !picked
  const showSingleProposal = !snapshot && detail.state === 'awaiting_gate' && !!selected && (pending.length === 1 || picked)
  const isIdle = !snapshot && detail.state === 'idle'

  return (
    <div className="min-h-screen bg-page text-ink">
      {/* Pre-existing at first render — live regions added later miss
          announcements. Gate lifecycle only; never the token stream. */}
      <div data-testid="gate-live-region" role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </div>
      {/* First tabbable elements: keyboard jumps past the header straight to
          the dish or the decision (audit #10). */}
      <a href="#stage" onClick={skipToDish}
        className="skip-link px-2 py-1 uppercase border border-hairline bg-page text-ink">
        Skip to the dish
      </a>
      <a href="#cc-gate" onClick={skipToDecision}
        className="skip-link px-2 py-1 uppercase border border-hairline bg-page text-ink">
        Skip to the decision
      </a>

      <header className="sticky top-0 z-sticky h-header flex items-center gap-3 px-4 border-b border-hairline bg-panel max-md:h-auto max-md:flex-wrap max-md:py-1">
        <button onClick={() => onNavigate('/')}
          className="shrink-0 inline-flex items-center min-h-[32px] px-[11px] uppercase font-medium text-[11px] tracking-[0.1em] border border-hairline-strong bg-transparent text-ink transition hover:bg-ink hover:text-page">
          Dishes
        </button>
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-bold tracking-[0.02em] shrink-0">CapyCook</span>
          <span className="text-faint shrink-0">/</span>
          <h1 ref={headingRef} tabIndex={-1}
            className="font-medium truncate focus:outline-none max-w-[34ch]">
            {detail.draft.title || detail.seed}
          </h1>
          <StatePill state={detail.state} />
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <DialToggle on={detail.autonomyDial} onToggle={(n) => void toggleDial(n)} />
          <button type="button" aria-pressed={technical} onClick={toggleTechnical}
            title="Show the engineering underneath" className={chromeToggle(technical)}>
            Technical view
          </button>
          <ThemeToggle />
        </div>
      </header>

      {status?.llm_mode === 'stub' && (
        <div data-testid="stub-banner"
          className="flex items-center gap-2 px-4 py-1 bg-accent-soft border-b border-hairline text-2xs uppercase tracking-[0.05em] text-accent-text">
          <span className="font-mono">stub mode</span>
          <span className="text-muted normal-case">
            — demo data, no model key · budget ${status.budget_spent_usd.toFixed(2)} / ${status.budget_cap_usd.toFixed(2)}
          </span>
        </div>
      )}

      {reconnecting && (
        <div data-testid="reconnect-banner" role="status"
          className="px-4 py-1 bg-surface text-muted border-b border-hairline">
          Reconnecting — your draft is safe.
        </div>
      )}
      {moveFailed && (
        <div data-testid="move-failed-banner" role="alert"
          className="px-4 py-2 bg-warning-surface text-ink border-b border-hairline flex items-center gap-2">
          <span className="uppercase font-medium text-warning shrink-0">Move failed</span>
          <span className="truncate">{moveFailed.reason} — try again.</span>
          <span className="ml-auto shrink-0 flex gap-1">
            {lastMove.current && (
              <button onClick={() => {
                const m = lastMove.current!
                void propose(m.moveType, m.steer, m.baseVersion)
              }}
                className="min-h-[32px] px-2 py-1 uppercase border border-hairline-strong bg-transparent text-ink transition hover:bg-ink hover:text-page">
                Try again
              </button>
            )}
            <button onClick={() => setMoveFailed(null)}
              className="min-h-[32px] px-2 py-1 uppercase border border-hairline-strong bg-transparent text-ink transition hover:bg-ink hover:text-page">
              Dismiss
            </button>
          </span>
        </div>
      )}
      {actionError && (
        <div role="alert"
          className="px-4 py-1 bg-critical-surface text-critical border-b border-hairline flex items-center gap-2">
          <span className="truncate">{actionError}</span>
          <button onClick={() => setActionError(null)}
            className="ml-auto shrink-0 inline-flex items-center min-h-[32px] uppercase text-2xs underline">
            Dismiss
          </button>
        </div>
      )}

      <main className="wb-grid" style={{ minHeight: 'calc(100vh - var(--header-height) - 1px)' }}>
        <TimelineSpine nodes={timelineNodes} summary={summary} nextHint={nextHint}
          technical={technical} onView={viewSnapshot} onPromote={(id) => void promote(id)} />

        <section id="stage" aria-labelledby="stage-heading"
          className="cc-scroll flex flex-col overflow-y-auto">
          <div className="w-full max-w-[840px] mx-auto px-6 pt-5 pb-9 flex-1">
            <h2 id="stage-heading" tabIndex={-1} className="sr-only">The dish</h2>
            <TrustStrip draft={displayDraft} />

            {snapshot ? (
              <>
                <div className="cc-rise flex items-center justify-between gap-3 flex-wrap px-[14px] py-[11px] border border-hairline-strong bg-surface mb-4">
                  <span className="text-muted">
                    Viewing a past trial — <strong className="text-ink font-medium">{trialAlias(snapshotIndex + 1)}</strong>, read-only.
                  </span>
                  <button onClick={() => setSnapshot(null)}
                    className="inline-flex items-center min-h-[32px] px-3 uppercase font-medium text-[11px] tracking-[0.06em] border border-hairline-strong bg-panel text-ink transition hover:bg-ink hover:text-page">
                    Back to current
                  </button>
                </div>
                <DishCard draft={snapshot.draft} technical={technical} showDetail />
                {detail.state === 'idle' && (
                  <CookFlow versionLabel={trialAlias(snapshotIndex + 1)}
                    onSubmit={(notes) => {
                      const fb = notes.trim() === '' ? 'Cooked it.' : notes
                      setCookNotes((prev) => ({ ...prev, [snapshot.id]: fb }))
                      void propose('iterate_feedback', fb, snapshot.id)
                    }} />
                )}
              </>
            ) : isBlocked ? (
              <>
                <SafetyHold reason={detail.blocked!.reason} ruleId={detail.blocked!.ruleId}
                  ops={detail.blocked!.ops} technical={technical}
                  onRegenerate={() => void onVerb('regenerate')}
                  onRedirectSubmit={(steer) => void runGate({ proposalId: gateTarget()!, verb: 'redirect', edit: { steer } })} />
                <DishCard draft={detail.draft} technical={technical} showDetail={false} />
              </>
            ) : isProposing ? (
              <>
                <ProposingCard text={streamText} onCancel={() => void cancelMove()} />
                <DishCard draft={detail.draft} technical={technical} showDetail={false} />
              </>
            ) : showAlternatives ? (
              <AlternativesPicker proposals={pending} base={detail.draft}
                onPick={(id) => { setSelectedProposalId(id); setPicked(true) }} />
            ) : showSingleProposal ? (
              <>
                <ProposalHeader proposal={selected!} streaming={false} technical={technical} />
                <DishCard draft={detail.draft}
                  diff={mergeDiff(detail.draft, list(selected!.change))}
                  ops={list(selected!.change)} technical={technical} showDetail={false} />
              </>
            ) : (
              <>
                <DishCard draft={detail.draft} technical={technical} showDetail />
                {isIdle && (
                  <>
                    <CookFlow versionLabel={currentLabel}
                      onSubmit={(notes) => {
                        const cur = detail.currentVersionId
                        if (!cur) return
                        const fb = notes.trim() === '' ? 'Cooked it.' : notes
                        setCookNotes((prev) => ({ ...prev, [cur]: fb }))
                        void propose('iterate_feedback', fb, cur)
                      }} />
                    <IntentBar canPropose={detail.state === 'idle'} autonomyOn={detail.autonomyDial}
                      servings={detail.draft.constraints.servings} suggestedNext={suggestedNext}
                      onMove={(mt, steer) => void propose(mt, steer)} />
                  </>
                )}
              </>
            )}
          </div>

          {showSingleProposal && selected && (
            <GateBar proposal={selected} draft={detail.draft}
              onAccept={() => onVerb('accept')}
              onRegenerate={() => onVerb('regenerate')}
              onAlternatives={() => onVerb('alternatives')}
              onEditSubmit={(ops) => runGate({ proposalId: selected.id, verb: 'edit', edit: { ops } })}
              onRedirectSubmit={(steer) => runGate({ proposalId: selected.id, verb: 'redirect', edit: { steer } })}
              onTakeoverSubmit={(d) => runGate({ proposalId: selected.id, verb: 'take_over', edit: { draft: d } })} />
          )}
        </section>
      </main>

      <Toast message={toast} />
      {override && (
        <OverridePrompt message={override.message}
          onCancel={() => { setOverride(null); focusDecision() }}
          onConfirm={() => { const resend = override.resend; setOverride(null); void runGate(resend) }} />
      )}
    </div>
  )
}

// StatePill is the header's live state chip: STATE_LABEL text with a status
// dot whose color is never the only signal (idle success · proposing/awaiting
// accent · blocked critical).
function StatePill({ state }: { state: DishState }) {
  const dot = state === 'idle' ? 'bg-success' : state === 'blocked' ? 'bg-critical' : 'bg-accent'
  return (
    <span data-testid="state-pill"
      className="shrink-0 inline-flex items-center gap-[6px] px-[9px] py-[3px] border border-hairline-strong text-2xs uppercase tracking-[0.06em] text-muted whitespace-nowrap">
      <span aria-hidden="true" className={`inline-block w-[7px] h-[7px] ${dot}`} />
      {STATE_LABEL[state] ?? state}
    </span>
  )
}

// The header's chrome toggles (design 73–76/1135): a hairline ghost that fills
// accent-soft when active.
function chromeToggle(active: boolean): string {
  return `inline-flex items-center gap-[6px] min-h-[32px] px-[10px] uppercase font-medium text-[11px] tracking-[0.06em] border transition ${
    active
      ? 'border-accent bg-accent-soft text-accent-text'
      : 'border-hairline-strong bg-transparent text-ink hover:bg-ink hover:text-page'
  }`
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

// OverridePrompt is the warn-and-confirm step for human writes that hit the
// safety gate: proceeding resends the same gate call with confirmOverride,
// recorded server-side as safety_warning_overridden. A native modal <dialog>
// (APG alert dialog): focus opens on Back — the least destructive action —
// and Escape cancels.
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
      // jsdom implements <dialog> but not showModal(); the attribute fallback
      // keeps tests honest while browsers get the real modal.
      if (typeof dialog.showModal === 'function') dialog.showModal()
      else dialog.setAttribute('open', '')
    }
    backRef.current?.focus()
    // The gate bar that spawned this write resets to its decide mode when the
    // (409-swallowing) gate promise resolves, and that reset synchronously
    // re-focuses one of its own buttons in a later commit. A real browser's
    // showModal() traps focus so it can't; jsdom's fallback can't, so re-claim
    // focus one macrotask later — after that reset — so the least-destructive
    // action reliably holds it.
    const t = setTimeout(() => backRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [])

  return (
    <dialog ref={dialogRef} data-testid="override-prompt" role="alertdialog"
      aria-labelledby="override-heading" aria-describedby="override-message"
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
      onCancel={onCancel} onClose={onCancel}
      className="border-2 border-critical bg-panel p-4 space-y-2">
      <div id="override-heading" className="uppercase font-medium text-critical">Your edit trips a safety rule</div>
      <p id="override-message" className="text-ink">{message}</p>
      <div className="flex gap-2">
        <button ref={backRef} type="button" onClick={onCancel}
          className="px-3 py-2 uppercase font-medium border border-ink bg-ink text-page transition hover:opacity-90">
          Go back — I'll change it
        </button>
        <button type="button" onClick={onConfirm}
          className="px-3 py-2 uppercase font-medium border border-critical bg-transparent text-critical transition hover:bg-critical hover:text-page">
          Use it anyway
        </button>
      </div>
    </dialog>
  )
}
