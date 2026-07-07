import { useState } from 'react'
import { MOVE_TYPES } from '../types'

// ThreadEntry is one row of the steering thread: the cook's steer turns,
// the model's streamed rationale tokens, collapsed auto-applied
// (move_auto_advanced) entries, post-cook iteration entries
// (cooked version → feedback → proposal), and one-line info notes.
export type ThreadEntry =
  | { kind: 'steer'; text: string }
  | { kind: 'tokens'; moveId: string; text: string; done: boolean }
  | { kind: 'auto'; moveType: string; versionId: string }
  | { kind: 'cooked'; versionId: string; feedback: string }
  | { kind: 'info'; text: string }

// SteeringPane is the right-hand column: the thread plus move initiation
// (move-type select, optional steer, suggested_next chips). Cook turns sit
// tinted and indented right; model turns sit plain on a hairline.
export default function SteeringPane({ thread, suggestedNext, canPropose, onPropose }: {
  thread: ThreadEntry[]
  suggestedNext: string[]
  canPropose: boolean
  onPropose: (moveType: string, steer: string) => void
}) {
  const [moveType, setMoveType] = useState('')
  const [steer, setSteer] = useState('')

  function propose(mt: string) {
    onPropose(mt, steer.trim())
    setSteer('')
  }

  return (
    <section data-testid="steering-pane"
      className="w-96 shrink-0 border-l border-hairline bg-page p-3 flex flex-col gap-3 overflow-y-auto">
      <h2 className="uppercase text-muted">Steering</h2>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {thread.length === 0 && (
          <p className="text-muted">No moves yet — propose the first move below.</p>
        )}
        {thread.map((e, i) => <ThreadItem key={i} entry={e} />)}
      </div>

      <div className="space-y-2 border-t border-hairline pt-3">
        {suggestedNext.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {suggestedNext.map((s) => (
              <button key={s} type="button" disabled={!canPropose} onClick={() => propose(s)}
                className="px-1 font-mono text-2xs border border-hairline-strong bg-transparent text-muted transition enabled:hover:bg-ink enabled:hover:text-page disabled:opacity-40">
                {s}
              </button>
            ))}
          </div>
        )}
        <label className="block uppercase text-muted">
          Move type
          <select value={moveType} onChange={(e) => setMoveType(e.target.value)}
            className="mt-1 w-full border border-hairline-strong bg-page p-1 text-ink normal-case">
            <option value="">auto (expand seed / iterate)</option>
            {MOVE_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="block uppercase text-muted">
          Steer (optional)
          <textarea value={steer} onChange={(e) => setSteer(e.target.value)} rows={2}
            className="mt-1 w-full border border-hairline-strong bg-page p-1 text-ink normal-case" />
        </label>
        <button type="button" disabled={!canPropose} onClick={() => propose(moveType)}
          className="w-full px-3 py-2 uppercase bg-accent text-on-accent font-medium disabled:opacity-40">
          Propose a move
        </button>
        {!canPropose && (
          <p className="text-muted">Resolve the current move to propose another.</p>
        )}
      </div>
    </section>
  )
}

function ThreadItem({ entry }: { entry: ThreadEntry }) {
  switch (entry.kind) {
    case 'steer':
      return (
        <div className="ml-5 p-2 bg-surface text-ink">
          <span className="block uppercase text-2xs text-muted">You</span>
          {entry.text}
        </div>
      )
    case 'tokens':
      return (
        <div className="p-2 border border-hairline bg-page text-ink">
          <span className="block uppercase text-2xs text-muted">Model</span>
          {entry.text}
          {!entry.done && <span aria-hidden="true" className="text-muted">▋</span>}
        </div>
      )
    case 'auto':
      return (
        <details data-testid="auto-advanced"
          className="p-2 border border-hairline bg-page text-2xs text-muted">
          <summary className="cursor-pointer uppercase">auto-applied: {entry.moveType}</summary>
          <div className="mt-1">
            Deterministic move applied by the autonomy dial → version{' '}
            <span className="font-mono">{entry.versionId}</span>
          </div>
        </details>
      )
    case 'cooked':
      return (
        <div data-testid="cooked-entry" className="ml-5 p-2 bg-surface text-ink">
          <span className="block uppercase text-2xs text-muted">
            You cooked <span className="font-mono normal-case">{entry.versionId}</span>
          </span>
          {entry.feedback}
          <span className="block text-2xs text-muted">→ one rework proposal follows</span>
        </div>
      )
    case 'info':
      return <div className="text-2xs text-muted">{entry.text}</div>
  }
}
