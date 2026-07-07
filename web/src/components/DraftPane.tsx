import type { ReactNode } from 'react'
import type { Constraints, Draft } from '../types'
import { list } from '../types'

// DraftPane renders the versioned dish draft (internal/draft shape):
// title/concept, ingredients, steps, flavor rationale, constraints, and the
// deterministic analysis panels. children carries the pending proposal
// card(s) and verb panels the workbench pins under the draft.
export default function DraftPane({ draft, heading = 'Draft', children }: {
  draft: Draft
  heading?: string
  children?: ReactNode
}) {
  const ingredients = list(draft.ingredients)
  const steps = list(draft.steps)
  const claims = list(draft.flavor_rationale)
  const empty = draft.title === '' && ingredients.length === 0 && steps.length === 0
  return (
    <section data-testid="draft-pane" className="flex-1 min-w-0 p-4 space-y-3">
      <h2 className="text-xs uppercase tracking-wide text-gray-500">{heading}</h2>
      {empty ? (
        <div className="p-3 bg-white border border-gray-200 rounded text-sm text-gray-400">
          Empty draft — propose a move to begin.
        </div>
      ) : (
        <div className="p-3 bg-white border border-gray-200 rounded text-sm space-y-3">
          <div>
            <div className="font-semibold text-gray-900">{draft.title || '(untitled)'}</div>
            {draft.concept && <p className="text-gray-600">{draft.concept}</p>}
          </div>

          {ingredients.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-gray-400">Ingredients</h3>
              <ul className="mt-1 space-y-0.5">
                {ingredients.map((ing, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-1">
                    <span className="font-mono text-xs text-gray-500">{ing.qty} {ing.unit}</span>
                    <span>{ing.name}</span>
                    {ing.fdc_id && <span className="px-1 text-xs bg-gray-200 rounded">fdc:{ing.fdc_id}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {steps.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-gray-400">Steps</h3>
              <ol className="mt-1 space-y-1 list-decimal list-inside">
                {steps.map((s, i) => (
                  <li key={i}>
                    {s.text}
                    <span className="ml-1 px-1 text-xs bg-gray-200 rounded font-mono">{s.technique}</span>
                    {s.internal_temp_c !== null && (
                      <span className="ml-1 px-1 text-xs bg-gray-200 rounded">{s.internal_temp_c}°C internal</span>
                    )}
                    {s.why && <span className="block text-xs text-gray-500 ml-4">why: {s.why}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {claims.length > 0 && (
            <div>
              <h3 className="text-xs uppercase tracking-wide text-gray-400">Flavor rationale</h3>
              <ul className="mt-1 space-y-0.5">
                {claims.map((c, i) => (
                  <li key={i}>
                    {c.claim}
                    {c.provenance
                      ? <span className="ml-1 px-1 text-xs bg-gray-200 rounded">{c.provenance}</span>
                      : <span className="ml-1 px-1 text-xs bg-yellow-200 rounded">[unverified]</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <AnalysisPanel draft={draft} />
        </div>
      )}
      <ConstraintsSummary c={draft.constraints} />
      {children}
    </section>
  )
}

// fmt rounds analysis values for display: the real services hand back
// unrounded floats (per-100g arithmetic), which the graybox panel shows to
// at most one decimal.
const fmt = (v: number) => String(Math.round(v * 10) / 10)

function AnalysisPanel({ draft }: { draft: Draft }) {
  const { cost, nutrition } = draft.analysis
  const nutritionRows: [string, string][] = [
    ['calories', fmt(nutrition.calories)],
    ['protein', `${fmt(nutrition.protein_g)} g`],
    ['fat', `${fmt(nutrition.fat_g)} g`],
    ['sat fat', `${fmt(nutrition.sat_fat_g)} g`],
    ['carbs', `${fmt(nutrition.carbs_g)} g`],
    ['fiber', `${fmt(nutrition.fiber_g)} g`],
    ['sugar', `${fmt(nutrition.sugar_g)} g`],
    ['sodium', `${fmt(nutrition.sodium_mg)} mg`],
  ]
  return (
    <div className="grid grid-cols-2 gap-3 text-xs">
      <div className="border border-gray-200 rounded p-2 space-y-1">
        <h3 className="uppercase tracking-wide text-gray-400">
          Cost {cost.approximate && <span className="px-1 bg-gray-200 rounded normal-case">[approximate]</span>}
        </h3>
        <div>${cost.total_usd.toFixed(2)} total · ${cost.per_serving_usd.toFixed(2)} / serving</div>
        {list(cost.missing).length > 0 && (
          <div className="text-gray-500">unpriced (excluded): {list(cost.missing).join(', ')}</div>
        )}
      </div>
      <div className="border border-gray-200 rounded p-2 space-y-1">
        <h3 className="uppercase tracking-wide text-gray-400">Nutrition / serving</h3>
        <dl className="grid grid-cols-2 gap-x-2">
          {nutritionRows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-1">
              <dt className="text-gray-500">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        {list(nutrition.unverified).map((u) => (
          <span key={u} className="inline-block px-1 bg-yellow-200 rounded mr-1">[unverified] {u}</span>
        ))}
      </div>
    </div>
  )
}

function ConstraintsSummary({ c }: { c: Constraints }) {
  const rows: [string, string][] = [
    ['cuisine', c.cuisine],
    ['skill', c.skill],
    ['servings', String(c.servings)],
    ['allergens', list(c.allergens).join(', ')],
    ['dietary', list(c.dietary).join(', ')],
    ['equipment', list(c.equipment).join(', ')],
    ['on hand', list(c.on_hand).join(', ')],
  ]
  return (
    <div className="p-3 bg-white border border-gray-200 rounded text-xs space-y-0.5">
      <h3 className="uppercase tracking-wide text-gray-400">Constraints</h3>
      {rows.filter(([, v]) => v !== '').map(([k, v]) => (
        <div key={k}>
          <span className="text-gray-500">{k}:</span> {v}
        </div>
      ))}
    </div>
  )
}
