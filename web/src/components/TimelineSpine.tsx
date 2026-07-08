import type { TimelineNode } from '../lib/trials'

// TimelineSpine is the left rail's "line of development" (redesign design
// lines 146-184): one card per trial, oldest-first, threaded by a rail +
// dot per node — accent for the current/pending node, hairline for the
// rest (the style computation the prototype ran per-render at lines
// 1071-1090, ported here as class-name conditionals) — plus a dashed hint
// for whatever comes next.
//
// Two structural deviations from the prototype (plan-mandated):
//  - The prototype nests a `role="button"` span for "Promote to trunk"
//    inside the card <button> — invalid HTML. Here it is a real <button>,
//    a sibling row below the card, never nested inside another button.
//  - Pending nodes (buildTimeline's synthetic decision node, `pending:
//    true`, `isCurrent`/`isViewing` always false — see lib/trials.ts)
//    render a non-interactive, accent-soft <div> instead of a button:
//    there is nothing to view yet, so onView never fires for it.
//
// The design's per-node view model also carried a bold `label` (title)
// line separate from a muted `note` line, and a `move` slug alongside the
// ver id in the technical line. TimelineNode (Task 3) has neither `label`
// nor `move` — only `note` and `id` — so the card renders a single note
// line and the technical line shows the ver id alone.
export default function TimelineSpine({ nodes, summary, nextHint, technical, onView, onPromote }: {
  nodes: TimelineNode[]
  summary: string
  nextHint: string
  technical: boolean
  onView: (id: string) => void
  onPromote: (id: string) => void
}) {
  const cardBase = 'block w-full text-left px-[13px] py-[11px] border text-ink'

  return (
    <aside aria-label="Development timeline" className="w-timeline shrink-0 border-r border-hairline bg-panel overflow-y-auto">
      <div className="sticky top-0 z-[2] border-b border-hairline bg-panel pt-[16px] px-[18px] pb-2">
        <div className="text-2xs uppercase tracking-[0.14em] text-muted">The line of development</div>
        <div className="mt-[4px] text-faint">{summary}</div>
      </div>
      <div className="pt-[6px] pb-5">
        {nodes.map((node, i) => {
          const last = i === nodes.length - 1
          const highlighted = node.pending || node.isCurrent
          const canPromote = !node.pending && !node.isCurrent
          return (
            <div key={node.id} className="relative py-[2px] pl-[40px] pr-[16px]">
              {/* rail — decorative thread connecting the dots, always hairline-strong */}
              <div aria-hidden="true" className="absolute left-[22px] w-[2px] bg-hairline-strong"
                style={{
                  top: i === 0 ? '12px' : '-6px',
                  bottom: last ? undefined : '-6px',
                  height: last ? '18px' : undefined,
                }} />
              {/* dot — decorative; the card itself carries aria-current/state */}
              <div aria-hidden="true"
                className={`absolute left-[17px] top-[12px] z-[2] h-[13px] w-[13px] rounded-[50%] border-2 ${
                  highlighted ? 'border-accent' : 'border-hairline-strong'
                } ${node.pending ? 'bg-transparent' : node.isCurrent ? 'bg-accent' : 'bg-panel'}`} />

              {node.pending ? (
                <div className={`${cardBase} border-accent bg-accent-soft`}>
                  <TimelineCardBody node={node} technical={technical} highlighted={highlighted} />
                </div>
              ) : (
                <button type="button" onClick={() => onView(node.id)}
                  aria-current={node.isCurrent ? 'true' : undefined}
                  className={`${cardBase} ${node.isViewing ? 'border-accent bg-surface' : 'border-hairline bg-panel'}`}>
                  <TimelineCardBody node={node} technical={technical} highlighted={highlighted} />
                </button>
              )}

              {canPromote && (
                <button type="button" onClick={() => onPromote(node.id)}
                  className="mt-[8px] px-[9px] py-[5px] text-2xs uppercase tracking-[0.06em] border border-hairline-strong bg-transparent text-ink transition hover:bg-ink hover:text-page">
                  Promote to trunk
                </button>
              )}
            </div>
          )
        })}

        {/* dashed pending-next hint — ornaments are decorative, the caption is real content */}
        <div className="relative pt-[8px] pb-[2px] pl-[40px] pr-[16px]">
          <div aria-hidden="true" className="absolute left-[23px] -top-[6px] h-[22px] w-[2px]"
            style={{ backgroundImage: 'repeating-linear-gradient(var(--color-border-strong) 0 3px, transparent 3px 7px)' }} />
          <div aria-hidden="true" className="absolute left-[18px] top-[16px] h-[12px] w-[12px] rounded-[50%] border border-dashed border-hairline-strong" />
          <div className="pt-[12px] text-faint">{nextHint}</div>
        </div>
      </div>
    </aside>
  )
}

function TimelineCardBody({ node, technical, highlighted }: {
  node: TimelineNode
  technical: boolean
  highlighted: boolean
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-[8px]">
        <span className={`font-semibold uppercase leading-none tracking-[0.04em] ${highlighted ? 'text-accent-text' : 'text-muted'}`}>
          {node.head}
        </span>
        {node.cooked && (
          <span className="px-[6px] py-[1px] text-[10px] uppercase tracking-[0.08em] border border-accent text-accent-text">Cooked</span>
        )}
        {node.branch && (
          <span className="px-[6px] py-[1px] text-[10px] uppercase tracking-[0.08em] border border-hairline-strong text-faint">Branch</span>
        )}
      </div>
      <div className="mt-[3px] leading-[1.5] text-muted">{node.note}</div>
      {node.cookNote && (
        <div className="mt-[8px] px-[10px] py-[8px] leading-[1.5] bg-surface border-l-2 border-accent">
          <span className="mb-[2px] block text-[10px] uppercase tracking-[0.08em] text-accent-text">You cooked it —</span>
          “{node.cookNote}”
        </div>
      )}
      <div className="mt-[8px] flex items-center gap-[12px]">
        <span className="font-mono text-2xs text-faint">{node.when}</span>
        {technical && <span className="font-mono text-2xs text-faint">{node.id}</span>}
      </div>
    </>
  )
}
