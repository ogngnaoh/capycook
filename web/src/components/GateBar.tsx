import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { Draft, GateVerb, Op, Proposal } from '../types'
import { list } from '../types'
import { GATE_ANOTHER_LABEL, GATE_PROMPT, VERB_LABEL } from '../vocab'
import { getShortcuts } from '../lib/shortcuts'
import { opLineLabel } from '../lib/pathLabels'

// GateBar is the workbench's one non-negotiable control: every gate verb
// dispatches through here. It speaks in modes, not states — decide (the
// two front-line moves + the disclosure), another (the four revision/
// mode-switch verbs), and three real editors (tweak/redirect/takeover) that
// used to be separate panels bolted onto Workbench. Design markup lines
// 424-486 + 908-921 (agent_docs/design/CapyCook-Redesign.dc.html).
export type GateMode = 'decide' | 'another' | 'tweak' | 'redirect' | 'takeover'

// Two hard-won behaviors carried over verbatim from the pre-redesign bar:
//
// (1) The in-flight lock is aria-disabled, never native `disabled`: a
// natively-disabled focused button drops focus to <body> mid-dispatch and
// the screen reader goes silent. aria-disabled keeps the control focusable
// while a behavioral click-guard (the `locked` check inside `dispatch`)
// stops re-fires. The opacity dim rides the aria-disabled variant; hover is
// suppressed while locked since Tailwind has no aria-not-disabled.
//
// (2) The button rows are APG toolbars: one tab stop, roving tabindex,
// Left/Right (wrap) + Home/End. This only applies to the decide/another
// button rows — the tweak/redirect/takeover modes are real forms (a text
// field plus two buttons), and hijacking Left/Right there would break
// caret movement inside the input, so those keep plain tab order instead.
const base = 'uppercase transition disabled:opacity-40 aria-disabled:opacity-40 leading-[1]'
const primaryBtn = `${base} border border-accent bg-accent text-on-accent font-medium text-[12px] tracking-[0.06em] px-[18px] min-h-[44px] inline-flex items-center justify-center`

function bigGhostBtn(locked: boolean) {
  return `${base} border border-hairline-strong bg-panel text-ink font-medium text-[12px] tracking-[0.06em] px-[18px] py-[13px] min-h-[44px] ${locked ? '' : 'hover:bg-ink hover:text-page'}`
}
function smallGhostBtn(locked: boolean) {
  return `${base} border border-hairline-strong bg-panel text-ink font-medium text-2xs tracking-[0.05em] px-[12px] py-[9px] min-h-[34px] ${locked ? '' : 'hover:bg-ink hover:text-page'}`
}

// The square spinner for in-flight dispatches; the global reduced-motion
// rule stills it.
function Spinner() {
  return (
    <span data-testid="gate-spinner" aria-hidden="true"
      className="inline-block w-2 h-2 mr-1 border border-current border-t-transparent animate-spin align-middle" />
  )
}

// The kbd hint riding inside a button (design: `A`/`E`/`G`/`L`/`R`/`T` in
// mono, dimmed). aria-hidden — the shortcut is carried to AT via
// aria-keyshortcuts on the button itself, and only shown when the whole
// feature is enabled (WCAG 2.1.4 — a hint for a dead key is a lie).
function Hint({ letter }: { letter: string }) {
  return <span aria-hidden="true" className="ml-1 font-mono opacity-50 normal-case">{letter}</span>
}

function editableValue(v: unknown): string {
  if (typeof v === 'string') return v
  return v === undefined ? '' : JSON.stringify(v)
}

