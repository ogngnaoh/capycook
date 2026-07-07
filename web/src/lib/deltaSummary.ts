import type { Draft, Ingredient, Op } from '../types'
import { sectionLabel } from './pathLabels'

const MAX_SEGMENTS = 3

// deltaSummary compresses a change set into the one-line phrase the trial
// pills and the alternatives comparison header speak: named ingredient and
// title moves are itemized ("+ lemon · − thyme"), everything else groups by
// recipe section ("Method — 2 changes"). Base-draft indices resolve names
// for ops that only carry a pointer; it's a heuristic headline, not a diff.
export function deltaSummary(ops: Op[], base?: Draft): string {
  if (ops.length === 0) return 'no changes'
  const named: string[] = []
  const grouped = new Map<string, number>()
  for (const op of ops) {
    const segment = nameOp(op, base)
    if (segment) named.push(segment)
    else {
      const section = sectionLabel(op.path)
      grouped.set(section, (grouped.get(section) ?? 0) + 1)
    }
  }
  const segments = [
    ...named,
    ...[...grouped].map(([s, n]) => `${s} — ${n} ${n === 1 ? 'change' : 'changes'}`),
  ]
  if (segments.length > MAX_SEGMENTS) {
    return [...segments.slice(0, MAX_SEGMENTS), `+${segments.length - MAX_SEGMENTS} more`].join(' · ')
  }
  return segments.join(' · ')
}

function nameOp(op: Op, base?: Draft): string | null {
  const [head, index, ...rest] = op.path.split('/').slice(1)
  if (head === 'title' && op.op === 'replace') return `retitled "${String(op.value)}"`
  if (head !== 'ingredients' || index === undefined) return null
  if (op.op === 'add') {
    const name = (op.value as Partial<Ingredient> | undefined)?.name
    return name ? `+ ${name}` : null
  }
  const baseName = base?.ingredients?.[Number(index)]?.name
  if (op.op === 'remove') return baseName ? `− ${baseName}` : null
  const valueName = rest.length === 0
    ? (op.value as Partial<Ingredient> | undefined)?.name
    : undefined
  const name = baseName ?? valueName
  return name ? `${name} changed` : null
}
