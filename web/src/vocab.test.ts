import { MOVE_TYPES } from './types'
import {
  LEVEL_ONE_VERBS, MORE_VERBS, MOVE_LABEL, STATE_GLOSS, STATE_LABEL,
  VERB_LABEL, shortRef, trialAlias, versionAlias,
} from './vocab'

test('every move-type slug has a plain-language label with no slug leakage', () => {
  for (const mt of MOVE_TYPES) {
    const label = MOVE_LABEL[mt]
    expect(label, `missing label for ${mt}`).toBeTruthy()
    expect(label).not.toBe(mt)
    expect(label).not.toMatch(/_/)
  }
})

test('every gate verb has a surface label; redirect reads as Ask for changes', () => {
  const verbs = ['accept', 'edit', 'regenerate', 'alternatives', 'redirect', 'take_over'] as const
  for (const v of verbs) expect(VERB_LABEL[v], `missing label for ${v}`).toBeTruthy()
  expect(VERB_LABEL.redirect).toBe('Ask for changes')
  expect(VERB_LABEL.accept).toBe('Accept')
})

test('gate levels partition the six verbs: accept + ask-for-changes up front, four behind More', () => {
  expect(LEVEL_ONE_VERBS).toEqual(['accept', 'redirect'])
  expect(MORE_VERBS).toEqual(['edit', 'regenerate', 'alternatives', 'take_over'])
  const all = [...LEVEL_ONE_VERBS, ...MORE_VERBS].sort()
  expect(all).toEqual(Object.keys(VERB_LABEL).sort())
})

test('renamed workbench states speak kitchen vocabulary and carry plain glosses', () => {
  expect(STATE_LABEL.idle).toBe('Bench ready')
  expect(STATE_LABEL.awaiting_gate).toBe('At the pass')
  expect(STATE_LABEL.blocked).toBe('On hold — safety')
  expect(STATE_LABEL.proposing).toBe('Proposing…')
  // Every renamed state carries a first-use gloss (call #4); the gloss is
  // plain language, so it never repeats the label.
  for (const state of ['idle', 'awaiting_gate', 'blocked'] as const) {
    expect(STATE_GLOSS[state], `missing gloss for ${state}`).toBeTruthy()
    expect(STATE_GLOSS[state]).not.toBe(STATE_LABEL[state])
  }
  expect(STATE_GLOSS.awaiting_gate).toBe('awaiting your decision')
})

test('version ids compact to the 8-char trial form, full ids pass through when short', () => {
  expect(shortRef('ver_3d04a4f2c0ffee99')).toBe('ver_3d04a4f2')
  expect(shortRef('ver_ab12')).toBe('ver_ab12')
  expect(shortRef('deadbeefcafe0123')).toBe('deadbeef')
})

test('trial and version aliases number from the chain position', () => {
  expect(trialAlias(3)).toBe('Trial 3')
  expect(versionAlias(3)).toBe('v3')
})
