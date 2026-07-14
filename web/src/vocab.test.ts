import { MOVE_TYPES } from './types'
import {
  ANNOUNCE_PROPOSING, BLOCKED_REDIRECT, BLOCKED_REGEN, GATE_ANOTHER_LABEL, GATE_PROMPT,
  LEVEL_ONE_VERBS, MORE_VERBS, MOVE_LABEL, STATE_LABEL,
  VERB_LABEL, announceProgress, announceProposalReady, shortRef, trialAlias,
} from './vocab'

test('every move-type slug has a plain-language label with no slug leakage', () => {
  for (const mt of MOVE_TYPES) {
    const label = MOVE_LABEL[mt]
    expect(label, `missing label for ${mt}`).toBeTruthy()
    expect(label).not.toBe(mt)
    expect(label).not.toMatch(/_/)
  }
})

test('every gate verb has a surface label in the mode-based register', () => {
  const verbs = ['accept', 'edit', 'regenerate', 'alternatives', 'redirect', 'take_over'] as const
  for (const v of verbs) expect(VERB_LABEL[v], `missing label for ${v}`).toBeTruthy()
  expect(VERB_LABEL.accept).toBe('Use it')
  expect(VERB_LABEL.edit).toBe('Tweak it')
  // BC-C-11: "Regenerate" read as API/model jargon, not a cook's word for
  // redoing the proposal from the same intent — data-verb="regenerate" (the
  // oracle selector vocabulary) stays put; only the visible label changed.
  expect(VERB_LABEL.regenerate).toBe('Another take')
  expect(VERB_LABEL.regenerate).not.toMatch(/regenerate/i)
  expect(VERB_LABEL.alternatives).toBe('Compare two options')
  expect(VERB_LABEL.redirect).toBe('Ask for changes')
  expect(VERB_LABEL.take_over).toBe('Edit it myself')
})

test('gate levels partition the six verbs: accept + tweak up front, four behind "Try another way"', () => {
  expect(LEVEL_ONE_VERBS).toEqual(['accept', 'edit'])
  expect(MORE_VERBS).toEqual(['regenerate', 'alternatives', 'redirect', 'take_over'])
  const all = [...LEVEL_ONE_VERBS, ...MORE_VERBS].sort()
  expect(all).toEqual(Object.keys(VERB_LABEL).sort())
})

test('renamed workbench states speak the culinary-decision register', () => {
  expect(STATE_LABEL.idle).toBe('Ready')
  expect(STATE_LABEL.proposing).toBe('Thinking…')
  expect(STATE_LABEL.awaiting_gate).toBe('Needs your call')
  expect(STATE_LABEL.blocked).toBe('Safety hold')
})

test('the GateBar decide-mode prompt and disclosure label are fixed copy', () => {
  expect(GATE_PROMPT).toBe('Want this change?')
  expect(GATE_ANOTHER_LABEL).toBe('Try another way')
})

test('the safety hold offers only its two verbs, in the hold\'s own register', () => {
  expect(BLOCKED_REGEN).toBe('Try a different way')
  expect(BLOCKED_REDIRECT).toBe('Ask for a safer change')
})

// BC-B-10: the mid-wait progress cue must never collide with either
// endpoint string (the harness classifies liveLog entries by these three
// regexes) and successive ticks must read as genuinely distinct text, not a
// coincidental re-render of the same string.
test('announceProgress never collides with the start/ready endpoint strings and varies by tick', () => {
  const samples = [0, 1, 2, 3, 4, 5].map((tick) => announceProgress(12, tick))
  for (const s of samples) {
    expect(s).not.toBe(ANNOUNCE_PROPOSING)
    expect(s).not.toBe(announceProposalReady(1))
    expect(s).toMatch(/\bwords? drafted so far\)$/)
  }
  // Consecutive ticks (the only adjacency that matters — announce() only
  // needs to differ from the value immediately before it) are distinct.
  for (let i = 1; i < samples.length; i++) expect(samples[i]).not.toBe(samples[i - 1])
  // Word count is legible in the string, not just an internal counter.
  expect(announceProgress(1, 0)).toMatch(/\b1 word drafted so far\)$/)
})

test('version ids compact to the 8-char trial form, full ids pass through when short', () => {
  expect(shortRef('ver_3d04a4f2c0ffee99')).toBe('ver_3d04a4f2')
  expect(shortRef('ver_ab12')).toBe('ver_ab12')
  expect(shortRef('deadbeefcafe0123')).toBe('deadbeef')
})

test('trial aliases number from the chain position', () => {
  expect(trialAlias(3)).toBe('Trial 3')
})
