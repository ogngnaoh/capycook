// formatValue renders an op operand readably: strings verbatim, objects as
// compact `key: value` pairs (· separated, null/absent fields skipped),
// arrays as comma-separated items — never a raw JSON wall. Nested values
// wrap in ()/[] so one line stays parseable by eye. Re-homed from the
// retired proposal-card component (deleted in task 9) so DishCard's technical
// ops block — its one remaining caller — keeps working.
export function formatValue(v: unknown, nested = false): string {
  if (v === undefined) return ''
  if (typeof v === 'string') return v
  if (v === null) return 'null'
  if (typeof v !== 'object') return String(v)
  if (Array.isArray(v)) {
    const items = v.map((x) => formatValue(x, true)).join(', ')
    return nested ? `[${items}]` : items
  }
  const pairs = Object.entries(v as Record<string, unknown>)
    .filter(([, x]) => x !== null && x !== undefined)
    .map(([k, x]) => `${k}: ${formatValue(x, true)}`)
    .join(' · ')
  return nested ? `(${pairs})` : pairs
}
