import type { Draft, Op, Proposal } from '../types'
import { list } from '../types'
import { deltaSummary } from '../lib/deltaSummary'

const TWO_WAYS_HEADER = 'Two ways to go — pick one to develop'
const BLURB_MAX = 140
const CHANGE_LINE_CAP = 4

// summarizeOps compresses one alternative's ops into the change lines shown
// under its blurb: add gets the '+' mark, replace/remove get '→' — the
// per-line text rides deltaSummary's own naming (a named ingredient/title
// move where one exists, the section-grouped phrase otherwise), so it
// speaks the same controlled vocabulary as opLineLabel/deltaSummary
// elsewhere. Capped at 4 lines + a trailing "+n more" once there are more.
export function summarizeOps(ops: Op[], base: Draft): { sign: '+' | '→'; text: string }[] {
  const lines = ops.map((op) => ({
    sign: (op.op === 'add' ? '+' : '→') as '+' | '→',
    text: deltaSummary([op], base),
  }))
  if (lines.length <= CHANGE_LINE_CAP) return lines
  return [...lines.slice(0, CHANGE_LINE_CAP), { sign: '+' as const, text: `+${lines.length - CHANGE_LINE_CAP} more` }]
}

function trimBlurb(text: string): string {
  if (text.length <= BLURB_MAX) return text
  return `${text.slice(0, BLURB_MAX).trimEnd()}…`
}

// AlternativesPicker (rewrite, task 7 — design 242-260): two letter-badged
// comparison cards, each a single <button> stating what differs at a
// glance — headline (deltaSummary of the whole change set), a trimmed
// rationale blurb, and the top change lines. Picking is a plain
// client-side selection; Workbench keeps the selectedProposalId contract
// and targets the picked proposal's id with whatever gate verb runs next.
export default function AlternativesPicker({ proposals, base, onPick }: {
  proposals: Proposal[]
  base: Draft
  onPick: (id: string) => void
}) {
  return (
    <div data-testid="alternatives-picker" className="cc-rise p-3">
      <div className="text-2xs tracking-[0.1em] uppercase text-muted mb-[6px]">{TWO_WAYS_HEADER}</div>
      <div className="grid grid-cols-2 gap-[14px]">
        {proposals.map((p, i) => {
          const ops = list(p.change)
          return (
            <button key={p.id} type="button" data-testid="alt-card" onClick={() => onPick(p.id)}
              className="text-left border border-hairline-strong bg-panel p-[16px] transition hover:bg-surface">
              <div className="flex items-center gap-2">
                <span aria-hidden="true"
                  className="w-[22px] h-[22px] border border-ink inline-flex items-center justify-center font-bold text-[12px]">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="font-medium text-ink">{deltaSummary(ops, base)}</span>
              </div>
              <p data-testid="alt-blurb" className="mt-[10px] text-[13px] leading-[1.55] text-muted">
                {trimBlurb(p.rationale)}
              </p>
              <div className="mt-[10px] flex flex-col gap-1">
                {summarizeOps(ops, base).map((c, j) => (
                  <span key={j} className="text-2xs text-ink">
                    <span aria-hidden="true">{c.sign}</span> {c.text}
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
