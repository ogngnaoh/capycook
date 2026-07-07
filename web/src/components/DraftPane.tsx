import type { ReactNode } from 'react'
import type { Constraints, Draft } from '../types'
import { list } from '../types'
import { ApproximateChip, Chip, UnverifiedChip } from './Chips'

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
    <section data-testid="draft-pane" className="flex-1 min-w-0 p-3 space-y-3">
      <h2 className="uppercase text-muted">{heading}</h2>
      {empty ? (
        <div className="p-3 border border-hairline bg-page text-muted">
          Empty draft — propose the first move to sketch the dish.
        </div>
      ) : (
        <div className="p-3 border border-hairline bg-page space-y-3">
          <div>
            <div className="font-medium text-sm text-ink">{draft.title || '(untitled)'}</div>
            {draft.concept && <p className="text-muted">{draft.concept}</p>}
          </div>

          {ingredients.length > 0 && (
            <div>
              <h3 className="uppercase text-muted">Ingredients</h3>
              <ul className="mt-1 border-t border-hairline">
                {ingredients.map((ing, i) => (
                  <li key={i} className="flex flex-wrap items-baseline gap-1 py-1 border-b border-hairline">
                    <span className="font-mono text-2xs text-muted w-7 shrink-0">{ing.qty} {ing.unit}</span>
                    <span className="text-ink">{ing.name}</span>
                    {ing.fdc_id && <Chip variant="neutral">fdc:{ing.fdc_id}</Chip>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {steps.length > 0 && (
            <div>
              <h3 className="uppercase text-muted">Steps</h3>
              <ol className="mt-1 space-y-1 list-decimal list-inside text-ink">
                {steps.map((s, i) => (
                  <li key={i}>
                    {s.text}
                    <span className="ml-1 inline-flex gap-1">
                      <Chip variant="neutral">{s.technique}</Chip>
                      {s.internal_temp_c !== null && (
                        <Chip variant="neutral">{s.internal_temp_c}°C internal</Chip>
                      )}
                    </span>
                    {s.why && <span className="block text-2xs text-muted ml-4">why: {s.why}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {claims.length > 0 && (
            <div>
              <h3 className="uppercase text-muted">Flavor rationale</h3>
              <ul className="mt-1 space-y-1 text-ink">
                {claims.map((c, i) => (
                  <li key={i}>
                    {c.claim}
                    {' '}
                    {c.provenance
                      ? <Chip variant="info">{c.provenance}</Chip>
                      : <UnverifiedChip />}
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
// unrounded floats (per-100g arithmetic), which the panel shows to at most
// one decimal.
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
    <div className="grid grid-cols-2 gap-3">
      <div className="border border-hairline p-2 space-y-1">
        <h3 className="uppercase text-muted">
          Cost {cost.approximate && <ApproximateChip />}
        </h3>
        <div className="font-mono text-2xs text-ink">
          ${cost.total_usd.toFixed(2)} total · ${cost.per_serving_usd.toFixed(2)} / serving
        </div>
        {list(cost.missing).length > 0 && (
          <div className="text-2xs text-muted">unpriced (excluded): {list(cost.missing).join(', ')}</div>
        )}
      </div>
      <div className="border border-hairline p-2 space-y-1">
        <h3 className="uppercase text-muted">Nutrition / serving</h3>
        <dl className="grid grid-cols-2 gap-x-2 font-mono text-2xs">
          {nutritionRows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-1">
              <dt className="text-muted font-sans">{k}</dt>
              <dd className="text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        {list(nutrition.unverified).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {list(nutrition.unverified).map((u) => <UnverifiedChip key={u} label={u} />)}
          </div>
        )}
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
    <div className="p-3 border border-hairline bg-page space-y-1">
      <h3 className="uppercase text-muted">Constraints</h3>
      {rows.filter(([, v]) => v !== '').map(([k, v]) => (
        <div key={k} className="text-ink">
          <span className="uppercase text-2xs text-muted">{k}:</span> {v}
        </div>
      ))}
    </div>
  )
}
