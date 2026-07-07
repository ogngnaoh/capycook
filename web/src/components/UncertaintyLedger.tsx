import { useState } from 'react'
import { list } from '../types'
import type { CostAnalysis, NutritionAnalysis } from '../types'

// UncertaintyLedger states the analysis card's uncertainty once, precisely —
// one mono line per analysis card, expandable to the per-item detail. It
// replaces the chip pile (up to 8 stacked [unverified] chips inverted the
// signal — audit finding J): "estimates — nutrition unverified (model claim) ·
// cost approximate, 2 unpriced". Ink text on warning-surface + border-warning
// is the AA-fixed warning variant (brief P7). Copy is local: the ledger owns
// its own strings rather than borrowing vocab.ts.
const LEDGER_LABEL = 'estimates'
const NUTRITION_GLOSS = 'model claim' // the plain-language clause: it is a model claim, not measured

export default function UncertaintyLedger({ cost, nutrition }: {
  cost: CostAnalysis
  nutrition: NutritionAnalysis
}) {
  const [open, setOpen] = useState(false)
  const unverified = list(nutrition.unverified)
  const missing = list(cost.missing)

  const clauses: string[] = []
  if (unverified.length > 0) clauses.push(`nutrition unverified (${NUTRITION_GLOSS})`)
  const costParts: string[] = []
  if (cost.approximate) costParts.push('approximate')
  if (missing.length > 0) costParts.push(`${missing.length} unpriced`)
  if (costParts.length > 0) clauses.push(`cost ${costParts.join(', ')}`)

  if (clauses.length === 0) return null

  const line = `${LEDGER_LABEL} — ${clauses.join(' · ')}`
  const hasDetail = unverified.length > 0 || missing.length > 0

  return (
    <div data-testid="uncertainty-ledger"
      className="border border-warning bg-warning-surface text-ink">
      {hasDetail ? (
        <>
          <button type="button"
            aria-expanded={open}
            aria-controls="uncertainty-detail"
            onClick={() => setOpen((o) => !o)}
            className="w-full text-left px-2 py-1 font-mono text-2xs">
            {line}
            <span className="sr-only"> — activate to list each estimate</span>
          </button>
          <div id="uncertainty-detail" data-testid="uncertainty-detail" hidden={!open}
            className="px-2 pb-1 font-mono text-2xs space-y-0.5">
            {unverified.length > 0 && (
              <div>nutrition unverified: {unverified.join(', ')}</div>
            )}
            {missing.length > 0 && (
              <div>unpriced (excluded): {missing.join(', ')}</div>
            )}
          </div>
        </>
      ) : (
        <div className="px-2 py-1 font-mono text-2xs">{line}</div>
      )}
    </div>
  )
}
