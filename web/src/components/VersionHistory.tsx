import { useState, type FormEvent } from 'react'
import type { VersionItem, VersionsResponse } from '../types'
import { list } from '../types'

// VersionHistory renders the dish's version chain as a hairline index list:
// clickable read-only snapshot selection, the current pointer (filled square
// dot + label), a sibling/branch indicator (versions sharing a parent),
// Promote for any non-current version, and the post-cook entry point —
// "I cooked this" opens a feedback form that asks for one rework proposal
// against that exact version (spec §8 / P0-8).
export default function VersionHistory({ data, selectedId, onSelect, onPromote, onCook, canCook }: {
  data: VersionsResponse
  selectedId: string | null
  onSelect: (v: VersionItem) => void
  onPromote: (versionId: string) => void
  onCook: (versionId: string, feedback: string) => void
  canCook: boolean
}) {
  const [cookingId, setCookingId] = useState<string | null>(null)
  const versions = list(data.versions)
  const childCount = new Map<string, number>()
  for (const v of versions) {
    const key = v.parentVersionId ?? '(root)'
    childCount.set(key, (childCount.get(key) ?? 0) + 1)
  }
  return (
    <section data-testid="version-history"
      className="w-72 shrink-0 border-l border-hairline p-3 space-y-2 overflow-y-auto bg-page">
      <h2 className="uppercase text-muted">Versions</h2>
      {versions.length === 0 && (
        <p className="text-muted">No versions yet — accept a proposal to start the chain.</p>
      )}
      <ul className="border-t border-hairline">
        {versions.map((v) => {
          const isCurrent = v.id === data.currentVersionId
          const isBranch = (childCount.get(v.parentVersionId ?? '(root)') ?? 0) > 1
          return (
            <li key={v.id}
              className={`border-b border-x border-hairline p-2 ${selectedId === v.id ? 'bg-surface' : 'bg-page'}`}>
              <button type="button" onClick={() => onSelect(v)} className="w-full text-left">
                <span className="font-medium text-ink">{v.draft.title || '(untitled)'}</span>
                <span className="block font-mono text-2xs text-muted">{v.id}</span>
                <span className="block text-2xs text-muted">{new Date(v.createdAt).toLocaleString()}</span>
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-2xs">
                {isCurrent && (
                  <span className="inline-flex items-center gap-1 uppercase text-ink">
                    <span aria-hidden="true" className="inline-block w-1 h-1 bg-accent" />
                    current
                  </span>
                )}
                {isBranch && (
                  <span className="uppercase px-1 border border-hairline-strong text-muted">branch</span>
                )}
                <span className="ml-auto inline-flex gap-1">
                  <button type="button" disabled={!canCook}
                    onClick={() => setCookingId(cookingId === v.id ? null : v.id)}
                    className="px-1 py-0 uppercase border border-hairline bg-transparent text-ink transition enabled:hover:bg-ink enabled:hover:text-page disabled:opacity-40">
                    I cooked this
                  </button>
                  {!isCurrent && (
                    <button type="button" onClick={() => onPromote(v.id)}
                      className="px-1 py-0 uppercase border border-hairline bg-transparent text-ink transition hover:bg-ink hover:text-page">
                      Promote
                    </button>
                  )}
                </span>
              </div>
              {cookingId === v.id && (
                <CookFeedbackForm versionId={v.id} canCook={canCook}
                  onSubmit={(feedback) => {
                    setCookingId(null)
                    onCook(v.id, feedback)
                  }}
                  onCancel={() => setCookingId(null)} />
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// CookFeedbackForm collects how the cooked version went and asks for one
// rework proposal generated against that version's draft.
function CookFeedbackForm({ versionId, canCook, onSubmit, onCancel }: {
  versionId: string
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
      className="mt-2 space-y-1 border-t border-hairline pt-2">
      <label className="block uppercase text-muted">
        How did it cook? What should change?
        <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3}
          placeholder="e.g. too salty — cut the feta by half"
          className="mt-1 w-full border border-hairline-strong bg-page p-1 text-ink normal-case placeholder:text-muted" />
      </label>
      <div className="flex gap-1">
        <button type="submit" disabled={!canCook || feedback.trim() === ''}
          className="px-2 py-1 uppercase bg-accent text-on-accent font-medium disabled:opacity-40">
          Propose a rework
        </button>
        <button type="button" onClick={onCancel}
          className="px-2 py-1 uppercase border border-hairline bg-transparent text-ink transition hover:bg-ink hover:text-page">
          Cancel
        </button>
      </div>
      <p className="text-2xs text-muted normal-case">
        One rework proposal will be drafted from version <span className="font-mono">{versionId}</span>.
      </p>
    </form>
  )
}
