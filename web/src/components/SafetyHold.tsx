import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Op } from '../types'
import { list } from '../types'
import { opLineLabel } from '../lib/pathLabels'
import { BLOCKED_REDIRECT, BLOCKED_REGEN } from '../vocab'

// SafetyHold is the redesign's hold pane (design 219-240) — the next
// generation of SafetyBlock, which stays in place untouched until task 9
// swaps it in. The alert now owns the two legal verbs directly (§9: exactly
// two verbs on a hold, never more) instead of leaving them to the gate bar.
// Takes focus on mount (focus protocol: hold -> the alert block, ported
// verbatim from SafetyBlock's own useEffect).
export default function SafetyHold({
  reason, ruleId, ops, technical, onRegenerate, onRedirectSubmit,
}: {
  reason: string
  ruleId: string
  ops?: Op[] | null
  technical: boolean
  onRegenerate: () => void
  onRedirectSubmit: (steer: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const held = list(ops)
  const [redirecting, setRedirecting] = useState(false)
  const [steer, setSteer] = useState('')

  function submitRedirect(e: FormEvent) {
    e.preventDefault()
    if (steer.trim() === '') return
    onRedirectSubmit(steer.trim())
  }

  return (
    <div ref={ref} tabIndex={-1} role="alert" data-testid="safety-hold"
      className="cc-rise border-2 border-critical bg-critical-surface p-[18px] mb-4">
      <span className="text-2xs tracking-[0.12em] uppercase text-critical font-bold">
        Safety hold — this change was stopped
      </span>
      <p className="mt-3 text-[15px] leading-[1.6] text-ink">{reason}</p>
      {held.length > 0 && (
        <div className="mt-[14px] pt-[12px] border-t border-critical">
          <div className="text-2xs tracking-[0.08em] uppercase text-critical mb-2">
            What it would have added
          </div>
          {held.map((op, i) => (
            <div key={i} className="text-sm leading-normal text-muted line-through decoration-critical py-[3px]">
              {opLineLabel(op)}
            </div>
          ))}
        </div>
      )}
      {technical && (
        <div className="mt-[10px] font-mono text-2xs text-critical">rule_id: {ruleId}</div>
      )}
      {!redirecting ? (
        <div className="flex gap-[10px] mt-4 flex-wrap">
          <button type="button" data-verb="regenerate" onClick={onRegenerate}
            className="border border-ink bg-ink text-page uppercase font-medium text-[12px] tracking-[0.06em] px-[18px] min-h-[40px]">
            {BLOCKED_REGEN}
          </button>
          <button type="button" data-verb="redirect" onClick={() => setRedirecting(true)}
            className="border border-hairline-strong bg-panel text-ink uppercase font-medium text-[12px] tracking-[0.06em] px-[18px] min-h-[40px]">
            {BLOCKED_REDIRECT}
          </button>
        </div>
      ) : (
        <form onSubmit={submitRedirect} className="mt-4 space-y-2">
          <label htmlFor="safety-hold-steer" className="block text-2xs tracking-[0.1em] uppercase text-muted">
            Direct the next attempt
          </label>
          <div className="flex gap-[10px] flex-wrap">
            <input id="safety-hold-steer" value={steer} onChange={(e) => setSteer(e.target.value)}
              placeholder="e.g. skip the raw garlic-in-oil step"
              className="flex-1 border border-hairline-strong bg-page text-ink text-[13px] p-[11px] min-h-[40px]" />
            <button type="submit" disabled={steer.trim() === ''}
              className="border border-ink enabled:bg-ink enabled:text-page disabled:bg-surface disabled:text-muted uppercase font-medium text-[12px] tracking-[0.06em] px-[18px] min-h-[40px]">
              Send
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
