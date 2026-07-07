import { useEffect, useRef, useState } from 'react'
import { MOVE_TYPES } from '../types'
import { DIRECTION_LABEL, EMPTY_THREAD, MOVE_LABEL } from '../vocab'

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
  // The thread follows its newest turn (streamed tokens land at the
  // bottom) unless the cook has scrolled up to read older turns.
  const threadBox = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  useEffect(() => {
    const el = threadBox.current
    if (el && pinned.current) el.scrollTop = el.scrollHeight
  }, [thread])

  function onThreadScroll() {
    const el = threadBox.current
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  function propose(mt: string) {
    onPropose(mt, steer.trim())
    setSteer('')
  }

  return (
    <section data-testid="steering-pane" id="steering-anchor" tabIndex={-1}
      aria-labelledby="steering-heading"
      className="w-steering shrink-0 border-l border-hairline bg-page p-3 flex flex-col gap-3 overflow-y-auto focus:outline-none">
      <h2 id="steering-heading" className="uppercase text-muted">Steering</h2>

      <div data-testid="steering-thread" ref={threadBox} onScroll={onThreadScroll}
        className="flex-1 space-y-2 overflow-y-auto">
        {thread.length === 0 && (
          <p className="text-muted">
            {canPropose ? EMPTY_THREAD : 'No moves in this session yet.'}
          </p>
        )}
        {thread.map((e, i) => <ThreadItem key={i} entry={e} />)}
      </div>

      <div className="space-y-2 border-t border-hairline pt-3">
        {suggestedNext.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {suggestedNext.map((s) => (
              <button key={s} type="button" disabled={!canPropose} onClick={() => propose(s)}
                className="px-1 text-2xs border border-hairline-strong bg-transparent text-muted transition enabled:hover:bg-ink enabled:hover:text-page disabled:opacity-40">
                {MOVE_LABEL[s as keyof typeof MOVE_LABEL] ?? s}{' '}
                <span className="font-mono opacity-60">{s}</span>
              </button>
            ))}
          </div>
        )}
        <label className="block uppercase text-muted">
          Move type
          <select value={moveType} onChange={(e) => setMoveType(e.target.value)}
            className="mt-1 w-full border border-hairline-strong bg-page p-1 text-ink normal-case">
            <option value="">auto (the kitchen picks the move)</option>
            {MOVE_TYPES.map((m) => <option key={m} value={m}>{MOVE_LABEL[m]}</option>)}
          </select>
          {moveType !== '' && (
            <span className="mt-1 block font-mono text-2xs text-muted normal-case">{moveType}</span>
          )}
        </label>
        <label className="block uppercase text-muted">
          {DIRECTION_LABEL}
          <textarea value={steer} onChange={(e) => setSteer(e.target.value)} rows={2}
            className="mt-1 w-full border border-hairline-strong bg-page p-1 text-ink normal-case" />
        </label>
        <button type="button" disabled={!canPropose} onClick={() => propose(moveType)}
          className="w-full px-3 py-2 uppercase font-medium enabled:bg-accent enabled:text-on-accent disabled:bg-surface disabled:text-muted">
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
          <summary className="cursor-pointer uppercase">
            auto-applied: {MOVE_LABEL[entry.moveType as keyof typeof MOVE_LABEL] ?? entry.moveType}{' '}
            <span className="font-mono normal-case opacity-60">{entry.moveType}</span>
          </summary>
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
