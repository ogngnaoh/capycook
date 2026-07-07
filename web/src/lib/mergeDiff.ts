import type { Draft, FlavorClaim, Ingredient, Op, Step } from '../types'
import { list } from '../types'
import { opLineLabel } from './pathLabels'

// mergeDiff builds the proposal-as-recipe view model: the union of the
// current and would-be drafts, so the canvas can render the post-move
// recipe with removed rows still visible in place (struck), added rows
// inserted live, and changed rows carrying their old value. RFC-6902
// indices refer to the live array state mid-application, so removed rows
// stay in the row list as tombstones the live index skips over.
export type RowKind = 'same' | 'added' | 'removed' | 'changed'

export interface Row<T> {
  kind: RowKind
  value: T // the post-move value; for removed rows, the old value
  old?: T // present on changed rows
}

export interface ScalarDiff {
  kind: 'same' | 'changed'
  value: string
  old?: string
}

export interface OtherChange {
  label: string // cook-vocabulary line label, e.g. "Station card — changed"
  op: Op
}

export interface DiffView {
  title: ScalarDiff
  concept: ScalarDiff
  ingredients: Row<Ingredient>[]
  steps: Row<Step>[]
  flavorRationale: Row<FlavorClaim>[]
  other: OtherChange[]
  failed: Op[]
}

const ARRAY_SECTIONS = ['ingredients', 'steps', 'flavor_rationale'] as const
type ArraySection = (typeof ARRAY_SECTIONS)[number]

export function mergeDiff(base: Draft, ops: Op[]): DiffView {
  const scalars: Record<'title' | 'concept', ScalarDiff> = {
    title: { kind: 'same', value: base.title },
    concept: { kind: 'same', value: base.concept },
  }
  const rows: Record<ArraySection, Row<unknown>[]> = {
    ingredients: list(base.ingredients).map((v) => ({ kind: 'same' as const, value: structuredClone(v) })),
    steps: list(base.steps).map((v) => ({ kind: 'same' as const, value: structuredClone(v) })),
    flavor_rationale: list(base.flavor_rationale).map((v) => ({ kind: 'same' as const, value: structuredClone(v) })),
  }
  const other: OtherChange[] = []
  const failed: Op[] = []

  for (const op of ops) {
    const [head, index, ...fields] = op.path.split('/').slice(1)
    if ((head === 'title' || head === 'concept') && index === undefined) {
      if (op.op !== 'replace') { failed.push(op); continue }
      const s = scalars[head]
      scalars[head] = { kind: 'changed', value: String(op.value), old: s.kind === 'changed' ? s.old : s.value }
      continue
    }
    if ((ARRAY_SECTIONS as readonly string[]).includes(head) && index !== undefined) {
      if (applyRowOp(rows[head as ArraySection], op, index, fields)) continue
      failed.push(op)
      continue
    }
    other.push({ label: opLineLabel(op), op })
  }

  return {
    title: scalars.title,
    concept: scalars.concept,
    ingredients: rows.ingredients as Row<Ingredient>[],
    steps: rows.steps as Row<Step>[],
    flavorRationale: rows.flavor_rationale as Row<FlavorClaim>[],
    other,
    failed,
  }
}

// applyRowOp applies one op against the live view of a row list (removed
// rows are invisible to RFC indices). Returns false when the op does not
// resolve.
function applyRowOp(cells: Row<unknown>[], op: Op, index: string, fields: string[]): boolean {
  const live = cells.filter((c) => c.kind !== 'removed')
  const at = index === '-' ? live.length : /^(0|[1-9]\d*)$/.test(index) ? Number(index) : NaN
  if (Number.isNaN(at)) return false

  if (op.op === 'add' && fields.length === 0) {
    if (at > live.length) return false
    if (at === live.length) {
      cells.push({ kind: 'added', value: op.value })
    } else {
      cells.splice(cells.indexOf(live[at]), 0, { kind: 'added', value: op.value })
    }
    return true
  }

  if (at >= live.length) return false
  const cell = live[at]

  if (op.op === 'remove' && fields.length === 0) {
    if (cell.kind === 'added') cells.splice(cells.indexOf(cell), 1)
    else {
      cell.kind = 'removed'
      if (cell.old !== undefined) { cell.value = cell.old; delete cell.old }
    }
    return true
  }

  if (op.op === 'replace') {
    const before = structuredClone(cell.value)
    if (fields.length === 0) {
      cell.value = op.value
    } else {
      let node: unknown = cell.value
      for (const f of fields.slice(0, -1)) {
        if (typeof node !== 'object' || node === null) return false
        node = (node as Record<string, unknown>)[f]
      }
      const last = fields[fields.length - 1]
      if (typeof node !== 'object' || node === null || !(last in (node as object))) return false
      ;(node as Record<string, unknown>)[last] = op.value
    }
    if (cell.kind === 'same') { cell.kind = 'changed'; cell.old = before }
    return true
  }

  return false
}
