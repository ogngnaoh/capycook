import { useEffect, useRef } from 'react'
import type { Op } from '../types'
import { list } from '../types'
import { opLineLabel } from '../lib/pathLabels'
import { CORRECTIVE_ACTION, SAFETY_HOLD_TITLE } from '../vocab'
import { formatValue } from './ProposalCard'

// SafetyBlock is the hold pane: the critical alert plus the evidence —
// the held change's ops, grayed beneath the rule, so the chef sees WHAT
// was stopped, not just that something was. Display only: the gate bar
// beneath offers the only verbs allowed while blocked (spec §4). Takes
// focus on mount (focus protocol: hold → the alert block).
export default function SafetyBlock({ reason, ruleId, ops }: {
  reason: string
  ruleId: string
  ops?: Op[] | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const held = list(ops)
  const anchor = findAnchor(held, ruleId)
  return (
    <div ref={ref} tabIndex={-1} data-testid="safety-block" role="alert"
      className="border border-critical bg-critical-surface p-2 space-y-1">
      <div className="uppercase font-medium text-critical">{SAFETY_HOLD_TITLE}</div>
      <p className="text-ink">{reason}</p>
      <div className="text-2xs text-muted">rule: <span className="font-mono">{ruleId}</span></div>
      {held.length > 0 && (
        <ul data-testid="blocked-evidence"
          className="border-t border-critical/40 pt-1 opacity-60">
          {held.map((op, i) => (
            <li key={i} className="py-1">
              <span className="uppercase text-2xs text-muted">{opLineLabel(op)}</span>{' '}
              <span className="text-ink">{formatValue(op.value ?? op.from)}</span>
              {i === anchor && (
                <span data-testid="rule-anchor"
                  className="ml-1 px-1 font-mono text-2xs normal-case border border-critical text-critical">
                  rule: {ruleId}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="pt-1 text-2xs text-ink">
        <span className="uppercase font-medium">{CORRECTIVE_ACTION} →</span>{' '}
        regenerate for a new attempt, or ask for changes with a safer direction.
      </div>
    </div>
  )
}

// findAnchor picks the line the rule most plausibly fired on: the op whose
// rendered content shares the most tokens with the rule id. The wire
// carries no per-rule op pointer (pinned contract), so this is honest
// client-side inference — no match anchors nothing.
function findAnchor(ops: Op[], ruleId: string): number {
  const tokens = ruleId.toLowerCase().split(/[-_]/).filter((t) => t.length > 2)
  let best = -1
  let bestScore = 0
  ops.forEach((op, i) => {
    const hay = `${op.path} ${formatValue(op.value ?? op.from)}`.toLowerCase()
    const score = tokens.filter((t) => hay.includes(t)).length
    if (score > bestScore) { best = i; bestScore = score }
  })
  return best
}
