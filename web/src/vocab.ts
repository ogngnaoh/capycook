import type { GateVerb, MoveType } from './types'

// The house glossary — every string a human reads, in the development
// kitchen's own vocabulary (agent_docs/2026-07-07-gate-c-redesign-brief.md §6).
// Register: "chef de cuisine writing a station card" — declarative present,
// no exclamation marks, the model is "the kitchen", the user is the chef.
// Wire enums/slugs never change; surfaces show these labels with the slug
// demoted to secondary mono where power users need it. Labels are stored in
// sentence case — uppercase is the caller's CSS concern. Tests assert against
// this module, never against raw string literals.

// Workbench header states. Renamed states carry a first-use gloss (plain
// language, shown as subtitle/tooltip on first appearance).
export const STATE_LABEL: Record<string, string> = {
  idle: 'Ready',
  proposing: 'Thinking…',
  awaiting_gate: 'Needs your call',
  blocked: 'Safety hold',
}

// Gate verbs. The mode-based GateBar (task 6) speaks two altitudes: the
// decision pair up front (Use it / Tweak it) plus "Try another way ▾" for
// the four revision/mode-switch verbs.
export const VERB_LABEL: Record<GateVerb, string> = {
  accept: 'Use it',
  edit: 'Tweak it',
  // "Regenerate" reads as API/model vocabulary, not a cook's word for redoing
  // the proposal from the same intent (BC-C-11) — the wire verb/data-verb
  // value is untouched, only this display label changed.
  regenerate: 'Another take',
  alternatives: 'Compare two options',
  redirect: 'Ask for changes',
  take_over: 'Edit it myself',
}

export const LEVEL_ONE_VERBS: readonly GateVerb[] = ['accept', 'edit']
export const MORE_VERBS: readonly GateVerb[] = ['regenerate', 'alternatives', 'redirect', 'take_over']

// GateBar decide-mode copy (task 6).
export const GATE_PROMPT = 'Want this change?'
export const GATE_ANOTHER_LABEL = 'Try another way'

// Safety-hold verb copy (task 7's SafetyHold — only these two verbs exist
// on a hold, in the hold's own register).
export const BLOCKED_REGEN = 'Try a different way'
export const BLOCKED_REDIRECT = 'Ask for a safer change'

// Move types in cook vocabulary — plain label primary, slug secondary mono.
export const MOVE_LABEL: Record<MoveType, string> = {
  seed_expand: 'First draft',
  flavor_direction: 'Flavor direction',
  ingredient_change: 'Ingredient change',
  technique_step: 'Technique step',
  iterate_feedback: 'Rework from tasting notes',
  scale_servings: 'Scale servings',
  unit_convert: 'Convert units',
  cost_recompute: 'Recompute cost',
  nutrition_recompute: 'Recompute nutrition',
}

// Intent-bar empty-guard validation (BC-A-4 / BC-A-9): a submit with nothing
// to act on is never a silent no-op — the message names what to fix, in the
// same register as the seed form's errors.
export const INTENT_EMPTY_ERROR = 'Enter an intent — say what you want to try next.'
export const SCALE_INVALID_ERROR = 'Enter servings as a whole number, at least 1.'

// Fixed copy, naming map §6. Failure is rigor: an intentional kill is never
// "something went wrong".
export const SAFETY_HOLD_TITLE = 'Safety hold — this change was stopped'
export const TASTING_NOTES_PROMPT = 'Tasting notes — what worked, what to change?'
export const DIAL_LABEL = 'Auto-apply safe steps'

export function promotedToService(ref: string): string {
  return `${ref} promoted to service`
}

// Screen-reader prefixes for the aural diff grammar (brief P3): visual
// strike/tint carries the change for sighted users; these carry it for
// everyone else.
export const SR_WAS = 'was: '
export const SR_NOW = 'now: '
export const SR_ADDED = 'added: '
export const SR_REMOVED = 'removed: '

// Gate-lifecycle announcements for the permanent status region (P1): one
// sentence per transition, never the token stream.
export const ANNOUNCE_PROPOSING = 'Proposing a move…'
export const ANNOUNCE_MOVE_FAILED = 'Move failed'
export const ANNOUNCE_MOVE_CANCELLED = 'Move cancelled'

// Snapshot navigation speaks both directions (BC-D-2): entering the read-only
// trial announces "Viewing Trial N, read-only."; leaving it announces this —
// never a silent swap back to the live, decidable state.
export const ANNOUNCE_BACK_TO_CURRENT = 'Back to the current version.'

export function announceProposalReady(changes: number): string {
  return `Proposal ready — ${changes} ${changes === 1 ? 'change' : 'changes'} to review`
}

// Coarse mid-wait progress announcements (BC-B-10): the live region must say
// SOMETHING between "Proposing a move…" and "Proposal ready…" during a long
// generation, or a screen-reader user gets up to 40s of silence. Rotating
// through PROGRESS_PHRASES (rather than a single fixed string) guarantees
// each call differs from the one immediately before it even if the word
// count happens to repeat — announce() only speaks on an actual DOM text
// change, so an identical repeat would be silently swallowed.
const PROGRESS_PHRASES = [
  'Still working on it…',
  'Weighing the direction…',
  'Drafting the rationale…',
  'Refining the details…',
]

export function announceProgress(wordsSoFar: number, tick: number): string {
  const phrase = PROGRESS_PHRASES[tick % PROGRESS_PHRASES.length]
  const words = wordsSoFar === 1 ? '1 word' : `${wordsSoFar} words`
  return `${phrase} (${words} drafted so far)`
}

export function announceAlternatives(count: number): string {
  return `${count} alternatives ready — pick one to develop`
}

export const GATE_ANNOUNCE: Record<GateVerb, string> = {
  accept: 'Accepting…',
  edit: 'Applying the edit…',
  regenerate: 'Regenerating…',
  alternatives: 'Drafting alternatives…',
  redirect: 'Sending direction…',
  take_over: 'Saving your draft…',
}

// Version aliasing: Trial pills on the strip, 8-char hash refs where
// precision matters (full hash only on the snapshot).
export function trialAlias(n: number): string {
  return `Trial ${n}`
}

export function shortRef(id: string): string {
  const m = /^(ver_)(.+)$/.exec(id)
  if (m) return m[2].length <= 8 ? id : `${m[1]}${m[2].slice(0, 8)}`
  return id.length <= 8 ? id : id.slice(0, 8)
}
