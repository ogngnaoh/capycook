import type { Proposal } from '../types'
import ProposalCard from './ProposalCard'

export default function DraftPane({ proposal }: { proposal: Proposal }) {
  return (
    <section data-testid="draft-pane" className="flex-1 p-4 border-r border-gray-300 space-y-3">
      <h2 className="text-xs uppercase tracking-wide text-gray-500">Draft</h2>
      <div className="p-3 bg-white border border-gray-200 rounded text-sm text-gray-400">[dish draft placeholder]</div>
      <ProposalCard proposal={proposal} />
    </section>
  )
}
