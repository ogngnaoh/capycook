import type { Draft, Op } from '../types'

// applyOps builds the post-move draft a proposal would produce: the
// RFC-6902 add/remove/replace subset the wire speaks, applied client-side
// so the canvas can render the would-be recipe with inline change marks.
// Ops that don't resolve are collected, never thrown — a malformed op must
// not take down the decision surface.
export function applyOps(draft: Draft, ops: Op[]): { draft: Draft; failed: Op[] } {
  const next = structuredClone(draft) as unknown as Record<string, unknown>
  const failed: Op[] = []
  for (const op of ops) {
    if (!applyOne(next, op)) failed.push(op)
  }
  return { draft: next as unknown as Draft, failed }
}

function applyOne(root: Record<string, unknown>, op: Op): boolean {
  const tokens = parsePointer(op.path)
  if (!tokens || tokens.length === 0) return false
  const key = tokens[tokens.length - 1]
  const parent = resolveParent(root, tokens, op.op === 'add')
  if (parent === undefined) return false

  if (Array.isArray(parent)) {
    const index = key === '-' ? parent.length : parseIndex(key)
    if (index === null) return false
    switch (op.op) {
      case 'add':
        if (index > parent.length) return false
        parent.splice(index, 0, op.value)
        return true
      case 'replace':
        if (index >= parent.length) return false
        parent[index] = op.value
        return true
      case 'remove':
        if (index >= parent.length) return false
        parent.splice(index, 1)
        return true
    }
  }
  if (typeof parent === 'object' && parent !== null) {
    const obj = parent as Record<string, unknown>
    switch (op.op) {
      case 'add':
        obj[key] = op.value
        return true
      case 'replace':
        if (!(key in obj)) return false
        obj[key] = op.value
        return true
      case 'remove':
        if (!(key in obj)) return false
        delete obj[key]
        return true
    }
  }
  return false
}

function parsePointer(path: string): string[] | null {
  if (path === '' || !path.startsWith('/')) return null
  return path.slice(1).split('/').map((t) => t.replaceAll('~1', '/').replaceAll('~0', '~'))
}

// resolveParent walks to the container holding the pointer's last token.
// For add, a null container (Go's nil slice/map on the wire) materializes
// as an array when the final token is an index or '-'.
function resolveParent(
  root: Record<string, unknown>, tokens: string[], materialize: boolean,
): unknown {
  let node: unknown = root
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i]
    let child: unknown
    if (Array.isArray(node)) {
      const index = parseIndex(token)
      if (index === null || index >= node.length) return undefined
      child = node[index]
    } else if (typeof node === 'object' && node !== null) {
      child = (node as Record<string, unknown>)[token]
    } else {
      return undefined
    }
    const last = tokens[tokens.length - 1]
    if (child === null && materialize && i === tokens.length - 2
      && (last === '-' || parseIndex(last) !== null)) {
      child = []
      ;(node as Record<string, unknown>)[token] = child
    }
    if (child === undefined || child === null) return undefined
    node = child
  }
  return node
}

function parseIndex(token: string): number | null {
  return /^(0|[1-9]\d*)$/.test(token) ? Number(token) : null
}
