import type { Proposal } from '../types'

export default function ProposalCard({ proposal }: { proposal: Proposal }) {
  return (
    <div className="border border-gray-300 rounded p-3 space-y-2 bg-white">
      <div className="font-mono text-sm">
        {proposal.diff.map((d, i) => (
          <div key={i} className="text-green-700">+ {d.path}: {d.value}</div>
        ))}
      </div>
      <p className="text-sm text-gray-700">{proposal.rationale}</p>
      <div className="flex flex-wrap gap-2 text-xs">
        {proposal.citations.map((c, i) => (
          <span key={i} className="px-2 py-0.5 bg-gray-200 rounded">{c.source} #{c.ref}</span>
        ))}
        <span className="px-2 py-0.5 bg-gray-200 rounded">conf {Math.round(proposal.confidence * 100)}%</span>
        {proposal.unverified.map((u, i) => (
          <span key={i} className="px-2 py-0.5 bg-yellow-200 rounded">[unverified] {u}</span>
        ))}
      </div>
    </div>
  )
}
