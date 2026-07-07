import type { Op, Proposal } from '../types'
import { list } from '../types'
import { Chip, CitationChip, ConfidenceChip, UnverifiedChip } from './Chips'

// formatValue renders an op operand readably: strings verbatim, objects as
// compact `key: value` pairs (· separated, null/absent fields skipped),
// arrays as comma-separated items — never a raw JSON wall. Nested values
// wrap in ()/[] so one line stays parseable by eye.
export function formatValue(v: unknown, nested = false): string {
  if (v === undefined) return ''
  if (typeof v === 'string') return v
  if (v === null) return 'null'
  if (typeof v !== 'object') return String(v)
  if (Array.isArray(v)) {
    const items = v.map((x) => formatValue(x, true)).join(', ')
    return nested ? `[${items}]` : items
  }
  const pairs = Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== null && x !== undefined)
    .map(([k, x]) => `${k}: ${formatValue(x, true)}`)
    .join(' · ')
  return nested ? `(${pairs})` : pairs
}

const OP_VARIANT: Record<Op['op'], 'success' | 'critical' | 'info'> = {
  add: 'success', remove: 'critical', replace: 'info',
}

// DiffLine renders one RFC-6902 op as a reviewed change: the field path as
// an uppercase label with a tiny op badge, then old value struck-through in
// warm muted → new value on the flat success tint, in 11px mono.
// ComputeDiff fills `from` only on replace; removes are path-only.
function DiffLine({ op }: { op: Op }) {
  return (
    <div className="py-1 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="uppercase text-muted">{op.path}</span>
        <Chip variant={OP_VARIANT[op.op]}>{op.op.toUpperCase()}</Chip>
      </div>
      {(op.op !== 'remove' || op.from !== undefined) && (
        <div className="flex flex-wrap items-baseline gap-2 font-mono text-2xs">
          {op.from !== undefined && (
            <span className="line-through text-muted">{formatValue(op.from)}</span>
          )}
          {op.op === 'replace' && <span aria-hidden="true" className="text-muted">→</span>}
          {op.op !== 'remove' && (
            <span className="px-1 bg-success-surface text-ink">{formatValue(op.value)}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ProposalCard renders one proposal at wire density: the per-op diff,
// rationale, and the provenance chip row (citations, confidence,
// [unverified] flags). Since the canvas took over the decision surface
// (ProposedDraftView), this card lives behind the Technical view toggle.
export default function ProposalCard({ proposal }: {
  proposal: Proposal
}) {
  return (
    <div data-testid="proposal-card"
      className="border p-3 space-y-2 bg-page border-hairline">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-2xs text-muted">{proposal.move_type}</span>
      </div>
      <div className="divide-y divide-hairline">
        {list(proposal.change).map((op, i) => <DiffLine key={i} op={op} />)}
      </div>
      <p className="text-ink">{proposal.rationale}</p>
      <div className="flex flex-wrap gap-1">
        {list(proposal.citations).map((c, i) => <CitationChip key={i} citation={c} />)}
        <ConfidenceChip confidence={proposal.confidence} />
        {list(proposal.unverified).map((u, i) => <UnverifiedChip key={i} label={u} />)}
      </div>
    </div>
  )
}
