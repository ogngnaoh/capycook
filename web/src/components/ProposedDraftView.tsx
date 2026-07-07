import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Draft, Ingredient, Proposal, Step } from '../types'
import { mergeDiff, type Row } from '../lib/mergeDiff'
import { MOVE_LABEL } from '../vocab'
import { DiffMark } from './DiffMark'
import { formatQty } from './DraftPane'
import ProposalCard, { formatValue } from './ProposalCard'

// Persisted preference: once a power user flips Technical view on, raw
// ops/confidence/provenance return at full density on every proposal.
export const TECH_VIEW_KEY = 'capycook-technical-view'

// ProposedDraftView is the decision surface at the pass: the would-be
// recipe rendered on the canvas with inline change marks — removed rows
// struck in place, added rows inserted, changed values as was/now pairs —
// under a plain-language header (move intent + rationale). The wire-level
// proposal (RFC-6902 ops, confidence, provenance, unverified flags) lives
// one disclosure away behind the persisted Technical view toggle.
export default function ProposedDraftView({ base, proposal, children }: {
  base: Draft
  proposal: Proposal
  children?: ReactNode
}) {
  const [techView, setTechView] = useState(() => localStorage.getItem(TECH_VIEW_KEY) === '1')
  const view = mergeDiff(base, proposal.change ?? [])

  function toggleTech() {
    setTechView((on) => {
      localStorage.setItem(TECH_VIEW_KEY, on ? '0' : '1')
      return !on
    })
  }

  return (
    <section data-testid="proposed-draft" className="flex-1 min-w-0 p-3 space-y-3">
      <div className="flex items-baseline gap-2 flex-wrap">
        <h2 className="uppercase text-muted">Proposal</h2>
        <span className="text-ink">{MOVE_LABEL[proposal.move_type as keyof typeof MOVE_LABEL] ?? proposal.move_type}</span>
        <span className="font-mono text-2xs text-muted">{proposal.move_type}</span>
        <button type="button" aria-pressed={techView} onClick={toggleTech}
          className={`ml-auto px-2 py-1 uppercase border transition ${techView
            ? 'border-hairline-strong bg-surface text-ink'
            : 'border-hairline bg-transparent text-ink hover:bg-ink hover:text-page'}`}>
          Technical view
        </button>
      </div>
      {proposal.rationale && <p className="text-muted">{proposal.rationale}</p>}

      <div className="p-3 border border-hairline bg-page space-y-3">
        <div>
          {view.title.kind === 'changed' ? (
            <DiffMark kind="replace" from={view.title.old} to={view.title.value} label="Title — changed" />
          ) : (
            <span className="font-medium text-sm">{view.title.value}</span>
          )}
          {view.concept.kind === 'changed' ? (
            <p><DiffMark kind="replace" from={view.concept.old} to={view.concept.value} label="Concept — changed" /></p>
          ) : (
            view.concept.value && <p className="text-muted">{view.concept.value}</p>
          )}
        </div>

        {view.ingredients.length > 0 && (
          <div>
            <h3 className="uppercase text-muted">Ingredients</h3>
            <ul className="mt-1 border-t border-hairline">
              {view.ingredients.map((row, i) => (
                <li key={i} className="py-1 border-b border-hairline">
                  <IngredientRow row={row} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {view.steps.length > 0 && (
          <div>
            <h3 className="uppercase text-muted">Method</h3>
            <ol className="mt-1 border-t border-hairline">
              {view.steps.map((row, i) => (
                <li key={i} className="py-1 border-b border-hairline">
                  <span className="font-mono text-2xs text-muted mr-1">{i + 1}.</span>
                  <StepRow row={row} />
                </li>
              ))}
            </ol>
          </div>
        )}

        {view.flavorRationale.some((r) => r.kind !== 'same') && (
          <div>
            <h3 className="uppercase text-muted">Chef's notes</h3>
            <ul className="mt-1">
              {view.flavorRationale.map((row, i) => (
                <li key={i} className="py-1">
                  {row.kind === 'same'
                    ? <span className="text-muted">{row.value.claim}</span>
                    : <DiffMark kind={markKind(row.kind)} from={row.old?.claim ?? row.value.claim}
                        to={row.value.claim} label={`Chef's notes — ${happened(row.kind)}`} />}
                </li>
              ))}
            </ul>
          </div>
        )}

        {view.other.length > 0 && (
          <div>
            <h3 className="uppercase text-muted">Also changes</h3>
            <ul className="mt-1">
              {view.other.map(({ label, op }, i) => (
                <li key={i} className="py-1">
                  <DiffMark kind={op.op === 'add' ? 'add' : op.op === 'remove' ? 'remove' : 'replace'}
                    from={op.from !== undefined ? formatValue(op.from) : undefined}
                    to={op.value !== undefined ? formatValue(op.value) : undefined}
                    label={label} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {techView && <ProposalCard proposal={proposal} />}
      {children}
    </section>
  )
}

function markKind(kind: 'added' | 'removed' | 'changed'): 'add' | 'remove' | 'replace' {
  return kind === 'added' ? 'add' : kind === 'removed' ? 'remove' : 'replace'
}

function happened(kind: 'added' | 'removed' | 'changed'): string {
  return kind
}

// IngredientRow renders one merged ingredient line: quantity in the house
// mono form, then the name — the whole line struck when removed, inserted
// when added, was/now when changed. Provenance ids stay behind Technical
// view at the pass (brief call #2).
function IngredientRow({ row }: { row: Row<Ingredient> }) {
  const line = (v: Ingredient) => `${formatQty(v.qty, v.unit)} ${v.name}`
  if (row.kind === 'same') {
    return (
      <span className="flex items-baseline gap-1">
        <span className="font-mono text-2xs text-muted">{formatQty(row.value.qty, row.value.unit)}</span>
        <span className="text-ink">{row.value.name}</span>
      </span>
    )
  }
  return (
    <DiffMark kind={markKind(row.kind)}
      from={row.kind === 'added' ? undefined : line(row.old ?? row.value)}
      to={row.kind === 'removed' ? undefined : line(row.value)}
      label={`Ingredients — ${happened(row.kind)}`} />
  )
}

function StepRow({ row }: { row: Row<Step> }) {
  if (row.kind === 'same') return <span className="text-ink">{row.value.text}</span>
  return (
    <DiffMark kind={markKind(row.kind)}
      from={row.kind === 'added' ? undefined : (row.old ?? row.value).text}
      to={row.kind === 'removed' ? undefined : row.value.text}
      label={`Method — ${happened(row.kind)}`} />
  )
}
