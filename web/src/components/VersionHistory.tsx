import type { VersionItem, VersionsResponse } from '../types'
import { list } from '../types'

// VersionHistory renders the dish's version chain: clickable read-only
// snapshot selection, a sibling/branch indicator (versions sharing a
// parent), the current pointer, and promote for any non-current version.
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
      className="w-72 shrink-0 border-l border-gray-300 p-4 space-y-2 overflow-y-auto">
      <h2 className="text-xs uppercase tracking-wide text-gray-500">Versions</h2>
      {versions.length === 0 && <p className="text-sm text-gray-400">No versions yet.</p>}
      <ul className="space-y-1">
        {versions.map((v) => {
          const isCurrent = v.id === data.currentVersionId
          const isBranch = (childCount.get(v.parentVersionId ?? '(root)') ?? 0) > 1
          return (
            <li key={v.id}
              className={`border rounded p-2 text-sm bg-white ${selectedId === v.id ? 'border-gray-800' : 'border-gray-200'}`}>
              <button type="button" onClick={() => onSelect(v)} className="w-full text-left">
                <span className="font-medium">{v.draft.title || '(untitled)'}</span>
                <span className="block text-xs text-gray-400 font-mono">{v.id}</span>
                <span className="block text-xs text-gray-400">{new Date(v.createdAt).toLocaleString()}</span>
              </button>
              <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                {isCurrent && <span className="px-1.5 py-0.5 bg-gray-800 text-white rounded">current</span>}
                {isBranch && <span className="px-1.5 py-0.5 bg-gray-300 rounded">branch</span>}
                {!isCurrent && (
                  <button type="button" onClick={() => onPromote(v.id)}
                    className="ml-auto px-2 py-0.5 border border-gray-400 rounded">Promote</button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
