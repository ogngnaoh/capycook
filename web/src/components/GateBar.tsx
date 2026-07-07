import { useState } from 'react'
import type { GateVerb } from '../types'
import { MORE_VERBS, VERB_LABEL } from '../vocab'

// While the safety gate blocks, only these two verbs exist (spec §4).
const BLOCKED_VERBS: ReadonlyArray<GateVerb> = ['regenerate', 'redirect']

export type GateBarState = 'awaiting_gate' | 'proposing' | 'blocked'

// Ghost is the default voice — hairline chrome, fill-on-hover. Accept is
// the one filled terracotta primary.
const base = 'px-3 py-1 uppercase transition disabled:opacity-40'
const ghost = `${base} bg-transparent text-ink enabled:hover:bg-ink enabled:hover:text-page`
const primary = `${base} bg-accent text-on-accent font-medium`

// The square spinner for in-flight dispatches; the global reduced-motion
// rule stills it.
function Spinner() {
  return (
    <span data-testid="gate-spinner" aria-hidden="true"
      className="inline-block w-2 h-2 mr-1 border border-current border-t-transparent animate-spin align-middle" />
  )
}

// GateBar is the workbench footer control. At the pass it speaks two
// altitudes: the decision pair up front — ACCEPT (the one filled primary)
// and ASK FOR CHANGES (the redirect verb in plain words, slug demoted to
// silent mono) — with the revision/mode-switch verbs (EDIT · REGENERATE ·
// ALTERNATIVES · TAKE OVER, verbatim names) behind a More ▾ disclosure.
// Cancel replaces the bar while proposing; only Regenerate/Ask for changes
// exist while the safety gate holds. A dispatch that returns a promise
// locks the bar (disable + spinner on the clicked control) until it
// settles — a double click cannot fire twice.
export default function GateBar({ state = 'awaiting_gate', onVerb, onCancel, disabled }: {
  state?: GateBarState
  onVerb?: (v: GateVerb) => void | Promise<void>
  onCancel?: () => void | Promise<void>
  disabled?: boolean
}) {
  const [pending, setPending] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const locked = Boolean(disabled) || pending !== null

  async function dispatch(key: string, run?: () => void | Promise<void>) {
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
  }

  function verbButton(verb: GateVerb, extra?: React.ReactNode) {
    return (
      <button key={verb} type="button" disabled={locked}
        onClick={() => void dispatch(verb, onVerb && (() => onVerb(verb)))}
        className={verb === 'accept' ? primary : ghost}>
        {pending === verb && <Spinner />}{VERB_LABEL[verb]}{extra}
      </button>
    )
  }

  if (state === 'proposing') {
    return (
      <div data-testid="gate-bar" className="flex items-center gap-3">
        <span className="uppercase text-muted">Proposing…</span>
        <button type="button" disabled={locked} onClick={() => void dispatch('cancel', onCancel)}
          className={`${ghost} border border-hairline`}>
          {pending === 'cancel' && <Spinner />}Cancel
        </button>
      </div>
    )
  }

  if (state === 'blocked') {
    return (
      <div data-testid="gate-bar" role="group" aria-label="Gate"
        className="inline-flex flex-wrap border border-hairline divide-x divide-hairline bg-page">
        {BLOCKED_VERBS.map((v) => verbButton(v))}
      </div>
    )
  }

  return (
    <div data-testid="gate-bar" role="group" aria-label="Gate"
      className="inline-flex flex-wrap border border-hairline divide-x divide-hairline bg-page">
      {verbButton('accept')}
      {verbButton('redirect', (
        <span aria-hidden="true" className="ml-1 font-mono text-2xs normal-case opacity-60">redirect</span>
      ))}
      <button type="button" disabled={locked} aria-expanded={moreOpen}
        onClick={() => { if (!locked) setMoreOpen((o) => !o) }}
        className={ghost}>
        More<span aria-hidden="true"> ▾</span>
      </button>
      {moreOpen && MORE_VERBS.map((v) => verbButton(v))}
    </div>
  )
}
