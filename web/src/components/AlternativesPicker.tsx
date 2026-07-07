import { useRef } from 'react'
import type { ReactNode } from 'react'
import type { Draft, Proposal } from '../types'
import { deltaSummary } from '../lib/deltaSummary'
import { ALTERNATIVES_HEADER } from '../vocab'
import ProposedDraftView from './ProposedDraftView'

// AlternativesPicker is one control wearing two hats (brief call #6):
// semantically an APG radio group — roving tabindex, arrows move AND
// check, aria-checked — visually the comparison switcher: one row per
// alternative stating what differs (ops-derived), with the selected
// alternative rendered below as the would-be recipe diff. The unselected
// alternative's full diff is one arrow-key away, not stacked.
export default function AlternativesPicker({ base, proposals, selectedId, onSelect, children }: {
  base: Draft
  proposals: Proposal[]
  selectedId: string | undefined
  onSelect: (id: string) => void
  children?: ReactNode
}) {
  const rowRefs = useRef<(HTMLDivElement | null)[]>([])
  const selected = proposals.find((p) => p.id === selectedId) ?? proposals[0]

  function moveTo(index: number) {
    const wrapped = (index + proposals.length) % proposals.length
    onSelect(proposals[wrapped].id)
    rowRefs.current[wrapped]?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); moveTo(index + 1) }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); moveTo(index - 1) }
  }

  return (
    <div className="flex-1 min-w-0 p-3 space-y-2">
      {/* h2 (not h3) so the alternatives view nests under the dish h1 without a
          skipped level; the nested ProposedDraftView 'Proposal' is a sibling h2. */}
      <h2 id="proposal-heading" tabIndex={-1} className="uppercase text-muted">{ALTERNATIVES_HEADER}</h2>
      <div role="radiogroup" aria-labelledby="proposal-heading"
        className="border border-hairline divide-y divide-hairline bg-page">
        {proposals.map((p, i) => {
          const checked = p.id === selected?.id
          return (
            <div key={p.id} ref={(el) => { rowRefs.current[i] = el }}
              role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1}
              onClick={() => onSelect(p.id)} onKeyDown={(e) => onKeyDown(e, i)}
              className={`flex items-baseline gap-2 px-2 py-1 min-h-[24px] cursor-pointer ${
                checked ? 'border-l-2 border-accent bg-surface' : 'border-l-2 border-transparent'}`}>
              <span className="uppercase font-medium shrink-0">{String.fromCharCode(65 + i)}:</span>
              <span className="text-ink">{deltaSummary(p.change ?? [], base)}</span>
              <span className="ml-auto font-mono text-2xs text-muted normal-case shrink-0">{p.id}</span>
            </div>
          )
        })}
      </div>
      {selected && (
        <ProposedDraftView base={base} proposal={selected}>
          {children}
        </ProposedDraftView>
      )}
    </div>
  )
}
