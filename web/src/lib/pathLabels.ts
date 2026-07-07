import type { Op } from '../types'

// pathLabels translates RFC-6901 pointers into the recipe card's own
// section names, so a diff line reads "Ingredients — changed" instead of
// "/INGREDIENTS/2/QTY REPLACE". Raw pointers survive only in Technical view.
const SECTION: Record<string, string> = {
  title: 'Title',
  concept: 'Concept',
  ingredients: 'Ingredients',
  steps: 'Method',
  flavor_rationale: "Chef's notes",
  constraints: 'Station card',
  analysis: 'Analysis',
}

export function sectionLabel(path: string): string {
  const head = path.split('/')[1] ?? ''
  const known = SECTION[head]
  if (known) return known
  // Readable fallback for fields this map doesn't know yet.
  const words = head.replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

const HAPPENED: Record<Op['op'], string> = {
  add: 'added',
  replace: 'changed',
  remove: 'removed',
}

export function opLineLabel(op: Op): string {
  return `${sectionLabel(op.path)} — ${HAPPENED[op.op]}`
}
