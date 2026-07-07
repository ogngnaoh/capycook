import { useCallback, useEffect, useRef, useState } from 'react'
import type { GateVerb } from '../types'
import { MORE_VERBS, VERB_LABEL } from '../vocab'
import { getShortcuts } from '../lib/shortcuts'

// While the safety gate blocks, only these two verbs exist (spec §4).
const BLOCKED_VERBS: ReadonlyArray<GateVerb> = ['regenerate', 'redirect']

export type GateBarState = 'awaiting_gate' | 'proposing' | 'blocked'

// Ghost is the default voice — hairline chrome, fill-on-hover. Accept is the
// one filled terracotta primary. The in-flight lock is aria-disabled, never
// native `disabled` (brief P4 / audit #4): a natively-disabled focused button
// drops focus to <body> mid-dispatch and the SR goes silent; aria-disabled
// keeps the control focusable while the behavioral click-guard stops re-fires.
// The opacity dim rides the aria-disabled variant; hover is suppressed while
// locked (Tailwind has no aria-not-disabled, so it's a conditional class).
const base = 'px-3 py-1 uppercase transition aria-disabled:opacity-40'
const primary = `${base} bg-accent text-on-accent font-medium`
const ghostBase = `${base} bg-transparent text-ink`
const ghostHover = 'hover:bg-ink hover:text-page'

// The square spinner for in-flight dispatches; the global reduced-motion
// rule stills it.
function Spinner() {
  return (
    <span data-testid="gate-spinner" aria-hidden="true"
      className="inline-block w-2 h-2 mr-1 border border-current border-t-transparent animate-spin align-middle" />
  )
}

// Which verbs' single-key shortcut is live per state (brief §5c): all six at
// the pass, only Regenerate/Redirect on a hold.
function shortcutVerbs(state: GateBarState): GateVerb[] {
  return state === 'blocked' ? [...BLOCKED_VERBS] : ['accept', 'redirect', ...MORE_VERBS]
}

// Visible-hint order at the pass (brief P4): A · R · E · G · L · T.
const HINT_ORDER: readonly GateVerb[] = ['accept', 'redirect', 'edit', 'regenerate', 'alternatives', 'take_over']

// A shortcut stands down while the user is typing or inside a dialog — the
// simplest honest scope (brief P4). The document listener is otherwise live
// whenever the bar is mounted at the pass / on a hold.
function isTypingContext(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if ((el as HTMLElement).isContentEditable) return true
  return Boolean(el.closest('[role="dialog"], dialog'))
}

