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
  idle: 'Bench ready',
  proposing: 'Proposing…',
  awaiting_gate: 'At the pass',
  blocked: 'On hold — safety',
}

export const STATE_GLOSS: Record<string, string> = {
  idle: 'ready for the next move',
  awaiting_gate: 'awaiting your decision',
  blocked: 'a safety rule stopped this move',
}

// Gate verbs. Two levels at the pass: Accept + Ask for changes up front,
// the revision/mode-switch verbs behind More ▾ with their verbatim names.
export const VERB_LABEL: Record<GateVerb, string> = {
  accept: 'Accept',
  edit: 'Edit',
  regenerate: 'Regenerate',
  alternatives: 'Alternatives',
  redirect: 'Ask for changes',
  take_over: 'Take over',
}

export const LEVEL_ONE_VERBS: readonly GateVerb[] = ['accept', 'redirect']
export const MORE_VERBS: readonly GateVerb[] = ['edit', 'regenerate', 'alternatives', 'take_over']

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

// Fixed copy, naming map §6. Failure is rigor: an intentional kill is never
// "something went wrong".
export const SAFETY_HOLD_TITLE = 'Safety hold — critical limit'
export const CORRECTIVE_ACTION = 'Corrective action'
export const TRIALS_HEADING = 'Trials'
export const TASTING_NOTES_PROMPT = 'Tasting notes — what worked, what changes?'
export const PROPOSE_REWORK = 'Propose a rework'
export const DIRECTION_LABEL = 'Direction (optional)'
export const ALTERNATIVES_HEADER = 'Tasting — select one to develop'
export const STATION_CARD = 'Station card'
export const DIAL_LABEL = 'Auto-apply safe steps'
export const EMPTY_DRAFT = 'The bench is clear. One move sketches the dish — propose it when ready.'
export const EMPTY_THREAD = 'Development opens with a move. The kitchen is ready below.'
export const TRIAL_RETIRED = 'Trial retired. The kitchen will draft another.'

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

export function announceProposalReady(changes: number): string {
  return `Proposal ready — ${changes} ${changes === 1 ? 'change' : 'changes'} to review`
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

// Version aliasing: v1/v2/v3 in running text, Trial pills on the strip,
// 8-char hash refs where precision matters (full hash only on the snapshot).
export function versionAlias(n: number): string {
  return `v${n}`
}

export function trialAlias(n: number): string {
  return `Trial ${n}`
}

export function shortRef(id: string): string {
  const m = /^(ver_)(.+)$/.exec(id)
  if (m) return m[2].length <= 8 ? id : `${m[1]}${m[2].slice(0, 8)}`
  return id.length <= 8 ? id : id.slice(0, 8)
}
