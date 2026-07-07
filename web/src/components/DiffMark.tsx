import type { ReactNode } from 'react'
import { SR_ADDED, SR_NOW, SR_REMOVED, SR_WAS } from '../vocab'

// DiffMark is one inline change on the canvas: the visual channel is the
// house strike/tint pair; the aural channel is <del>/<ins> with sr-only
// was/now/added/removed prefixes (screen readers don't announce the
// elements themselves), grouped under a cook-vocabulary label so a diff
// line reads as "Ingredients — changed, was: 2 sprig, now: 3 sprig".
export function DiffMark({ kind, from, to, label }: {
  kind: 'add' | 'replace' | 'remove'
  from?: ReactNode
  to?: ReactNode
  label: string
}) {
  return (
    <span role="group" aria-label={label} className="inline-flex flex-wrap items-baseline gap-1">
      {kind !== 'add' && (
        <del className="line-through text-muted no-underline">
          <span className="sr-only">{kind === 'remove' ? SR_REMOVED : SR_WAS}</span>
          {from}
        </del>
      )}
      {kind === 'replace' && <span aria-hidden="true" className="text-muted">→</span>}
      {kind !== 'remove' && (
        <ins className="px-1 bg-success-surface text-ink no-underline">
          <span className="sr-only">{kind === 'add' ? SR_ADDED : SR_NOW}</span>
          {to}
        </ins>
      )}
    </span>
  )
}
