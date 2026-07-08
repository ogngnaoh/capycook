import { sampleDraft } from '../fixtures'
import type { VersionItem, VersionsResponse } from '../types'
import { buildTimeline, formatWhen } from './trials'

function version(over: Partial<VersionItem>): VersionItem {
  return {
    id: 'ver_1',
    parentVersionId: null,
    createdAt: '2026-07-06T00:00:00Z',
    draft: sampleDraft(),
    ...over,
  }
}

const baseOpts = { viewingId: null, cookNotes: {} }

test('an empty response has no timeline nodes', () => {
  const data: VersionsResponse = { currentVersionId: null, versions: null }
  expect(buildTimeline(data, baseOpts)).toEqual([])
})

test('two linear versions number 1..2 with no branch', () => {
  const v1 = version({ id: 'ver_1', parentVersionId: null })
  const v2 = version({ id: 'ver_2', parentVersionId: 'ver_1' })
  const data: VersionsResponse = { currentVersionId: 'ver_2', versions: [v1, v2] }
  const nodes = buildTimeline(data, baseOpts)
  expect(nodes.map((n) => n.n)).toEqual([1, 2])
  expect(nodes.map((n) => n.head)).toEqual(['Trial 1', 'Trial 2'])
  expect(nodes.every((n) => !n.branch)).toBe(true)
})

test('a second child of the same parent is flagged as a branch', () => {
  const v1 = version({ id: 'ver_1', parentVersionId: null })
  const v2 = version({ id: 'ver_2', parentVersionId: 'ver_1' })
  const v3 = version({ id: 'ver_3', parentVersionId: 'ver_1' })
  const data: VersionsResponse = { currentVersionId: 'ver_3', versions: [v1, v2, v3] }
  const nodes = buildTimeline(data, baseOpts)
  expect(nodes.map((n) => n.branch)).toEqual([false, false, true])
})

test('cookNotes map through by version id', () => {
  const v1 = version({ id: 'ver_1' })
  const v2 = version({ id: 'ver_2', parentVersionId: 'ver_1' })
  const data: VersionsResponse = { currentVersionId: 'ver_2', versions: [v1, v2] }
  const nodes = buildTimeline(data, { ...baseOpts, cookNotes: { ver_1: 'needs more salt' } })
  expect(nodes[0].cooked).toBe(true)
  expect(nodes[0].cookNote).toBe('needs more salt')
  expect(nodes[1].cooked).toBe(false)
  expect(nodes[1].cookNote).toBeUndefined()
})

test('note carries the draft concept for a real trial', () => {
  const v1 = version({ id: 'ver_1', draft: sampleDraft({ concept: 'A bright, herby glaze.' }) })
  const data: VersionsResponse = { currentVersionId: 'ver_1', versions: [v1] }
  const nodes = buildTimeline(data, baseOpts)
  expect(nodes[0].note).toBe('A bright, herby glaze.')
})

test('viewingId and currentVersionId flags are wired independently', () => {
  const v1 = version({ id: 'ver_1' })
  const v2 = version({ id: 'ver_2', parentVersionId: 'ver_1' })
  const data: VersionsResponse = { currentVersionId: 'ver_2', versions: [v1, v2] }
  const nodes = buildTimeline(data, { ...baseOpts, viewingId: 'ver_1' })
  expect(nodes[0]).toMatchObject({ isViewing: true, isCurrent: false })
  expect(nodes[1]).toMatchObject({ isViewing: false, isCurrent: true })
})

test('no pending node is appended when there is no pending proposal', () => {
  const v1 = version({ id: 'ver_1' })
  const data: VersionsResponse = { currentVersionId: 'ver_1', versions: [v1] }
  expect(buildTimeline(data, baseOpts)).toHaveLength(1)
})

test('a pending proposal appends a decision node with a deltaSummary note', () => {
  const v1 = version({ id: 'ver_1' })
  const data: VersionsResponse = { currentVersionId: 'ver_1', versions: [v1] }
  const nodes = buildTimeline(data, {
    ...baseOpts,
    pendingProposal: {
      move_type: 'ingredient_change',
      change: [{ op: 'replace', path: '/title', value: 'Crispy Thighs' }],
    },
    baseDraft: sampleDraft(),
  })
  expect(nodes).toHaveLength(2)
  const pending = nodes[1]
  expect(pending.pending).toBe(true)
  expect(pending.n).toBe(2)
  expect(pending.head).toBe('Trial 2 — your decision')
  expect(pending.note).toBe('retitled "Crispy Thighs"')
  expect(pending.when).toBe('')
})

test('a pending proposal with no visible changes leads with the move label', () => {
  const data: VersionsResponse = { currentVersionId: null, versions: [] }
  const nodes = buildTimeline(data, {
    ...baseOpts,
    pendingProposal: { move_type: 'seed_expand', change: [] },
  })
  expect(nodes[0].head).toBe('Trial 1 — your decision')
  expect(nodes[0].note).toBe('First draft — no changes')
})

test('a pending proposal with a null change list reads as no changes', () => {
  const data: VersionsResponse = { currentVersionId: null, versions: [] }
  const nodes = buildTimeline(data, {
    ...baseOpts,
    pendingProposal: { move_type: 'scale_servings', change: null },
  })
  expect(nodes[0].note).toBe('Scale servings — no changes')
})

test('formatWhen renders a short weekday + time', () => {
  expect(formatWhen('2026-07-07T18:12:00Z')).toMatch(/^\w{3} \d{1,2}:\d{2}(a|p)$/)
})

test('formatWhen guards an unparseable date', () => {
  expect(formatWhen('garbage')).toBe('')
})