// parseEdited mirrors editableValue: string-valued ops stay raw text;
// everything else round-trips through JSON (falling back to the raw string
// when it no longer parses). Ported verbatim from the pre-redesign EditForm
// (Workbench.tsx:672-679).
function parseEdited(text: string, original: unknown): unknown {
  if (typeof original === 'string') return text
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function isTypingTarget(el: Element | null): boolean {
  const tag = el?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

// The take-over draft's required top-level shape (BC-C-28): valid JSON is
// not enough — the server decodes with Go zero-value semantics, so a key
// deleted from the textarea (e.g. the whole "steps" section) commits a
// trial with that section silently wiped rather than failing to parse.
// isPlainObject/validateDraftShape catch that class of structurally-invalid
// draft — a required key entirely missing, or present with the wrong JSON
// type — before it ever reaches onTakeoverSubmit.
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const DRAFT_SHAPE: Record<string, 'string' | 'object' | 'list'> = {
  title: 'string',
  concept: 'string',
  flavor_rationale: 'list',
  ingredients: 'list',
  steps: 'list',
  constraints: 'object',
  analysis: 'object',
}

function validateDraftShape(value: unknown): string | null {
  if (!isPlainObject(value)) {
    return 'The draft must be a JSON object with title, concept, ingredients, steps, constraints and analysis.'
  }
  for (const [key, kind] of Object.entries(DRAFT_SHAPE)) {
    if (!(key in value)) {
      return `The draft is missing "${key}" — every field is required (an empty list is fine, a missing one is not).`
    }
    const field = value[key]
    if (kind === 'string' && typeof field !== 'string') {
      return `"${key}" must be text, not ${describeType(field)}.`
    }
    if (kind === 'object' && !isPlainObject(field)) {
      return `"${key}" must be an object, not ${describeType(field)}.`
    }
    if (kind === 'list' && field !== null && !Array.isArray(field)) {
      return `"${key}" must be a list (or null), not ${describeType(field)}.`
    }
  }
  return null
}

function describeType(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'a list'
  return typeof v
}

export default function GateBar({
  proposal, draft, onAccept, onEditSubmit, onRegenerate, onAlternatives,
  onRedirectSubmit, onTakeoverSubmit, disabled,
}: {
  proposal: Proposal
  draft: Draft
  // Promise-returning handlers report their outcome: resolving `false` marks
  // a failed or held submission (the mode stays open — BC-C-21/BC-C-27);
  // anything else counts as success.
  onAccept: () => Promise<boolean | void> | void
  onEditSubmit: (ops: Op[]) => Promise<boolean | void> | void
  onRegenerate: () => Promise<boolean | void> | void
  onAlternatives: () => Promise<boolean | void> | void
  onRedirectSubmit: (steer: string) => Promise<boolean | void> | void
  onTakeoverSubmit: (draft: Draft) => Promise<boolean | void> | void
  disabled?: boolean
}) {
  const [mode, setModeState] = useState<GateMode>('decide')
  const [pending, setPending] = useState<GateVerb | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [shortcuts] = useState(getShortcuts)
  const locked = Boolean(disabled) || pending !== null

  const ops = list(proposal.change)
  const [editValues, setEditValues] = useState<string[]>(
    () => ops.map((op) => (op.op === 'remove' ? '' : editableValue(op.value))),
  )
  const [steerText, setSteerText] = useState('')
  const [takeoverText, setTakeoverText] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  // Opener refs: where focus lands when a mode reached from here closes.
  // (Typed `| null` so TS treats `.current` as mutable — our own ref
  // callbacks below assign into them directly.)
  const tweakItRef = useRef<HTMLButtonElement | null>(null)
  const tryAnotherRef = useRef<HTMLButtonElement | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([])

  // dispatch runs one of the six verbs. A void return is instant (no lock);
  // a promise locks the bar (aria-disabled + spinner) until it settles, and
  // only a *successful* settle returns the bar to decide. A handler that
  // resolves `false` — a failed gate POST, or a safety-override hold — keeps
  // the current mode mounted, so the cook's exact steer text / JSON / tweak
  // values survive the failure (BC-C-21) and the safety-override's "Go back"
  // returns to a take-over textarea byte-identical to what was submitted
  // (BC-C-27). A rejected promise likewise keeps the mode.
  const dispatch = useCallback((key: GateVerb, run: () => void | Promise<boolean | void>) => {
    if (locked) return
    const result = run()
    if (result instanceof Promise) {
      setPending(key)
      result.then((ok) => { if (ok !== false) setModeState('decide') }).finally(() => setPending(null))
    } else {
      setModeState('decide')
    }
  }, [locked])

  const openMode = useCallback((next: GateMode) => {
    if (locked) return
    setModeState(next)
  }, [locked])

  const backToDecide = useCallback(() => {
    if (locked) return
    setModeState('decide')
  }, [locked])

  // Focus protocol (brief): entering a form mode focuses its first field;
  // leaving any mode back to decide returns focus to whichever button
  // opened that journey (Tweak it for tweak; Try another way for
  // another/redirect/takeover, since Back/Cancel always jump straight to
  // decide rather than one level up — matching the reference design's
  // onGateBack, which is a single `gateMode:'decide'` setter everywhere).
  const prevMode = useRef<GateMode>('decide')
  useEffect(() => {
    const leaving = prevMode.current
    if (leaving === mode) return
    prevMode.current = mode
    if (mode === 'decide') {
      setActiveIndex(0)
      if (leaving === 'tweak') tweakItRef.current?.focus()
      else tryAnotherRef.current?.focus()
    } else if (mode === 'another') {
      setActiveIndex(0)
      btnRefs.current[0]?.focus()
    } else {
      formRef.current?.querySelector<HTMLElement>('input, textarea')?.focus()
    }
  }, [mode])

  // Tweak/takeover/redirect fields re-seed fresh every time their mode
  // opens (mirrors the reference design's onTweak/onTakeover handlers,
  // which recompute editInput/takeoverInput at the moment the mode opens).
  useEffect(() => {
    if (mode === 'tweak') {
      setEditValues(ops.map((op) => (op.op === 'remove' ? '' : editableValue(op.value))))
    } else if (mode === 'redirect') {
      setSteerText('')
    } else if (mode === 'takeover') {
      setTakeoverText(JSON.stringify(draft, null, 2))
      setParseError(null)
    }
    // ops/draft are read fresh at the moment `mode` transitions; re-running
    // this on every ops/draft identity change would stomp in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    if (parseError) errorRef.current?.focus()
  }, [parseError])

  // Escape is basic keyboard navigation, not a mnemonic — it must keep
  // working (blur a focused field; fall a non-decide mode back to decide)
  // even when getShortcuts().enabled is false. Kept in its own always-live
  // effect so it never rides the same on/off switch as the letter verbs.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const target = e.target as Element | null
      if (isTypingTarget(target)) { (target as HTMLElement).blur(); return }
      if (mode !== 'decide') backToDecide()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mode, backToDecide])

  // Scoped single-key shortcuts (WCAG 2.1.4): the whole feature is
  // disableable via getShortcuts().enabled — Escape above is unaffected;
  // only these letter verbs disappear. They only fire in decide mode (port
  // of design 908-921).
  useEffect(() => {
    if (!shortcuts.enabled) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') return // owned by the always-live effect above
      const target = e.target as Element | null
      if (isTypingTarget(target)) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (mode !== 'decide') return
      const key = e.key.toLowerCase()
      if (key === shortcuts.map.accept) { e.preventDefault(); dispatch('accept', onAccept) }
      else if (key === shortcuts.map.edit) { e.preventDefault(); openMode('tweak') }
      else if (key === shortcuts.map.regenerate) { e.preventDefault(); dispatch('regenerate', onRegenerate) }
      else if (key === shortcuts.map.alternatives) { e.preventDefault(); dispatch('alternatives', onAlternatives) }
      else if (key === shortcuts.map.redirect) { e.preventDefault(); openMode('redirect') }
      else if (key === shortcuts.map.take_over) { e.preventDefault(); openMode('takeover') }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [shortcuts, mode, dispatch, openMode, onAccept, onRegenerate, onAlternatives])

  // Roving tabindex over the current button row (decide: 3 controls,
  // another: 5). Arrow keys only — Tab still moves to the one active stop.
  function onToolbarKeyDown(e: React.KeyboardEvent, count: number) {
    let next = activeIndex
    switch (e.key) {
      case 'ArrowRight': next = (activeIndex + 1) % count; break
      case 'ArrowLeft': next = (activeIndex - 1 + count) % count; break
      case 'Home': next = 0; break
      case 'End': next = count - 1; break
      default: return
    }
    e.preventDefault()
    setActiveIndex(next)
    btnRefs.current[next]?.focus()
  }

  // BC-C-13 empty-guard: a content-free edit — every editable field cleared
  // and nothing being removed (a remove op is real content) — can never
  // dispatch. Save disables (dimmed via `disabled:opacity-40`, mirroring the
  // redirect Send guard) and the submit handler backstops it.
  const tweakEmpty = ops.every((op, i) => op.op !== 'remove' && (editValues[i] ?? '').trim() === '')

  function submitTweak(e: FormEvent) {
    e.preventDefault()
    if (locked || tweakEmpty) return
    const nextOps = ops.map((op, i) => (op.op === 'remove' ? op : { ...op, value: parseEdited(editValues[i], op.value) }))
    dispatch('edit', () => onEditSubmit(nextOps))
  }

  function submitRedirect(e: FormEvent) {
    e.preventDefault()
    if (locked || steerText.trim() === '') return
    dispatch('redirect', () => onRedirectSubmit(steerText.trim()))
  }

  function submitTakeover(e: FormEvent) {
    e.preventDefault()
    if (locked) return
    let parsed: unknown
    try {
      parsed = JSON.parse(takeoverText)
    } catch {
      setParseError('The draft is not valid JSON — fix the highlighted text and save again.')
      return
    }
    // Valid JSON is not the same as a valid draft (BC-C-28): a structurally
    // wrong shape — a required key missing or type-mismatched — is rejected
    // here, before it ever reaches the gate POST, never a silent commit
    // with the server's Go zero-value wipe.
    const shapeError = validateDraftShape(parsed)
    if (shapeError) {
      setParseError(shapeError)
      return
    }
    setParseError(null)
    dispatch('take_over', () => onTakeoverSubmit(parsed as Draft))
  }

  return (
    <div id="cc-gate" data-testid="gate-bar"
      className="sticky bottom-0 z-sticky border-t border-hairline-strong bg-panel px-[26px] py-[12px]">
      <div className="max-w-[840px] mx-auto">
        {mode === 'decide' && (
          <div className="flex items-center gap-[12px] flex-wrap">
            <span className="text-[13px] text-muted">{GATE_PROMPT}</span>
            <div className="flex-1 min-w-[10px]" />
            <div role="toolbar" aria-label="Decide on this change"
              onKeyDown={(e) => onToolbarKeyDown(e, 3)}
              className="flex gap-[8px] flex-wrap">
              <button type="button" data-verb="accept"
                ref={(el) => { btnRefs.current[0] = el }}
                tabIndex={activeIndex === 0 ? 0 : -1} aria-disabled={locked}
                aria-keyshortcuts={shortcuts.enabled ? shortcuts.map.accept : undefined}
                onFocus={() => setActiveIndex(0)}
                onClick={() => dispatch('accept', onAccept)}
                className={primaryBtn}>
                {pending === 'accept' && <Spinner />}{VERB_LABEL.accept}
                {shortcuts.enabled && <Hint letter={shortcuts.map.accept.toUpperCase()} />}
              </button>
              <button type="button" data-verb="edit"
                ref={(el) => { btnRefs.current[1] = el; tweakItRef.current = el }}
                tabIndex={activeIndex === 1 ? 0 : -1} aria-disabled={locked}
                aria-keyshortcuts={shortcuts.enabled ? shortcuts.map.edit : undefined}
                onFocus={() => setActiveIndex(1)}
                onClick={() => openMode('tweak')}
                className={bigGhostBtn(locked)}>
                {VERB_LABEL.edit}
                {shortcuts.enabled && <Hint letter={shortcuts.map.edit.toUpperCase()} />}
              </button>
              <button type="button"
                ref={(el) => { btnRefs.current[2] = el; tryAnotherRef.current = el }}
                tabIndex={activeIndex === 2 ? 0 : -1} aria-disabled={locked}
                aria-expanded="false"
                onFocus={() => setActiveIndex(2)}
                onClick={() => openMode('another')}
                className={bigGhostBtn(locked)}>
                {GATE_ANOTHER_LABEL}<span aria-hidden="true"> ▾</span>
              </button>
            </div>
          </div>
        )}

        {mode === 'another' && (
          <div className="cc-rise flex flex-col gap-[8px]">
            {/* The disclosure header itself: not a roving-tabindex member of
                the toolbar below (that toolbar keeps its own single tab
                stop) but a real toggle telling assistive tech the four
                verbs it opened are now showing (BC-C-22) — activating it
                collapses back to decide, same as Back. */}
            <button type="button" aria-disabled={locked} aria-expanded="true"
              onClick={backToDecide}
              className="self-start min-h-[24px] inline-flex items-center text-[12px] text-muted transition hover:text-ink">
              {GATE_ANOTHER_LABEL}<span aria-hidden="true"> ▴</span>
            </button>
            <div role="toolbar" aria-label="Decide on this change"
              onKeyDown={(e) => onToolbarKeyDown(e, 5)}
              className="flex items-center gap-[10px] flex-wrap">
              <button type="button" data-verb="regenerate"
                ref={(el) => { btnRefs.current[0] = el }}
                tabIndex={activeIndex === 0 ? 0 : -1} aria-disabled={locked}
                aria-keyshortcuts={shortcuts.enabled ? shortcuts.map.regenerate : undefined}
                onFocus={() => setActiveIndex(0)}
                onClick={() => dispatch('regenerate', onRegenerate)}
                className={smallGhostBtn(locked)}>
                {pending === 'regenerate' && <Spinner />}{VERB_LABEL.regenerate}
                {shortcuts.enabled && <Hint letter={shortcuts.map.regenerate.toUpperCase()} />}
              </button>
              <button type="button" data-verb="alternatives"
                ref={(el) => { btnRefs.current[1] = el }}
                tabIndex={activeIndex === 1 ? 0 : -1} aria-disabled={locked}
                aria-keyshortcuts={shortcuts.enabled ? shortcuts.map.alternatives : undefined}
                onFocus={() => setActiveIndex(1)}
                onClick={() => dispatch('alternatives', onAlternatives)}
                className={smallGhostBtn(locked)}>
                {pending === 'alternatives' && <Spinner />}{VERB_LABEL.alternatives}
                {shortcuts.enabled && <Hint letter={shortcuts.map.alternatives.toUpperCase()} />}
              </button>
              <button type="button" data-verb="redirect"
                ref={(el) => { btnRefs.current[2] = el }}
                tabIndex={activeIndex === 2 ? 0 : -1} aria-disabled={locked}
                aria-keyshortcuts={shortcuts.enabled ? shortcuts.map.redirect : undefined}
                onFocus={() => setActiveIndex(2)}
                onClick={() => openMode('redirect')}
                className={smallGhostBtn(locked)}>
                {VERB_LABEL.redirect}
                {shortcuts.enabled && <Hint letter={shortcuts.map.redirect.toUpperCase()} />}
              </button>
              <button type="button" data-verb="take_over"
                ref={(el) => { btnRefs.current[3] = el }}
                tabIndex={activeIndex === 3 ? 0 : -1} aria-disabled={locked}
                aria-keyshortcuts={shortcuts.enabled ? shortcuts.map.take_over : undefined}
                onFocus={() => setActiveIndex(3)}
                onClick={() => openMode('takeover')}
                className={smallGhostBtn(locked)}>
                {VERB_LABEL.take_over}
                {shortcuts.enabled && <Hint letter={shortcuts.map.take_over.toUpperCase()} />}
              </button>
              <div className="flex-1" />
              <button type="button"
                ref={(el) => { btnRefs.current[4] = el }}
                tabIndex={activeIndex === 4 ? 0 : -1} aria-disabled={locked}
                onFocus={() => setActiveIndex(4)}
                onClick={backToDecide}
                className={smallGhostBtn(locked)}>
                ← Back
              </button>
            </div>
          </div>
        )}

        {mode === 'tweak' && (
          <form ref={formRef} onSubmit={submitTweak} data-testid="tweak-form" className="cc-rise">
            <label className="block text-[11px] tracking-[0.1em] uppercase text-muted mb-[6px]">
              Tweak the concept before you keep it
            </label>
            <div className="flex flex-col gap-[10px] mb-[10px]">
              {ops.length === 0 && <p className="text-muted">Nothing to tweak — this change has no fields.</p>}
              {ops.map((op, i) => (
                <label key={i} className="block text-muted">
                  <span className="uppercase text-[11px]">{opLineLabel(op)}</span>
                  <span className="ml-1 font-mono text-2xs opacity-60">{op.path}</span>
                  {op.op === 'remove' ? (
                    <span className="block text-muted">(removal — nothing to edit)</span>
                  ) : (
                    <input value={editValues[i] ?? ''} aria-disabled={locked}
                      onChange={(e) => setEditValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                      className="mt-1 w-full border border-accent bg-panel text-ink text-[14px] p-[11px] min-h-[44px]" />
                  )}
                </label>
              ))}
            </div>
            <div className="flex gap-[10px]">
              <button type="submit" disabled={tweakEmpty} aria-disabled={locked} className={primaryBtn}>
                {pending === 'edit' && <Spinner />}Keep with edit
              </button>
              <button type="button" aria-disabled={locked} onClick={backToDecide} className={smallGhostBtn(locked)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {mode === 'redirect' && (
          <form ref={formRef} onSubmit={submitRedirect} data-testid="redirect-form" className="cc-rise">
            <label htmlFor="gate-redirect-input"
              className="block text-[11px] tracking-[0.1em] uppercase text-muted mb-[6px]">
              Ask for a different change
            </label>
            {/* BC-G-12: same flex-1-input-won't-shrink clip as IntentBar's
                #cc-intent row — min-w-0 + flex-wrap so "Send"/"Cancel" don't
                clip off-screen at 320px. */}
            <div className="flex flex-wrap gap-[10px]">
              <input id="gate-redirect-input" value={steerText}
                onChange={(e) => setSteerText(e.target.value)}
                placeholder="e.g. keep the salt but add brightness instead"
                aria-disabled={locked}
                className="flex-1 min-w-0 border border-accent bg-panel text-ink text-[14px] p-[11px] min-h-[44px]" />
              <button type="submit" disabled={steerText.trim() === ''} aria-disabled={locked} className={primaryBtn}>
                {pending === 'redirect' && <Spinner />}Send
              </button>
              <button type="button" aria-disabled={locked} onClick={backToDecide} className={smallGhostBtn(locked)}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {mode === 'takeover' && (
          <form ref={formRef} onSubmit={submitTakeover} data-testid="takeover-form" className="cc-rise">
            <label className="block text-[11px] tracking-[0.1em] uppercase text-muted mb-[6px]">
              Edit the draft yourself
            </label>
            <textarea value={takeoverText} onChange={(e) => setTakeoverText(e.target.value)}
              aria-label="Draft JSON" aria-disabled={locked}
              aria-invalid={parseError ? true : undefined}
              aria-describedby={parseError ? 'gate-takeover-error' : undefined}
              className="w-full min-h-[80px] resize-y border border-accent bg-panel text-ink font-mono text-[12px] leading-[1.6] p-[11px]" />
            {parseError && (
              <p id="gate-takeover-error" role="alert" tabIndex={-1} ref={errorRef}
                className="mt-1 text-critical focus:outline-none">
                <span className="sr-only">Error: </span>{parseError}
              </p>
            )}
            <div className="flex gap-[10px] mt-[10px]">
              <button type="submit" aria-disabled={locked} className={primaryBtn}>
                {pending === 'take_over' && <Spinner />}Save draft
              </button>
              <button type="button" aria-disabled={locked} onClick={backToDecide} className={smallGhostBtn(locked)}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
