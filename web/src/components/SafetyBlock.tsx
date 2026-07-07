import { useState } from 'react'

// SafetyBlock renders the blocked state: the safety gate's reason and rule
// id, with only the regenerate/redirect affordances (spec §4: nothing else
// is allowed while blocked).
export default function SafetyBlock({ reason, ruleId, onRegenerate, onRedirect }: {
  reason: string
  ruleId: string
  onRegenerate: () => void
  onRedirect: (steer: string) => void
}) {
  const [steer, setSteer] = useState('')
  return (
    <div data-testid="safety-block" role="alert"
      className="border-2 border-gray-600 bg-gray-200 rounded p-3 space-y-2">
      <div className="text-sm font-semibold text-gray-900">Safety gate blocked this move</div>
      <p className="text-sm text-gray-800">{reason}</p>
      <div className="text-xs text-gray-600">rule: <span className="font-mono">{ruleId}</span></div>
      <div className="flex flex-wrap items-end gap-2">
        <button type="button" onClick={onRegenerate}
          className="px-3 py-1 text-sm rounded bg-gray-800 text-white">Regenerate</button>
        <label className="flex-1 min-w-48 text-xs text-gray-600">
          Redirect steer
          <textarea value={steer} onChange={(e) => setSteer(e.target.value)} rows={2}
            className="mt-1 w-full border border-gray-300 rounded p-1 text-sm text-gray-900" />
        </label>
        <button type="button" disabled={steer.trim() === ''} onClick={() => onRedirect(steer.trim())}
          className="px-3 py-1 text-sm rounded bg-gray-800 text-white disabled:opacity-40">Redirect</button>
      </div>
    </div>
  )
}
