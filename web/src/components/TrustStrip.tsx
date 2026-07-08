import type { Draft } from '../types'
import { list } from '../types'

// TrustStrip is the "How sure —" line above the dish card (redesign design
// lines 190-196): two fixed provenance facts (nutrition is always
// USDA-verified, cost is always approximate — the deterministic services
// never claim otherwise) plus a live count of flavor claims the
// deterministic layer could not ground, hidden entirely when there is
// nothing to disclose.
export function TrustStrip({ draft }: { draft: Draft }) {
  const unverifiedCount = list(draft.flavor_rationale).filter((c) => c.provenance === null).length

  return (
    <div className="flex items-center gap-[18px] flex-wrap border-b border-hairline pb-[14px] mb-4">
      <span className="text-2xs uppercase tracking-[0.12em] text-faint">How sure —</span>
      <span data-testid="trust-nutrition" className="inline-flex items-center gap-[7px]">
        <span aria-hidden="true" className="w-[8px] h-[8px] rounded-[50%] bg-success" />
        Nutrition <strong className="font-bold">USDA-verified</strong>
      </span>
      <span data-testid="trust-cost" className="inline-flex items-center gap-[7px]">
        <span aria-hidden="true" className="w-[8px] h-[8px] rounded-[50%] bg-warning" />
        Cost <strong className="font-bold">approximate</strong>
      </span>
      {unverifiedCount > 0 && (
        <span data-testid="trust-flavor" className="inline-flex items-center gap-[7px]">
          <span aria-hidden="true" className="w-[8px] h-[8px] rounded-[50%] border-[1.5px] border-muted" />
          {unverifiedCount} flavor claim{unverifiedCount === 1 ? '' : 's'} <strong className="font-bold">unverified</strong>
        </span>
      )}
    </div>
  )
}
