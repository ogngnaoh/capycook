import type { Proposal } from '../types'
import { list } from '../types'

// ProposalHeader is the plain-language banner above a single pending
// proposal (design 262-278): the fixed headline, the rationale, and the
// citation trail. Confidence renders in Technical view only and is
// informational — it never gates accept/edit/regenerate/etc. `unverified`
// claims get their field home here as a muted disclosure line.
export default function ProposalHeader({ proposal, streaming, technical }: {
  proposal: Proposal
  streaming: boolean
  technical: boolean
}) {
  const citations = list(proposal.citations)
  const unverified = list(proposal.unverified)
  return (
    <div data-testid="proposal-header" className="cc-rise mb-[18px]">
      <div className="flex items-baseline gap-[10px] flex-wrap">
        <h2 className="text-[22px] font-bold tracking-[-0.01em] m-0">Here's the change I'd make</h2>
        {technical && (
          <span className="font-mono text-2xs text-faint">
            {proposal.move_type} · conf {Math.round(proposal.confidence * 100)}%
          </span>
        )}
      </div>
      {proposal.rationale && (
        <p className="mt-[10px] text-[15px] leading-[1.65] text-ink max-w-[64ch]">
          {proposal.rationale}
          {streaming && (
            <span aria-hidden="true" data-testid="proposal-header-caret"
              className="inline-block w-2 h-[17px] bg-accent align-[-2px] ml-[2px] animate-[cc-blink_1s_step-start_infinite]" />
          )}
        </p>
      )}
      {citations.length > 0 && (
        <div className="mt-[10px] flex flex-wrap gap-2">
          {citations.map((c, i) => (
            <span key={i} className="text-2xs text-muted border border-hairline px-[8px] py-[4px]">
              {c.source} · {c.ref}
            </span>
          ))}
        </div>
      )}
      {unverified.length > 0 && (
        <p className="mt-2 text-2xs text-muted">unverified: {unverified.join(', ')}</p>
      )}
    </div>
  )
}
