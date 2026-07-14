import { list, type Draft, type MoveType, type Op, type VersionsResponse } from '../types'
import { MOVE_LABEL, trialAlias } from '../vocab'
import { deltaSummary } from './deltaSummary'

// buildTimeline turns the wire's flat version list into the "line of
// development" the timeline spine renders: one node per trial, in wire
// order, plus (when a proposal is awaiting the gate) a synthetic decision
// node the wire has no field for.

// Synthetic id for the not-yet-a-version pending node. It will never
// collide with a real ver_* id, so isCurrent/isViewing below fall out
// false for it via the same equality check every other node uses —
// components key off `pending` for its special treatment, not those flags.
const PENDING_ID = 'pending'

export interface TimelineNode {
  id: string
  n: number // 1-based trial number, wire order
  head: string // "Trial 2" | "Trial 3 — your decision" (pending)
  note: string // draft.concept, or deltaSummary for pending
  when: string // formatted createdAt ('' for pending)
  cooked: boolean
  cookNote?: string
  branch: boolean // parent already had an earlier child
  branchFromN?: number // 1-based trial number of the parent trial (branch nodes only)
  isCurrent: boolean
  isViewing: boolean
  pending: boolean
  // auto (BC-F-3): this trial landed via a dial-ON auto-applied deterministic
  // move, never a human gate decision — the spine's durable attribution
  // marker, since the "applied automatically" toast itself evaporates.
  auto: boolean
}

export function buildTimeline(
  data: VersionsResponse,
  opts: {
    viewingId: string | null
    cookNotes: Record<string, string>
    pendingProposal?: { move_type: string; change: Op[] | null } | null
    baseDraft?: Draft
  },
): TimelineNode[] {
  const versions = list(data.versions)

  const nodes: TimelineNode[] = versions.map((v, i) => {
    const branch = versions.some((other, j) => j < i && other.parentVersionId === v.parentVersionId)
    const cooked = Object.hasOwn(opts.cookNotes, v.id)
    // branchFromN: the parent trial's 1-based number (BC-D-7 — the "Branch"
    // badge's inline self-explanation needs a concrete trial to point at).
    // Only meaningful (and only rendered) when branch is true; computed here
    // regardless since the lookup is cheap and keeps this the single place
    // that maps parentVersionId → trial number.
    const parentIndex = v.parentVersionId ? versions.findIndex((x) => x.id === v.parentVersionId) : -1
    return {
      id: v.id,
      n: i + 1,
      head: trialAlias(i + 1),
      note: v.draft.concept,
      when: formatWhen(v.createdAt),
      cooked,
      cookNote: cooked ? opts.cookNotes[v.id] : undefined,
      branch,
      branchFromN: parentIndex >= 0 ? parentIndex + 1 : undefined,
      isCurrent: v.id === data.currentVersionId,
      isViewing: v.id === opts.viewingId,
      pending: false,
      auto: v.origin === 'auto',
    }
  })

  if (opts.pendingProposal) {
    const n = versions.length + 1
    const label = MOVE_LABEL[opts.pendingProposal.move_type as MoveType] ?? opts.pendingProposal.move_type
    const summary = deltaSummary(list(opts.pendingProposal.change), opts.baseDraft)
    // Reconciles the brief's two framings: the move label leads only when
    // deltaSummary has nothing to show ('no changes'); otherwise the delta
    // itself is the headline and the label would just be noise.
    const note = summary === 'no changes' ? `${label} — ${summary}` : summary
    nodes.push({
      id: PENDING_ID,
      n,
      head: `${trialAlias(n)} — your decision`,
      note,
      when: '',
      cooked: false,
      cookNote: undefined,
      branch: false,
      isCurrent: PENDING_ID === data.currentVersionId,
      isViewing: PENDING_ID === opts.viewingId,
      pending: true,
      auto: false,
    })
  }

  return nodes
}

// formatWhen builds the compact "Mon 6:12p" trial timestamp: short weekday,
// unpadded hour, 2-digit minute, lowercase am/pm with no space or period.
// Parsed out of toLocaleString's own parts rather than hand-formatted, so
// it stays correct across DST/locale edge cases; '' on an unparseable date.
export function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const formatted = date.toLocaleString('en-US', {
    weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true,
  })
  const parts = /^(\w+) (\d{1,2}):(\d{2}) ([AP]M)$/.exec(formatted)
  if (!parts) return ''
  const [, weekday, hour, minute, ampm] = parts
  return `${weekday} ${hour}:${minute}${ampm[0].toLowerCase()}`
}
