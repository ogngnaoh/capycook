import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Constraints, Draft, Ingredient } from '../types'
import { list } from '../types'
import { EMPTY_DRAFT, STATION_CARD } from '../vocab'
import { ApproximateChip, Chip, UnverifiedChip } from './Chips'

// U+2009 thin space — the house quantity signature (30 ml, 10 g). Reserved
// for the aligned ingredient column; the dashboard line keeps plain spaces
// so its fiche format matches the brief verbatim.
const THIN = ' '
const PROVENANCE_LEGEND = 'sourced — USDA FoodData Central · FoodOn'

// Mass units we can normalize to grams. A recipe is "all mass" only when
// every ingredient carries one of these; anything else (piece, ml, sprig)
// suppresses grams/portion and the baker's-percent column entirely.
const MASS_TO_G: Record<string, number> = { g: 1, kg: 1000, mg: 0.001 }

// DraftPane renders the versioned dish draft as a test kitchen's standardized
// recipe card (fiche technique): title/concept, a one-line dashboard that
// expands to the analysis panels, the ingredients as an aligned quantity
// table, the numbered method with time/temp chips pulled out of the prose,
// the flavor rationale, and a provenance footer legend. The STATION CARD
// (constraints) and the pending proposal/verb panels (children) sit below.
// emptyNote overrides the empty-state line so it always invites an act that
// is actually available (e.g. reviewing a pending proposal).
export default function DraftPane({ draft, heading = 'Draft', emptyNote, children }: {
  draft: Draft
  heading?: string
  emptyNote?: string
  children?: ReactNode
}) {
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const ingredients = list(draft.ingredients)
  const steps = list(draft.steps)
  const claims = list(draft.flavor_rationale)
  const mass = analyzeMass(ingredients)
  const segments = dashboardSegments(draft, mass)
  const empty = draft.title === '' && ingredients.length === 0 && steps.length === 0
  return (
    <section data-testid="draft-pane" className="flex-1 min-w-0 p-3 space-y-3">
      <h2 className="uppercase text-muted">{heading}</h2>
      {empty ? (
        <div className="p-3 border border-hairline bg-page text-muted">
          {emptyNote ?? EMPTY_DRAFT}
        </div>
      ) : (
        <div className="p-3 border border-hairline bg-page space-y-3">
          <div>
            <div className="font-medium text-sm text-ink">{draft.title || '(untitled)'}</div>
            {draft.concept && <p className="text-muted">{draft.concept}</p>}
          </div>

          {segments.length > 0 && (
            <div>
              <button type="button"
                aria-expanded={analysisOpen}
                aria-controls="analysis-detail"
                onClick={() => setAnalysisOpen((o) => !o)}
                className="w-full text-left border-y border-hairline py-1 transition hover:bg-surface">
                <span data-testid="dashboard-line" className="font-mono text-2xs text-ink tabular-nums">
                  {segments.join(' · ')}
                </span>
                <span className="sr-only"> — cost and nutrition detail, activate to expand</span>
              </button>
              <div id="analysis-detail" data-testid="analysis-detail" hidden={!analysisOpen} className="mt-2">
                <AnalysisPanel draft={draft} />
              </div>
            </div>
          )}

          {ingredients.length > 0 && (
            <div>
              <h3 className="uppercase text-muted">Ingredients</h3>
              <table className="mt-1 w-full border-t border-hairline">
                <tbody>
                  {ingredients.map((ing, i) => (
                    <tr key={i} className="border-b border-hairline">
                      <td data-testid={`ing-qty-${i}`}
                        className="py-1 pr-2 align-baseline font-mono text-2xs text-muted text-right tabular-nums whitespace-nowrap">
                        {formatQty(ing.qty, ing.unit)}
                      </td>
                      <td className="py-1 align-baseline text-ink">
                        {ing.name}
                        {(ing.fdc_id || ing.foodon_id) && (
                          <span className="ml-1 inline-flex gap-1 align-baseline">
                            {ing.fdc_id && <Chip variant="neutral">fdc:{ing.fdc_id}</Chip>}
                            {ing.foodon_id && <Chip variant="neutral">foodon:{ing.foodon_id}</Chip>}
                          </span>
                        )}
                      </td>
                      {mass.allMass && mass.anchorG > 0 && (
                        <td className="py-1 pl-2 align-baseline font-mono text-2xs text-muted text-right tabular-nums whitespace-nowrap">
                          {((grams(ing) ?? 0) / mass.anchorG * 100).toFixed(1)}%
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
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
                      {extractStepMeta(s.text).map((c) => (
                        <Chip key={c} variant="neutral">{c}</Chip>
                      ))}
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

          <p className="font-mono text-2xs text-muted">{PROVENANCE_LEGEND}</p>
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

// grams normalizes an ingredient to grams, or null when its unit is not a
// mass unit we recognize.
function grams(ing: Ingredient): number | null {
  const f = MASS_TO_G[ing.unit.trim().toLowerCase()]
  return f == null ? null : ing.qty * f
}

// analyzeMass reports whether the whole ingredient list is expressed in mass
// units (the gate for grams/portion and baker's percentages) plus the total
// and the largest single mass (the 100% baker's anchor).
function analyzeMass(ings: Ingredient[]): { allMass: boolean; totalG: number; anchorG: number } {
  const gs = ings.map(grams)
  if (ings.length === 0 || gs.some((g) => g == null)) return { allMass: false, totalG: 0, anchorG: 0 }
  const nums = gs as number[]
  return { allMass: true, totalG: nums.reduce((a, b) => a + b, 0), anchorG: Math.max(...nums) }
}

// dashboardSegments builds the fiche dashboard row from values already on
// screen: SERVES · g/PORTION · $/SERVING · kcal. Each segment is omitted when
// its data is absent — g/PORTION only when the recipe is all-mass, cost and
// kcal only when non-zero. (~MIN is intentionally absent: the data model
// carries no total-time figure to derive it from.)
function dashboardSegments(draft: Draft, mass: { allMass: boolean; totalG: number }): string[] {
  const segs: string[] = []
  const { servings } = draft.constraints
  const { cost, nutrition } = draft.analysis
  if (servings > 0) segs.push(`SERVES ${servings}`)
  if (mass.allMass && servings > 0) segs.push(`${fmt(mass.totalG / servings)} g/PORTION`)
  if (cost.per_serving_usd > 0) segs.push(`$${cost.per_serving_usd.toFixed(2)}/SERVING`)
  if (nutrition.calories > 0) segs.push(`${fmt(nutrition.calories)} kcal`)
  return segs
}

// formatQty renders a quantity in the house form: value, thin space, unit.
export function formatQty(qty: number, unit: string): string {
  return `${qty}${THIN}${unit}`
}

// extractStepMeta pulls temperatures and times out of step prose so they read
// as headline chips instead of being buried mid-sentence. Temps require an
// explicit degree sign (so "1 c" flour never reads as 1 °C); a lone °C paired
// with a lone °F renders as one paired chip (204 °C / 400 °F). Times require an
// explicit min/hr unit word. Returns [] when nothing matches, so the step
// renders exactly as before.
const TEMP_RE = /(\d+(?:\.\d+)?)\s*°\s*([CF])/gi
const TIME_RE = /(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)\b/gi

export function extractStepMeta(text: string): string[] {
  const temps: { v: string; u: string }[] = []
  for (const m of text.matchAll(TEMP_RE)) temps.push({ v: m[1], u: m[2].toUpperCase() })
  const times: string[] = []
  for (const m of text.matchAll(TIME_RE)) {
    times.push(`${m[1]} ${m[2][0].toLowerCase() === 'h' ? 'hr' : 'min'}`)
  }
  const cs = temps.filter((t) => t.u === 'C')
  const fs = temps.filter((t) => t.u === 'F')
  const tempChips = cs.length === 1 && fs.length === 1
    ? [`${cs[0].v} °C / ${fs[0].v} °F`]
    : temps.map((t) => `${t.v} °${t.u}`)
  return [...tempChips, ...times]
}

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
      <h3 className="uppercase text-muted">{STATION_CARD}</h3>
      {rows.filter(([, v]) => v !== '').map(([k, v]) => (
        <div key={k} className="text-ink">
          <span className="uppercase text-2xs text-muted">{k}:</span> {v}
        </div>
      ))}
    </div>
  )
}
