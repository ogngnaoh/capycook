import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
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
import IntentBar, { type IntentRestore } from './IntentBar'
import CookFlow from './CookFlow'
import DialToggle from './DialToggle'
import ThemeToggle from './ThemeToggle'
import { buildTimeline } from '../lib/trials'
import { mergeDiff } from '../lib/mergeDiff'
import {
  ANNOUNCE_BACK_TO_CURRENT, ANNOUNCE_MOVE_CANCELLED, ANNOUNCE_MOVE_FAILED,
  ANNOUNCE_PROPOSING, GATE_ANNOUNCE, MOVE_LABEL, STATE_LABEL, VERB_LABEL,
  announceAlternatives, announceProgress, announceProposalReady, promotedToService, shortRef,
  trialAlias,
} from '../vocab'

// BC-B-10: the live region needs more than a start/end flip during a long
// generation. Progress announcements are throttled off live TOKEN arrival
// (never a fixed timer) so they naturally stop once tokens stop — which the
// Go side already arranges to happen a few seconds before proposal-ready —
// landing comfortably inside the contract's 2000-12000ms band without either
// side needing to know the other's exact timing.
const PROGRESS_ANNOUNCE_MIN_GAP_MS = 3500

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
export default function Workbench({ dishId, onNavigate, routeNonce = 0, autoFirstPass = false }: {
  dishId: string
  onNavigate: (to: string) => void
  // Bumped by App on every route change so the dish title takes focus when
  // the cook navigated here, never on a cold load (audit #9).
  routeNonce?: number
  // True only on the SPA navigation immediately following a successful dish
  // create (BC-A-3) — App's in-memory signal a hard reload can never
  // resurrect. Read once, at this mount, via autoFirstPassArmed below; never
  // re-read on a later prop change (this Workbench instance never outlives
  // the dish it auto-fired for — App remounts on every dishId change).
  autoFirstPass?: boolean
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
  // The in-flight intent-bar submission (free-text intent or scale value),
  // stashed at dispatch: the bar clears its fields the moment it dispatches
  // (and unmounts while proposing), so a failed or cancelled move restores
  // the typed input from here instead of discarding it (BC-A-13). moveId is
  // filled once the 202 answers; every success path (proposal-ready,
  // auto-advance, blocked) drops the stash so a later move's failure can
  // never resurrect stale text.
  const inFlightIntent = useRef<{ moveId: string | null; restore: IntentRestore } | null>(null)
  const [intentRestore, setIntentRestore] = useState<IntentRestore | null>(null)
  // restoreIntent hands the stashed submission back to the intent bar once
  // the move it rode out on actually failed or was cancelled — keyed off the
  // resolved moveId, never a timer (BC-A-13).
  const restoreIntent = useCallback((moveId: string | null) => {
    const stash = inFlightIntent.current
    if (!stash || stash.moveId === null || stash.moveId !== moveId) return
    inFlightIntent.current = null
    setIntentRestore(stash.restore)
  }, [])
  // expectedMove is the move id this view is waiting a proposal for: set on
  // POST /move, on gate verbs that spawn a move, and from inFlightMoveId on
  // re-sync; cleared when the gate resolves. The SSE hub replays rationale
  // tokens on a cadence and emits proposal-ready at the end, so a fast gate
  // resolution (stub mode is instant) can leave a trailing proposal-ready —
  // stale theater that must not re-open a gate the server already resolved.
  const expectedMove = useRef<string | null>(null)

  // alternativesExpectedMoveId names the in-flight "Compare two options" move
  // whose second alt-card has not landed yet (BC-C-20): set the instant the
  // alternatives verb's gate POST resolves with its new move id — strictly
  // before any SSE event for that move can arrive, since the server only
  // starts the token/proposal-ready replay after the HTTP handler that
  // spawned it returns. Cleared once a second proposal for that same move
  // lands, or the move fails/cancels before ever producing one. While it
  // names the sole pending proposal's move, a single-proposal gate bar must
  // never render for it — the cook could commit option A and silently drop
  // B, which is the exact defect this guards.
  const alternativesExpectedMoveId = useRef<string | null>(null)

  // The permanent status region (P1): one sentence per gate-lifecycle
  // transition, plus BC-B-10's throttled mid-wait progress cue below, pushed
  // here and rendered in an sr-only role="status" element. Never the raw
  // per-token stream itself (that would be per-token noise, exactly what
  // BC-B-10 forbids) — only occasional, human-readable summaries. The nudge
  // toggle makes repeated identical messages re-announce (live regions only
  // speak on DOM change).
  const [liveMessage, setLiveMessage] = useState('')
  const announceNudge = useRef(false)
  const announce = useCallback((msg: string) => {
    announceNudge.current = !announceNudge.current
    setLiveMessage(msg + (announceNudge.current ? '' : ' '))
  }, [])
  // BC-B-10's mid-wait progress cue: lastAt is seeded to the dispatch moment
  // (never 0) so the FIRST intermediate announcement also respects the
  // min-gap floor relative to "Proposing a move…"/the gate-verb start
  // announcement, not just relative to other intermediates. words is an
  // approximate running count (one token ≈ one word, per the server's
  // whitespace-delimited chunks) — precise enough for an aural progress cue.
  const progressAnnounce = useRef({ lastAt: 0, tick: 0, words: 0 })
  const beginProposingAnnouncements = useCallback(() => {
    progressAnnounce.current = { lastAt: Date.now(), tick: 0, words: 0 }
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
      // GET is a second, GUARANTEED source for the "Try next —" chips
      // (BC-A-14): a reload/revisit that lands on an undecided proposal
      // recovers its suggested_next here, never solely from the SSE
      // proposal-ready handler below (which a reload never replays).
      const suggested = pendingSuggestedNext(d)
      if (suggested) setSuggestedNext(suggested)
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
        if (e.moveId !== expectedMove.current) return
        setStreamText((t) => t + e.text)
        // BC-B-10: a throttled, DISTINCT progress cue for the permanent
        // status region — never per-token (announce() is called at most
        // once per PROGRESS_ANNOUNCE_MIN_GAP_MS here), never a repeat of
        // the immediately-prior value (the phrase rotates).
        const p = progressAnnounce.current
        p.words += 1
        const now = Date.now()
        if (now - p.lastAt >= PROGRESS_ANNOUNCE_MIN_GAP_MS) {
          p.lastAt = now
          p.tick += 1
          announce(announceProgress(p.words, p.tick))
        }
      },
      onProposalReady: (e) => {
        if (e.moveId !== expectedMove.current) return // stale replay tail
        inFlightIntent.current = null // the move succeeded — nothing to restore
        setStreamText('')
        setSuggestedNext(list(e.proposal.suggested_next))
        setSelectedProposalId((cur) => cur ?? e.proposal.id)
        setDetail((d) => (d ? addPending(d, e.proposal) : d))
        // Announce the arrival and land focus on the decision surface (P1).
        const arriving = pendingCountRef.current + 1
        // The second (or a mixed-alternatives-screen's only) alt-card just
        // landed for the move this ref was watching — BC-C-20's withholding
        // window is over (BC-C-20).
        if (arriving >= 2 && alternativesExpectedMoveId.current === e.moveId) {
          alternativesExpectedMoveId.current = null
        }
        announce(arriving > 1
          ? announceAlternatives(arriving)
          : announceProposalReady(list(e.proposal.change).length))
        focusDecision()
      },
      onProposalBlocked: (e) => {
        // Blocked is a resolution, not a failure: the hold's own verbs carry
        // the flow forward, so the stash must not linger (BC-A-13 scope).
        inFlightIntent.current = null
        setStreamText('')
        if (alternativesExpectedMoveId.current === e.moveId) alternativesExpectedMoveId.current = null
        setDetail((d) => (d ? {
          ...d, state: 'blocked', blocked: e,
          pendingProposal: undefined, pendingProposals: undefined,
          inFlightMoveId: undefined,
        } : d))
      },
      onMoveCancelled: (e) => {
        setStreamText('')
        announce(ANNOUNCE_MOVE_CANCELLED)
        if (alternativesExpectedMoveId.current === e.moveId) alternativesExpectedMoveId.current = null
        restoreIntent(e.moveId) // a Stop is often precisely to rephrase (BC-A-13)
        setOptimisticProposing(false) // defensive: reconcile if still armed (BC-A-14)
        setDetail((d) => (d && d.state === 'proposing'
          ? { ...d, state: 'idle', inFlightMoveId: undefined }
          : d))
      },
      onMoveFailed: (e) => {
        setStreamText('')
        announce(ANNOUNCE_MOVE_FAILED)
        setMoveFailed(e)
        if (alternativesExpectedMoveId.current === e.moveId) alternativesExpectedMoveId.current = null
        restoreIntent(e.moveId) // a failed move never discards typed input (BC-A-13)
        setOptimisticProposing(false) // defensive: reconcile if still armed (BC-A-14)
        // A failure is an async SSE event, not a click — there is no
        // cancelMove()-style call path to land focus the way Stop's click
        // does (BC-B-5). Re-arm the same dispatch-focus mechanism used at
        // move start (BC-A-5): the proposing card is gone and no gate bar
        // exists on this failure path, so the layout effect below falls
        // through to the stage heading rather than leaving
        // document.activeElement on the unmounted card (BC-H-4).
        dispatchFocusPending.current = true
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
    // focusDecision/announce/restoreIntent are stable callbacks; resync is
    // the only real dep.
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

  // The could-not-load card early-returns before the loaded screen, so the
  // route-focus effect above can never fire on that path. When the card
  // mounts, keyboard focus lands on the error region itself (BC-H-1/BC-H-7)
  // — and only then: on a successful load showLoadError stays false, so this
  // never fights the routeNonce focus management above (audit #9).
  const loadErrorRef = useRef<HTMLDivElement>(null)
  const showLoadError = Boolean(loadError) && !detail
  useEffect(() => {
    if (showLoadError) loadErrorRef.current?.focus()
  }, [showLoadError])

  // focusDecision lands focus on whatever decision surface survives a
  // transition (P1): the gate bar's first verb when awaiting, the proposing
  // card's heading while proposing (never Stop — BC-B-4's prohibition), the
  // stage heading otherwise. The blocked hold focuses itself on mount, so it
  // needs nothing here.
  const focusDecisionNow = useCallback(() => {
    const gateBtn = document.querySelector<HTMLElement>('[data-testid="gate-bar"] button[data-verb]')
    if (gateBtn) { gateBtn.focus(); return }
    // A gate form held open across a failed submit or a safety-override
    // "Go back" (BC-C-21/BC-C-27) is the live decision surface: land in its
    // field rather than skipping past it to the stage heading.
    const gateField = document.querySelector<HTMLElement>(
      '[data-testid="gate-bar"] input, [data-testid="gate-bar"] textarea')
    if (gateField) { gateField.focus(); return }
    const heading = document.querySelector<HTMLElement>('[data-testid="proposing-heading"]')
    if (heading) {
      heading.focus()
      // The card can mount above the fold; bring the whole of it into view
      // (BC-B-1). jsdom has no scrollIntoView — guard as OverridePrompt
      // guards showModal.
      const card = heading.closest<HTMLElement>('[data-testid="proposing-card"]')
      if (card && typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'nearest' })
      return
    }
    document.getElementById('stage-heading')?.focus()
  }, [])
  const focusDecision = useCallback(() => {
    setTimeout(focusDecisionNow, 0)
  }, [focusDecisionNow])

  // optimisticProposing mounts the proposing surface the INSTANT a move is
  // dispatched (BC-A-14): under the fast stub the follow-up GET in propose()
  // below can resolve straight to awaiting_gate before React ever paints an
  // intermediate 'proposing' commit, so detail.state alone is not a reliable
  // mount signal for the oracle's MutationObserver (or a real cook). This
  // flag renders the same ProposingCard surface synchronously with dispatch;
  // propose()'s own continuation reconciles it moments later against the
  // GET/SSE truth — a brief proposing beat under instant completion is
  // correct UX, a live-sim move's real 25s wait is unchanged (detail.state
  // itself carries 'proposing' by then).
  const [optimisticProposing, setOptimisticProposing] = useState(false)

  // dispatchFocusPending marks a local move dispatch whose next commit
  // unmounts the intent affordances. The layout effect consumes it inside
  // that same commit — synchronously, before any MutationObserver microtask
  // can catch focus resting on document.body — so focus is already on the
  // proposing card's heading the instant the intent bar leaves the DOM
  // (BC-A-5). Ref-gated to local dispatch only: a deep-link or reload into an
  // already-proposing dish must never have focus stolen (audit #9).
  const dispatchFocusPending = useRef(false)
  useLayoutEffect(() => {
    if (!dispatchFocusPending.current) return
    dispatchFocusPending.current = false
    focusDecisionNow()
  }, [detail, optimisticProposing, focusDecisionNow])

  // moveInFlight is the synchronous dispatch lock: a double activation (a
  // chip double-click, Enter twice on the intent field) reaches this ref
  // before any await, so the second activation can never fire a second
  // POST /move while the first is on the wire (BC-A-5).
  const moveInFlight = useRef(false)

  // propose starts a move; with baseVersion it is the post-cook flow — the
  // feedback rides as steer and the move runs against the cooked version.
  // Resolves true when the move dispatched (gate pending or auto-advanced),
  // false when it never got off the ground — a caller preserving typed input
  // (CookFlow, BC-E-5) keys its close off this outcome.
  const propose = useCallback(async (moveType: string, steer: string, baseVersion?: string): Promise<boolean> => {
    if (moveInFlight.current) return false
    moveInFlight.current = true
    // Enter proposing OPTIMISTICALLY, synchronously with dispatch (BC-A-14):
    // mounts the surface in the SAME commit as this call, before any await —
    // see optimisticProposing's declaration above for why detail.state alone
    // cannot be trusted here. Scoped to the intent-bar-originated paths
    // (free text, chips, the auto-fired first pass — every caller with no
    // baseVersion) only: the post-cook rework flow (CookFlow, baseVersion
    // set) keeps its OWN local form state alive across a failed submission
    // by never unmounting today (BC-E-5) — an optimistic mount here would
    // tear that down for no BC-A-14 benefit (the criterion never touches
    // CookFlow's dispatch).
    if (baseVersion === undefined) {
      setOptimisticProposing(true)
      // Arm the same-commit dispatch focus in lockstep: the layout effect
      // above fires inside the very commit that unmounts the intent
      // affordances, which now happens on this same optimistic entry, not
      // on the later GET (BC-A-5).
      dispatchFocusPending.current = true
    }
    announce(ANNOUNCE_PROPOSING)
    beginProposingAnnouncements()
    setMoveFailed(null)
    setActionError(null)
    setStreamText('')
    lastMove.current = { moveType, steer, baseVersion }
    // Stash what the cook typed into the intent bar before it clears
    // (BC-A-13); a fresh dispatch also retires any restore still showing.
    const restore = intentBarInput(moveType, steer, baseVersion)
    inFlightIntent.current = restore ? { moveId: null, restore } : null
    setIntentRestore(null)
    const beforeVersion = detail?.currentVersionId ?? null
    try {
      const mv = await postMove(dishId, moveType, steer, baseVersion)
      expectedMove.current = mv.moveId ?? null
      if (inFlightIntent.current) inFlightIntent.current.moveId = mv.moveId ?? null
      const d = await getDish(dishId)
      // Same GET-derived rescue as resync() above (BC-A-14): a fast-resolving
      // move can have its proposal-ready SSE event race ahead of the
      // expectedMove.current assignment two lines up and get dropped as a
      // stale replay — this GET, which every dispatch already performs,
      // lands suggested_next regardless of whether that SSE event survives.
      const suggested = pendingSuggestedNext(d)
      if (suggested) setSuggestedNext(suggested)
      setDetail(d)
      // Reconcile the optimistic proposing beat armed at dispatch above with
      // the truth this GET just landed: a still-'proposing' outcome (a slow,
      // live-sim move) keeps the surface up via detail.state itself; any
      // other outcome — awaiting_gate, blocked, or an auto-advanced idle —
      // drops the flag in this same commit (BC-A-14).
      setOptimisticProposing(false)
      // A deterministic move with the dial ON resolved before the 202 returned
      // (move_auto_advanced has no SSE event): confirm it with a toast and
      // refresh the timeline — no gate.
      if (d.state === 'idle' && d.currentVersionId && d.currentVersionId !== beforeVersion) {
        inFlightIntent.current = null // resolved successfully — nothing to restore
        const label = MOVE_LABEL[moveType as MoveType] ?? (moveType || 'move')
        flash(`${label} — applied automatically (safe step)`)
        announce(`${label} — applied automatically`)
        void refreshVersions()
        // The optimistic proposing beat above (intent-bar-originated
        // dispatches only, baseVersion undefined) already unmounted the
        // intent affordances; without a defined refocus here they would
        // remount focus-less, dropped to document.body once the auto-advance
        // resolves back to idle (BC-A-5's prohibition, same spirit). A
        // CookFlow-originated rework never entered that beat and manages its
        // own focus on close (BC-E-4) — this backstop must stay scoped to
        // baseVersion-less dispatches or it would fight that mechanism.
        if (baseVersion === undefined) focusDecision()
      } else if (d.state !== 'idle') {
        // Backstop for the layout-effect dispatch focus above: one macrotask
        // later, re-land focus on the surviving decision surface in case a
        // competing commit moved it (BC-A-5).
        focusDecision()
      }
      return true
    } catch (err) {
      setActionError(errMessage(err))
      // The move never got off the ground: drop the optimistic proposing
      // beat and its focus arm right away — nothing else will ever reconcile
      // them, since no GET/SSE truth is coming for this dispatch (BC-A-14).
      // Both are already no-ops for a CookFlow rework (baseVersion set),
      // which never armed them in the first place.
      setOptimisticProposing(false)
      dispatchFocusPending.current = false
      // The POST itself failed: hand the typed input straight back to the
      // still-idle intent bar (BC-A-13).
      if (inFlightIntent.current) {
        setIntentRestore(inFlightIntent.current.restore)
        inFlightIntent.current = null
      }
      // An intent-bar-originated dispatch just had its affordances remount
      // (the optimistic proposing beat above unmounted them momentarily) —
      // land focus on a defined target rather than letting it drop to
      // document.body (BC-A-5's own prohibition, same spirit here). A
      // CookFlow rework never unmounted, so it needs no such backstop and
      // keeps managing its own focus/state (BC-E-4/BC-E-5).
      if (baseVersion === undefined) focusDecision()
      return false
    } finally {
      moveInFlight.current = false
    }
  }, [announce, beginProposingAnnouncements, detail?.currentVersionId, dishId, flash, focusDecision, refreshVersions])

  // Auto-fired first pass (BC-A-3): the one SPA navigation immediately after
  // a successful create arrives here with autoFirstPass true. Consumed at
  // most once per mount (autoFirstPassArmed flips before the dispatch even
  // starts, so a StrictMode double-invoke or a later detail update can never
  // re-fire it) and only once the dish has actually loaded idle with no
  // version yet — a revisit/reload never carries autoFirstPass true in the
  // first place (App owns that signal), but "no version yet" is also
  // load-bearing here: it is what "a first pass" means, and it keeps this
  // inert as a second, independent guard against ever auto-firing on a dish
  // that already has a decided trial. Dispatches through the SAME propose()
  // path as a manual "Try it" — same lock, focus and stash mechanics —
  // never a parallel dispatch.
  const autoFirstPassArmed = useRef(autoFirstPass)
  useEffect(() => {
    if (!autoFirstPassArmed.current) return
    if (!detail || detail.state !== 'idle' || detail.currentVersionId) return
    autoFirstPassArmed.current = false
    void propose('', '')
  }, [detail, propose])

  // runGate resolves true on success and false on a failed or held (409
  // safety-override) submission — the GateBar keeps its open form mode, and
  // the typed steer text / take-over JSON / tweak values, on a false settle
  // (BC-C-21/BC-C-27).
  const runGate = useCallback(async (body: GateRequestBody): Promise<boolean> => {
    announce(GATE_ANNOUNCE[body.verb])
    // Verbs that respawn a move (regenerate/redirect/alternatives) open a
    // fresh proposing window a token stream will flow into; a harmless reset
    // for the resolving verbs (accept/edit/take_over), which never see one.
    beginProposingAnnouncements()
    setActionError(null)
    setMoveFailed(null)
    try {
      const res = await postGate(dishId, body)
      // Verbs that spawn a move (regenerate/redirect/alternatives) hand over
      // the wait to the new move id; resolving verbs clear it.
      expectedMove.current = res.newMoveId ?? null
      // Arm BC-C-20's withholding window the instant the alternatives verb's
      // own POST resolves — strictly before the server's SSE replay for this
      // move can start (it only begins once this very HTTP handler
      // returns) — and disarm it for every other verb: an accept/edit/
      // regenerate/redirect/take_over dispatched from here can never be the
      // "second alt-card still generating" case.
      alternativesExpectedMoveId.current = body.verb === 'alternatives' ? (res.newMoveId ?? null) : null
      setSelectedProposalId(null)
      setPicked(false)
      setStreamText('')
      if (res.newVersionId) flash(`${VERB_LABEL[res.verb]} — saved to the timeline`)
      await resync()
      void refreshVersions()
      focusDecision()
      return true
    } catch (err) {
      // Human writes (edit/take_over) warn-and-confirm on a safety hit: the
      // orchestrator answers 409 confirm-required until the cook explicitly
      // overrides (recorded as safety_warning_overridden).
      if (err instanceof ApiError && err.status === 409 && /confirm override/i.test(err.message)
        && (body.verb === 'edit' || body.verb === 'take_over')) {
        // Show the cook the safety reasons only — the wire prefix is plumbing.
        const message = err.message.replace(/^.*?confirm override:\s*/i, '')
        setOverride({ message, resend: { ...body, confirmOverride: true } })
        return false
      }
      setActionError(errMessage(err))
      return false
    }
  }, [announce, beginProposingAnnouncements, dishId, flash, focusDecision, refreshVersions, resync])

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
  function onVerb(v: Extract<GateVerb, 'accept' | 'regenerate' | 'alternatives'>): Promise<boolean> | void {
    const target = gateTarget()
    if (!target) return
    return runGate({ proposalId: target, verb: v })
  }

  async function cancelMove() {
    setActionError(null)
    setStreamText('')
    try {
      const cancelled = expectedMove.current
      await postCancel(dishId)
      expectedMove.current = null
      await resync()
      // Once the cancel has resolved to Ready, hand the in-flight intent
      // back to the bar — a Stop is often precisely to rephrase (BC-A-13).
      // The SSE move-cancelled event restores too; the stash is consumed
      // exactly once, so whichever lands first wins.
      restoreIntent(cancelled)
      // Stop unmounts with the proposing card: land focus on whatever
      // decision surface the cancel resolved to — post-cancel that is the
      // stage heading — never dropped to document.body (BC-B-5).
      focusDecision()
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

  // backToCurrent leaves the read-only snapshot for the live view: announced
  // — the return direction is never a silent swap (BC-D-2) — with focus landing
  // on the stage heading, never left on the removed banner button (BC-C-17).
  function backToCurrent() {
    setSnapshot(null)
    announce(ANNOUNCE_BACK_TO_CURRENT)
    document.getElementById('stage-heading')?.focus()
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
      <div role="alert" tabIndex={-1} ref={loadErrorRef} className="p-4 space-y-2 focus:outline-none">
        <p className="text-ink">Could not load this dish: {loadError}. Check the address or pick a dish from the list.</p>
        <button onClick={() => onNavigate('/')}
          className="px-2 py-1 uppercase border border-hairline bg-transparent text-ink transition hover:bg-ink hover:text-page">
          Back to dishes
        </button>
      </div>
    )
  }
  if (!detail) return <div role="status" className="p-4 text-muted">Loading the dish…</div>

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
  // optimisticProposing (BC-A-14) mounts this surface synchronously with
  // dispatch even before detail.state itself has left idle; see its
  // declaration above.
  const isProposing = !snapshot && (detail.state === 'proposing' || optimisticProposing)
  const showAlternatives = !snapshot && detail.state === 'awaiting_gate' && pending.length >= 2 && !picked
  // BC-C-20: the lone alt-card of an in-flight "Compare two options" move,
  // still short its second option — never a stage the cook can gate-decide
  // (accepting it would silently drop the option still generating).
  const awaitingSecondAlternative = !snapshot && detail.state === 'awaiting_gate' && pending.length === 1
    && alternativesExpectedMoveId.current !== null && pending[0].move_id === alternativesExpectedMoveId.current
  const showSingleProposal = !snapshot && detail.state === 'awaiting_gate' && !!selected
    && (pending.length === 1 || picked) && !awaitingSecondAlternative
  const isIdle = !snapshot && detail.state === 'idle'

  return (
    <div className="min-h-screen bg-page text-ink">
      {/* Pre-existing at first render — live regions added later miss
          announcements. Gate lifecycle plus BC-B-10's throttled mid-wait
          progress cue; never the raw per-token stream itself. */}
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
          {/* BC-G-10: text-warning on bg-warning-surface is only ~3.9:1 at
              this 12px/medium size (tokens.css documents the caveat —
              text-warning needs >=~18.66px bold to read as "large" text);
              text-ink keeps the AA floor while the tinted surface + label
              wording still carry the warning register. */}
          <span className="uppercase font-medium text-ink shrink-0">Move failed</span>
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
                  <button onClick={backToCurrent}
                    className="inline-flex items-center min-h-[32px] px-3 uppercase font-medium text-[11px] tracking-[0.06em] border border-hairline-strong bg-panel text-ink transition hover:bg-ink hover:text-page">
                    Back to current
                  </button>
                </div>
                {technical && snapshot.rationale && (
                  // BC-D-12: the accept-time prose recovered on this trial's
                  // snapshot — present only in technical view (an expander of
                  // one, always open: the text just needs to be in the
                  // accessibility tree, not collapsed away by default).
                  <div data-testid="trial-rationale" className="cc-rise mb-4 px-[14px] py-[11px] border border-hairline bg-surface">
                    <span className="block text-2xs uppercase tracking-[0.08em] text-faint mb-[4px]">Why this trial — the accepted rationale</span>
                    <p className="text-[14px] leading-[1.6] text-ink max-w-[64ch] m-0">{snapshot.rationale}</p>
                  </div>
                )}
                <DishCard draft={snapshot.draft} technical={technical} showDetail />
                {detail.state === 'idle' && (
                  <CookFlow versionLabel={trialAlias(snapshotIndex + 1)}
                    onSubmit={(notes) => {
                      const fb = notes.trim() === '' ? 'Cooked it.' : notes
                      setCookNotes((prev) => ({ ...prev, [snapshot.id]: fb }))
                      // The outcome drives the form's close: a failed rework
                      // keeps the notes on screen (BC-E-5).
                      return propose('iterate_feedback', fb, snapshot.id)
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
            ) : awaitingSecondAlternative ? (
              <>
                {/* BC-C-20: option A is in view, but no committing gate verb
                    is reachable — the GateBar mounts nowhere in this branch
                    (no button[data-verb] exists at all) until the second
                    alt-card lands and showAlternatives takes over. */}
                <div data-testid="alternatives-waiting" role="status"
                  className="cc-rise mb-[18px] px-[14px] py-[11px] border border-hairline-strong bg-surface text-muted">
                  1 of 2 — second option still generating…
                </div>
                <DishCard draft={detail.draft}
                  diff={mergeDiff(detail.draft, list(selected!.change))}
                  ops={list(selected!.change)} technical={technical} showDetail={false} />
              </>
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
                        // The outcome drives the form's close: a failed rework
                        // keeps the notes on screen (BC-E-5).
                        return propose('iterate_feedback', fb, cur)
                      }} />
                    <IntentBar canPropose={detail.state === 'idle'} autonomyOn={detail.autonomyDial}
                      servings={detail.draft.constraints.servings} suggestedNext={suggestedNext}
                      onMove={(mt, steer) => void propose(mt, steer)} restore={intentRestore} />
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

      {/* BC-C-26 (⚖ in force): the safety gate's limits, surfaced in the app
          rather than only in the repo (DESIGN §8.7 P0). A persistent,
          quiet-register footer — present across every workbench state
          (idle, proposing, awaiting_gate, blocked) so it satisfies "on the
          idle workbench and on a safety hold" as one element, not two. */}
      <footer className="px-4 py-3 border-t border-hairline text-2xs text-muted">
        This safety gate is a backstop, not a guarantee — always use your own judgment.
      </footer>

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

// pendingSuggestedNext reads the "Try next —" slugs off whichever proposal a
// GET currently shows at the gate (BC-A-14) — null when there is none, so
// callers can leave a chip set already captured from an earlier moment
// untouched rather than clearing it out from under an idle render.
function pendingSuggestedNext(d: DishDetail): string[] | null {
  const p = d.pendingProposal ?? (d.pendingProposals ?? [])[0]
  return p ? list(p.suggested_next) : null
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'request failed'
}

// intentBarInput extracts the typed input a move carried out of the intent
// bar (BC-A-13): the free-text intent (empty moveType — server-side
// classification) or the scale form's servings value. Chips carry no typed
// input, and post-cook reworks (baseVersion set) are CookFlow's to preserve
// (BC-E-5), so both stash nothing.
function intentBarInput(moveType: string, steer: string, baseVersion?: string): IntentRestore | null {
  if (baseVersion !== undefined) return null
  if (moveType === '' && steer !== '') return { intent: steer }
  if (moveType === 'scale_servings') return { scale: steer }
  return null
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
    // The gate bar that spawned this write now keeps its form mode open
    // across the 409 (BC-C-27) rather than resetting to decide, so nothing
    // re-focuses its own buttons anymore — but jsdom's fallback still can't
    // trap focus the way a real showModal() does, so keep the one-macrotask
    // re-claim as a backstop so the least-destructive action reliably holds
    // focus against any late commit.
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
