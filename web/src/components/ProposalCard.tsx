import type { Op, Proposal } from '../types'
import { list } from '../types'

// formatValue renders an op operand: strings verbatim, everything else as
// compact JSON.
function formatValue(v: unknown): string {
  if (typeof v === 'string') return v
  return v === undefined ? '' : JSON.stringify(v)
}

// DiffLine renders one RFC-6902 op as an inline per-field diff: the old
// value struck-through, the new value highlighted. ComputeDiff fills `from`
// only on replace; removes are path-only.
function DiffLine({ op }: { op: Op }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="text-xs text-gray-500 font-mono">{op.path}</span>
      <span className="text-xs uppercase text-gray-400">{op.op}</span>
      {op.from !== undefined && (
        <span className="line-through text-gray-500">{formatValue(op.from)}</span>
      )}
      {op.op !== 'remove' && (
        <span className="bg-green-100 text-green-900 px-1 rounded">{formatValue(op.value)}</span>
      )}
      {op.op === 'remove' && op.from === undefined && (
        <span className="line-through text-gray-500">(removed)</span>
      )}
    </div>
  )
}

// ProposalCard renders one pending proposal: the per-field diff, rationale,
// citations, confidence, and [unverified] flags. With onSelect it acts as
// one card of the alternatives picker.
export default function ProposalCard({ proposal, selected, onSelect }: {
  proposal: Proposal
  selected?: boolean
  onSelect?: () => void
}) {
  return (
    <div data-testid="proposal-card" onClick={onSelect}
      className={`border rounded p-3 space-y-2 bg-white ${selected ? 'border-gray-800 ring-1 ring-gray-800' : 'border-gray-300'} ${onSelect ? 'cursor-pointer' : ''}`}>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="font-mono">{proposal.move_type}</span>
        {onSelect && <span>{selected ? 'selected' : 'click to select'}</span>}
      </div>
      <div className="font-mono text-sm space-y-1">
        {list(proposal.change).map((op, i) => <DiffLine key={i} op={op} />)}
      </div>
      <p className="text-sm text-gray-700">{proposal.rationale}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        {list(proposal.citations).map((c, i) => (
          <span key={i} className="px-2 py-0.5 bg-gray-200 rounded">{c.source} #{c.ref}</span>
        ))}
        <span className="px-2 py-0.5 bg-gray-200 rounded">conf {Math.round(proposal.confidence * 100)}%</span>
        {list(proposal.unverified).map((u, i) => (
          <span key={i} className="px-2 py-0.5 bg-yellow-200 rounded">[unverified] {u}</span>
        ))}
      </div>
    </div>
  )
}