// GateBar is the workbench footer control. At the pass it speaks two altitudes:
// the decision pair up front — ACCEPT (the one filled primary) and ASK FOR
// CHANGES (the redirect verb in plain words, slug demoted to silent mono) —
// with the revision/mode-switch verbs (EDIT · REGENERATE · ALTERNATIVES · TAKE
// OVER, verbatim names) behind a More ▾ disclosure. Cancel replaces the bar
// while proposing; only Regenerate/Ask for changes exist while the safety gate
// holds. It is an APG toolbar: one tab stop, roving tabindex, Left/Right (wrap)
// + Home/End; single-key shortcuts (A · R · E · G · L · T) dispatch verbs
// directly, scoped and remappable via the localStorage store.
export default function GateBar({ state = 'awaiting_gate', onVerb, onCancel, disabled }: {
  state?: GateBarState
  onVerb?: (v: GateVerb) => void | Promise<void>
  onCancel?: () => void | Promise<void>
  disabled?: boolean
}) {
  const [pending, setPending] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [shortcuts] = useState(getShortcuts)
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([])
  const locked = Boolean(disabled) || pending !== null

  const dispatch = useCallback(async (key: string, run?: () => void | Promise<void>) => {
    if (locked || !run) return
    setMoreOpen(false)
    const result = run()
    if (result instanceof Promise) {
      setPending(key)
      try {
        await result
      } finally {
        setPending(null)
      }
    }
  }, [locked])

  // Scoped single-key shortcuts (brief §5c, WCAG 2.1.4). A document keydown
  // listener, live only while the bar sits at the pass / on a hold and focus is
  // not in a typing context; dispatches through the same locked-guarded path,
  // so the More verbs fire without opening the disclosure. Disableable /
  // remappable via the store — no bespoke UI needed.
  useEffect(() => {
    if (!shortcuts.enabled) return
    if (state !== 'awaiting_gate' && state !== 'blocked') return
    const allowed = shortcutVerbs(state)
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (isTypingContext(document.activeElement)) return
      const key = e.key.toLowerCase()
      const verb = allowed.find((v) => shortcuts.map[v]?.toLowerCase() === key)
      if (!verb) return
      e.preventDefault()
      void dispatch(verb, onVerb && (() => onVerb(verb)))
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [state, onVerb, dispatch, shortcuts])

  if (state === 'proposing') {
    return (
      <div data-testid="gate-bar" className="flex items-center gap-3">
        <span className="uppercase text-muted">Proposing…</span>
        <button type="button" aria-disabled={locked} onClick={() => void dispatch('cancel', onCancel)}
          className={`${ghostBase} ${locked ? '' : ghostHover} border border-hairline`}>
          {pending === 'cancel' && <Spinner />}Cancel
        </button>
      </div>
    )
  }

  // Toolbar controls in tab order: the decision pair, More, then the revealed
  // More verbs (at the pass); Regenerate/Redirect on a hold.
  type Control = { kind: 'verb'; verb: GateVerb } | { kind: 'more' }
  const controls: Control[] =
    state === 'blocked'
      ? BLOCKED_VERBS.map((verb) => ({ kind: 'verb', verb }))
      : [
          { kind: 'verb', verb: 'accept' },
          { kind: 'verb', verb: 'redirect' },
          { kind: 'more' },
          ...(moreOpen ? MORE_VERBS.map((verb) => ({ kind: 'verb' as const, verb })) : []),
        ]
  const active = Math.min(activeIndex, controls.length - 1)

  // Roving tabindex: Left/Right move focus and wrap; Home/End hit the ends.
  function onToolbarKeyDown(e: React.KeyboardEvent) {
    const n = controls.length
    let next = active
    switch (e.key) {
      case 'ArrowRight': next = (active + 1) % n; break
      case 'ArrowLeft': next = (active - 1 + n) % n; break
      case 'Home': next = 0; break
      case 'End': next = n - 1; break
      default: return
    }
    e.preventDefault()
    setActiveIndex(next)
    btnRefs.current[next]?.focus()
  }

  function verbButton(verb: GateVerb, index: number, extra?: React.ReactNode) {
    return (
      <button key={verb} type="button"
        ref={(el) => { btnRefs.current[index] = el }}
        tabIndex={index === active ? 0 : -1}
        aria-disabled={locked}
        aria-keyshortcuts={shortcuts.enabled ? shortcuts.map[verb] : undefined}
        onFocus={() => setActiveIndex(index)}
        onClick={() => void dispatch(verb, onVerb && (() => onVerb(verb)))}
        className={verb === 'accept' ? primary : `${ghostBase} ${locked ? '' : ghostHover}`}>
        {pending === verb && <Spinner />}{VERB_LABEL[verb]}{extra}
      </button>
    )
  }

  const label = state === 'blocked'
    ? 'Gate — respond to the safety hold'
    : 'Gate — respond to the proposal'

  // The visible key hint — decorative for AT (aria-keyshortcuts carries it
  // semantically), built from the live map so a remap re-reads.
  const hintVerbs = state === 'blocked' ? BLOCKED_VERBS : HINT_ORDER
  const hint = shortcuts.enabled
    ? `keys: ${hintVerbs.map((v) => shortcuts.map[v].toUpperCase()).join(' · ')}`
    : null

  return (
    <div data-testid="gate-bar">
      <div role="toolbar" aria-label={label} onKeyDown={onToolbarKeyDown}
        className="inline-flex flex-wrap border border-hairline divide-x divide-hairline bg-page">
        {controls.map((c, i) => {
          if (c.kind === 'more') {
            return (
              <button key="more" type="button"
                ref={(el) => { btnRefs.current[i] = el }}
                tabIndex={i === active ? 0 : -1}
                aria-disabled={locked}
                aria-expanded={moreOpen}
                onFocus={() => setActiveIndex(i)}
                onClick={() => { if (!locked) setMoreOpen((o) => !o) }}
                className={`${ghostBase} ${locked ? '' : ghostHover}`}>
                More<span aria-hidden="true"> ▾</span>
              </button>
            )
          }
          const extra = c.verb === 'redirect' ? (
            <span aria-hidden="true" className="ml-1 font-mono text-2xs normal-case opacity-60">redirect</span>
          ) : undefined
          return verbButton(c.verb, i, extra)
        })}
      </div>
      {hint && <p aria-hidden="true" className="mt-1 font-mono text-2xs text-muted normal-case">{hint}</p>}
    </div>
  )
}
