import type { VersionItem, VersionsResponse } from '../types'
import { list } from '../types'
import { TRIALS_HEADING } from '../vocab'

// VersionHistory is the TrialStrip's expansion: the dish's trial chain as a
// hairline index list — clickable read-only snapshot selection, the current
// pointer (filled square dot + label), a sibling/branch indicator (versions
// sharing a parent), and Promote for any non-current trial. The post-cook
// "I cooked this" affordance now lives on the strip's current pill
// (TrialStrip), so this list is pure history + promote-to-service.
export default function VersionHistory({ data, selectedId, onSelect, onPromote }: {
  data: VersionsResponse
  selectedId: string | null
  onSelect: (v: VersionItem) => void
  onPromote: (versionId: string) => void
}) {
  const versions = list(data.versions)
  const childCount = new Map<string, number>()
  for (const v of versions) {
    const key = v.parentVersionId ?? '(root)'
    childCount.set(key, (childCount.get(key) ?? 0) + 1)
  }
  return (
    <section data-testid="version-history"
      className="border-t border-hairline p-3 space-y-2 bg-page">
      <h2 className="uppercase text-muted">{TRIALS_HEADING}</h2>
      {versions.length === 0 && (
        <p className="text-muted">No trials yet — accept a proposal to start the record.</p>
      )}
      <ul className="border-t border-hairline">
        {versions.map((v) => {
          const isCurrent = v.id === data.currentVersionId
          const isBranch = (childCount.get(v.parentVersionId ?? '(root)') ?? 0) > 1
          return (
            <li key={v.id}
              className={`border-b border-x border-hairline p-2 ${selectedId === v.id ? 'bg-surface' : 'bg-page'}`}>
              <button type="button" onClick={() => onSelect(v)} className="w-full text-left min-h-[24px]">
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
                {!isCurrent && (
                  <button type="button" onClick={() => onPromote(v.id)}
                    className="ml-auto min-h-[24px] px-2 py-0 uppercase border border-hairline bg-transparent text-ink transition hover:bg-ink hover:text-page">
                    Promote
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
