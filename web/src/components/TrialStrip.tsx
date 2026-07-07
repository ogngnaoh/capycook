import { useState, type FormEvent } from 'react'
import type { VersionItem, VersionsResponse } from '../types'
import { list } from '../types'
import { PROPOSE_REWORK, TASTING_NOTES_PROMPT, TRIALS_HEADING, shortRef, trialAlias } from '../vocab'
import VersionHistory from './VersionHistory'

// TrialStrip is the persistent one-line record of the dish's trials, pinned
// atop the canvas (redesign brief §5a/§7): each accepted version is a
// `TRIAL n · ver_8char` pill, oldest→newest, with the trial in service marked
// (aria-current + a shape marker, not color) and branch forks flagged.
// Activating a pill opens that trial's read-only snapshot; the current pill
// also carries the post-cook "I cooked this" affordance — tasting notes that
// ask for one rework proposal. "Trials" expands the strip downward into the
// full version history (the reworked VersionHistory), replacing the old
// header Versions toggle.
export default function TrialStrip({ data, selectedId, onSelect, onPromote, onCook, canCook, summaryOf, panelClassName = '' }: {
  data: VersionsResponse
  selectedId: string | null
  onSelect: (v: VersionItem) => void
  onPromote: (versionId: string) => void
  onCook: (versionId: string, feedback: string) => void
  canCook: boolean
  // Optional per-pill delta headline. VersionItem carries no ops today, so the
  // strip renders no summaries by default; supply this (e.g. deltaSummary of a
  // parent→child diff) to light up the "what changed" line without touching
  // TrialStrip.
  summaryOf?: (v: VersionItem) => string | undefined
  // Narrow-viewport panelization (task 14): Workbench appends the History-tab
  // toggle classes here. Empty on desktop — the record strip pins atop the
  // canvas exactly as today.
  panelClassName?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [cooking, setCooking] = useState(false)
  const versions = list(data.versions)

  // Branch derivation matches VersionHistory: a trial forks when it shares a
  // parent with a sibling. One derivation across both surfaces keeps the pill
  // markers and the expansion from ever disagreeing.
  const childCount = new Map<string, number>()
  for (const v of versions) {
    const key = v.parentVersionId ?? '(root)'
    childCount.set(key, (childCount.get(key) ?? 0) + 1)
  }

  const pill = 'inline-flex items-center gap-1 min-h-[24px] px-2 py-0 text-ink transition hover:bg-ink hover:text-page'
  const cta = 'min-h-[24px] px-2 py-0 uppercase border border-hairline bg-transparent text-ink transition enabled:hover:bg-ink enabled:hover:text-page disabled:opacity-40'

  return (
    <section data-testid="trial-strip" id="trial-strip-region" aria-label="Trial record"
      className={`shrink-0 border-b border-hairline bg-page ${panelClassName}`}>
      <div className="flex flex-wrap items-center gap-2 p-2">
        <button type="button" onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded} aria-controls="trial-expansion"
          className={`shrink-0 min-h-[24px] px-2 py-0 uppercase border transition ${expanded
            ? 'border-hairline-strong bg-surface text-ink'
            : 'border-hairline bg-transparent text-ink hover:bg-ink hover:text-page'}`}>
          {TRIALS_HEADING}
          <span aria-hidden="true" className="ml-1">{expanded ? '▴' : '▾'}</span>
        </button>

        {versions.length === 0 ? (
          <p className="text-2xs text-muted normal-case">No trials yet — accept a proposal to start the record.</p>
        ) : (
          <ol className="flex flex-wrap items-center gap-1">
            {versions.map((v, i) => {
              const isCurrent = v.id === data.currentVersionId
              const isSelected = v.id === selectedId
              const isBranch = (childCount.get(v.parentVersionId ?? '(root)') ?? 0) > 1
              const summary = summaryOf?.(v)
              return (
                <li key={v.id} className="inline-flex items-center gap-1">
                  <button type="button" onClick={() => onSelect(v)}
                    aria-current={isCurrent ? 'true' : undefined}
                    title={summary || undefined}
                    className={`${pill} border ${isSelected ? 'border-hairline-strong bg-surface' : 'border-hairline bg-transparent'}`}>
                    <span className="uppercase text-2xs">{trialAlias(i + 1)}</span>
                    <span aria-hidden="true" className="text-muted">·</span>
                    <span className="font-mono text-2xs">{shortRef(v.id)}</span>
                    {isBranch && (
                      <span className="uppercase text-2xs px-1 border border-hairline-strong text-muted">branch</span>
                    )}
                    {isCurrent && (
                      <>
                        <span aria-hidden="true" className="inline-block w-1 h-1 bg-accent" />
                        <span className="sr-only">(current)</span>
                      </>
                    )}
                  </button>
                  {isCurrent && (
                    <button type="button" disabled={!canCook}
                      onClick={() => setCooking((c) => !c)}
                      className={cta}>
                      I cooked this
                    </button>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>

      {cooking && data.currentVersionId && (
        <div className="px-2 pb-2">
          <CookFeedbackForm versionRef={shortRef(data.currentVersionId)} canCook={canCook}
            onSubmit={(feedback) => {
              setCooking(false)
              onCook(data.currentVersionId!, feedback)
            }}
            onCancel={() => setCooking(false)} />
        </div>
      )}

      <div id="trial-expansion">
        {expanded && (
          <VersionHistory data={data} selectedId={selectedId} onSelect={onSelect} onPromote={onPromote} />
        )}
      </div>
    </section>
  )
}

// CookFeedbackForm collects the tasting notes for the trial in service and
// asks for one rework proposal generated against that trial's draft. Moved
// here from VersionHistory: the affordance now lives on the current pill.
function CookFeedbackForm({ versionRef, canCook, onSubmit, onCancel }: {
  versionRef: string
  canCook: boolean
  onSubmit: (feedback: string) => void
  onCancel: () => void
}) {
  const [feedback, setFeedback] = useState('')
  function submit(e: FormEvent) {
    e.preventDefault()
    if (feedback.trim() === '') return
    onSubmit(feedback.trim())
  }
  return (
    <form onSubmit={submit} data-testid="cook-feedback-form"
      className="space-y-1 border-t border-hairline pt-2">
      <label className="block uppercase text-muted">
        {TASTING_NOTES_PROMPT}
        <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3}
          placeholder="e.g. too salty — cut the feta by half"
          className="mt-1 w-full border border-hairline-strong bg-page p-1 text-ink normal-case placeholder:text-muted" />
      </label>
      <div className="flex gap-1">
        <button type="submit" disabled={!canCook || feedback.trim() === ''}
          className="px-3 py-1 uppercase font-medium enabled:bg-accent enabled:text-on-accent disabled:bg-surface disabled:text-muted">
          {PROPOSE_REWORK}
        </button>
        <button type="button" onClick={onCancel}
          className="px-3 py-1 uppercase border border-hairline bg-transparent text-ink transition hover:bg-ink hover:text-page">
          Cancel
        </button>
      </div>
      <p className="text-2xs text-muted normal-case">
        One rework proposal will be drafted from trial <span className="font-mono">{versionRef}</span>.
      </p>
    </form>
  )
}
