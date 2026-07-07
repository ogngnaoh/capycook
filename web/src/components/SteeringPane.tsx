import { useState } from 'react'
import { MOVE_TYPES } from '../types'

// ThreadEntry is one row of the steering thread: the cook's steer turns,
// the model's streamed rationale tokens, collapsed auto-applied
// (move_auto_advanced) entries, and one-line info notes.
export type ThreadEntry =
  | { kind: 'steer'; text: string }
  | { kind: 'tokens'; moveId: string; text: string; done: boolean }
  | { kind: 'auto'; moveType: string; versionId: string }
  | { kind: 'info'; text: string }

// SteeringPane is the right-hand column: the thread plus move initiation
// (move-type select, optional steer, suggested_next chips).
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
      className="w-96 shrink-0 border-l border-gray-300 p-4 flex flex-col gap-3 overflow-y-auto">
      <h2 className="text-xs uppercase tracking-wide text-gray-500">Steering</h2>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {thread.length === 0 && <p className="text-sm text-gray-400">No moves yet.</p>}
        {thread.map((e, i) => <ThreadItem key={i} entry={e} />)}
      </div>

      <div className="space-y-2 border-t border-gray-300 pt-3">
        {suggestedNext.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {suggestedNext.map((s) => (
              <button key={s} type="button" disabled={!canPropose} onClick={() => propose(s)}
                className="px-2 py-0.5 text-xs bg-gray-200 rounded-full disabled:opacity-40">{s}</button>
            ))}
          </div>
        )}
        <label className="block text-xs text-gray-600">
          Move type
          <select value={moveType} onChange={(e) => setMoveType(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded p-1 text-sm bg-white text-gray-900">
            <option value="">auto (expand seed / iterate)</option>
            {MOVE_TYPES.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="block text-xs text-gray-600">
          Steer (optional)
          <textarea value={steer} onChange={(e) => setSteer(e.target.value)} rows={2}
            className="mt-1 w-full border border-gray-300 rounded p-1 text-sm text-gray-900" />
        </label>
        <button type="button" disabled={!canPropose} onClick={() => propose(moveType)}
          className="w-full px-3 py-1.5 text-sm rounded bg-gray-800 text-white disabled:opacity-40">
          Propose a move
        </button>
        {!canPropose && (
          <p className="text-xs text-gray-400">Resolve the current move before proposing another.</p>
        )}
      </div>
    </section>
  )
}

function ThreadItem({ entry }: { entry: ThreadEntry }) {
  switch (entry.kind) {
    case 'steer':
      return (
        <div className="p-2 bg-gray-200 rounded text-sm text-gray-900">
          <span className="block text-xs text-gray-500">you</span>
          {entry.text}
        </div>
      )
    case 'tokens':
      return (
        <div className="p-2 bg-white border border-gray-200 rounded text-sm text-gray-900">
          <span className="block text-xs text-gray-500">model</span>
          {entry.text}
          {!entry.done && <span className="text-gray-400">▋</span>}
        </div>
      )
    case 'auto':
      return (
        <details data-testid="auto-advanced"
          className="p-2 bg-white border border-dashed border-gray-300 rounded text-xs text-gray-600">
          <summary className="cursor-pointer">auto-applied: {entry.moveType}</summary>
          <div className="mt-1">
            Deterministic move applied by the autonomy dial → version{' '}
            <span className="font-mono">{entry.versionId}</span>
          </div>
        </details>
      )
    case 'info':
      return <div className="text-xs text-gray-500 italic">{entry.text}</div>
  }
}
