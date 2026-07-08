import type { Constraints, Draft, FlavorClaim, Ingredient, Op, Step } from '../types'
import { list } from '../types'
import type { DiffView, Row, ScalarDiff } from '../lib/mergeDiff'
import { opLineLabel } from '../lib/pathLabels'
import { SR_ADDED, SR_NOW, SR_REMOVED, SR_WAS } from '../vocab'
import { formatValue } from './ProposalCard'

// DishCard is the centerpiece of the redesign stage (design lines 280-384):
// the dish rendered data-driven off a view model, in ONE of two modes —
// plain (the settled/current recipe) or diff (the proposal previewed as the
// would-be recipe, union of same/added/removed/changed rows). Both modes
// share this single render path: `view = diff ?? plainView(draft)`.
//
// The prototype's `buildView` (design lines 1002-1036) faked this with
// ad-hoc `_diff`/`_conceptFrom`/`_sodiumFrom` flags baked into the draft
// object by whatever built the mock. Real proposals don't carry those —
// `mergeDiff` derives the same union from the base draft + RFC-6902 ops.
// Two consequences of that swap, both deliberate:
//   - `analysis` (cost/nutrition) and `constraints` are NOT part of DiffView
//     (mergeDiff routes any op touching them into `other`, not a tracked
//     row/scalar) — so the dashboard, the detail panels, and the station
//     card always read `draft.analysis`/`draft.constraints` directly,
//     diff or not. The prototype's bespoke "sodium ↓ from X" annotation has
//     no structural equivalent here; that change surfaces instead through
//     the generic `other` disclosure line below, per §9 (no silent
//     omission) — it is disclosed, just not as a bespoke inline annotation.
//   - `title` changes are tracked by DiffView but, matching the design
//     (which only ever diff-marks `concept`), are not given special
//     treatment here — the new title renders plainly.
//
// Chips/badges are hand-rolled to the design's exact bordered-outline
// look (border + text, no fill) rather than reusing the pre-redesign
// Chips.tsx primitives (filled variants) — same call TimelineSpine (task 4)
// already made for this design system.
export default function DishCard({ draft, diff, ops, technical, showDetail }: {
  draft: Draft // the current draft; analysis/constraints always read from here
  diff?: DiffView | null
  ops?: Op[] | null // technical JSON-Pointer ops block (design 375-383)
  technical: boolean
  showDetail: boolean
}) {
  const view = diff ?? plainView(draft)
  const { cost, nutrition } = draft.analysis
  // Ops mergeDiff could not preview inline: routed-elsewhere ones already
  // carry a label; failed ones get theirs from the same pathLabels grammar.
  const unpreviewed = diff == null
    ? []
    : [...diff.other.map((o) => o.label), ...diff.failed.map(opLineLabel)]
  const stationChips = buildStationChips(draft.constraints)

  return (
    <>
      {unpreviewed.length > 0 && (
        <p data-testid="dish-card-unpreviewable" className="text-2xs text-muted mb-2">
          Some changes could not be previewed — accepting still applies them.
          {` ${unpreviewed.join(', ')}`}
        </p>
      )}
      <article data-testid="dish-card" className="border border-hairline-strong bg-panel">
        <div className="pt-4 px-[22px] pb-[16px] border-b border-hairline">
          {view.concept.kind === 'changed' && (
            <span className="inline-block mb-[8px] px-[6px] py-px text-[10px] uppercase tracking-[0.1em] border border-success text-success">
              Reworked
            </span>
          )}
          <h3 className="text-[24px] font-bold tracking-[-0.01em] m-0">{view.title.value}</h3>
          <ConceptBlock concept={view.concept} />
          <div className="flex flex-wrap mt-[14px] border border-hairline">
            <DashCell label="Serves" value={String(draft.constraints.servings)} />
            <DashCell label="Cost / serving" value={money(cost.per_serving_usd)} tag="approx" />
            <DashCell label="Calories" value={`${fmt(nutrition.calories)} kcal`} />
            <DashCell label="Sodium / serving" value={`${fmt(nutrition.sodium_mg)} mg`} borderRight={false} />
          </div>
        </div>

        {view.ingredients.length > 0 && (
          <div className="py-[16px] px-[22px] border-b border-hairline">
            <div className="text-2xs uppercase tracking-[0.12em] text-muted mb-[8px]">Ingredients</div>
            {view.ingredients.map((row, i) => <IngredientRow key={i} row={row} technical={technical} />)}
          </div>
        )}

        {view.steps.length > 0 && (
          <div className="py-[16px] px-[22px] border-b border-hairline">
            <div className="text-2xs uppercase tracking-[0.12em] text-muted mb-2">Method</div>
            {view.steps.map((row, i) => <StepRow key={i} row={row} n={i + 1} />)}
          </div>
        )}

        {view.flavorRationale.length > 0 && (
          <div className="py-[16px] px-[22px] border-b border-hairline">
            <div className="text-2xs uppercase tracking-[0.12em] text-muted mb-2">Why it works</div>
            {view.flavorRationale.map((row, i) => <FlavorRow key={i} row={row} />)}
          </div>
        )}

        {showDetail && (
          <div className="grid grid-cols-2 border-b border-hairline">
            <div className="py-[16px] px-[22px] border-r border-hairline">
              <div className="flex items-center gap-[8px] mb-[8px]">
                <span aria-hidden="true" className="w-[8px] h-[8px] rounded-[50%] bg-warning" />
                <span className="text-2xs uppercase tracking-[0.1em] text-muted">Cost — approximate</span>
              </div>
              <div className="font-mono text-[14px]">
                {money(cost.total_usd)} total · {money(cost.per_serving_usd)} / serving
              </div>
              <div className="text-base text-warning mt-[6px] leading-normal">
                {list(cost.missing).length > 0
                  ? `Excludes ${list(cost.missing).join(', ')} — no price on file.`
                  : 'All ingredients priced.'}
              </div>
            </div>
            <div className="py-[16px] px-[22px]">
              <div className="flex items-center gap-[8px] mb-[8px]">
                <span aria-hidden="true" className="w-[8px] h-[8px] rounded-[50%] bg-success" />
                <span className="text-2xs uppercase tracking-[0.1em] text-muted">Nutrition — USDA-verified</span>
              </div>
              <div className="grid grid-cols-2 gap-x-[16px] gap-y-[2px] font-mono text-2xs text-muted">
                <span>protein {fmt(nutrition.protein_g)} g</span><span>carbs {fmt(nutrition.carbs_g)} g</span>
                <span>fat {fmt(nutrition.fat_g)} g</span><span>fiber {fmt(nutrition.fiber_g)} g</span>
                <span>sat fat {fmt(nutrition.sat_fat_g)} g</span><span>sugar {fmt(nutrition.sugar_g)} g</span>
              </div>
              {list(nutrition.unverified).length > 0 && (
                <div className="text-2xs text-warning mt-[6px]">unverified: {list(nutrition.unverified).join(', ')}</div>
              )}
            </div>
          </div>
        )}

        <div className="py-[14px] px-[22px] bg-surface">
          <div className="text-2xs uppercase tracking-[0.12em] text-faint mb-[8px]">Cooking for</div>
          <div className="flex flex-wrap gap-[6px]">
            {stationChips.map(({ k, v }) => (
              <span key={k} className="text-base border border-hairline-strong py-[4px] px-[9px] text-ink">
                <span className="text-faint">{k}</span> {v}
              </span>
            ))}
          </div>
        </div>

        {technical && ops && ops.length > 0 && (
          <div className="py-[14px] px-[22px] border-t border-hairline bg-surface">
            <div className="text-2xs uppercase tracking-[0.1em] text-faint mb-[8px]">Structured diff · JSON-Pointer ops</div>
            {ops.map((op, i) => (
              <div key={i} className="font-mono text-base leading-[1.7] text-muted">
                <span className="text-accent-text">{op.op}</span> {op.path} <span className="text-ink">{opValue(op)}</span>
              </div>
            ))}
          </div>
        )}
      </article>
    </>
  )
}

// plainView wraps a draft with no proposal in flight as a DiffView where
// every row/scalar is 'same' — so the render path above never branches on
// whether a diff is present, only on each row's own kind.
function plainView(draft: Draft): DiffView {
  return {
    title: { kind: 'same', value: draft.title },
    concept: { kind: 'same', value: draft.concept },
    ingredients: list(draft.ingredients).map((value) => ({ kind: 'same' as const, value })),
    steps: list(draft.steps).map((value) => ({ kind: 'same' as const, value })),
    flavorRationale: list(draft.flavor_rationale).map((value) => ({ kind: 'same' as const, value })),
    other: [],
    failed: [],
  }
}

function opValue(op: Op): string {
  if (op.op === 'remove') return op.from !== undefined ? formatValue(op.from) : ''
  return formatValue(op.value)
}

function ConceptBlock({ concept }: { concept: ScalarDiff }) {
  if (concept.kind === 'changed') {
    return (
      <>
        <p className="mt-[8px] text-[15px] leading-normal inline-block px-[4px] py-px text-success bg-success-surface">
          <span className="sr-only">{SR_NOW}</span>
          {concept.value}
        </p>
        <p className="mt-[4px] text-sm leading-normal text-faint line-through">
          <span className="sr-only">{SR_WAS}</span>
          {concept.old}
        </p>
      </>
    )
  }
  return concept.value ? <p className="mt-[8px] text-[15px] leading-normal text-muted">{concept.value}</p> : null
}

function DashCell({ label, value, tag, borderRight = true }: {
  label: string
  value: string
  tag?: string
  borderRight?: boolean
}) {
  return (
    <div className={`flex-1 min-w-[120px] py-2 px-[13px] flex flex-col gap-[3px] ${borderRight ? 'border-r border-hairline' : ''}`}>
      <span className="text-[10px] uppercase tracking-[0.08em] text-faint">{label}</span>
      <span className="font-mono text-md">
        {value}
        {tag && <span className="text-2xs text-warning"> {tag}</span>}
      </span>
    </div>
  )
}

function IngredientRow({ row, technical }: { row: Row<Ingredient>; technical: boolean }) {
  const removed = row.kind === 'removed'
  const added = row.kind === 'added'
  const changed = row.kind === 'changed'
  const rowClass = added ? 'row-add' : changed ? 'row-change' : ''
  const ingredient = row.value
  return (
    <div data-testid="ingredient-row"
      className={`grid grid-cols-[70px_1fr_auto] gap-[12px] items-baseline py-[7px] px-[10px] border-b border-hairline ${rowClass}`}>
      <span className={`font-mono text-sm text-right whitespace-nowrap ${removed ? 'text-faint line-through' : 'text-muted'}`}>
        {removed && <span className="sr-only">{SR_REMOVED}</span>}
        {formatQty(ingredient.qty, ingredient.unit)}
      </span>
      <span className={`text-[14px] flex items-center gap-[8px] flex-wrap ${removed ? 'text-faint line-through' : 'text-ink'}`}>
        {added && <span className="sr-only">{SR_ADDED}</span>}
        {ingredient.name}
        {changed && row.old && (
          <span className="font-mono text-2xs text-faint line-through">
            <span className="sr-only">{SR_WAS}</span>
            {formatQty(row.old.qty, row.old.unit)} {row.old.name}
          </span>
        )}
        {added && (
          <span className="text-[10px] uppercase tracking-[0.06em] px-[5px] border border-success text-success">New</span>
        )}
      </span>
      {technical && (ingredient.fdc_id || ingredient.foodon_id) && (
        <span className="flex gap-[5px] justify-end">
          {ingredient.fdc_id && (
            <span className="font-mono text-2xs text-muted border border-hairline-strong px-[4px]">fdc:{ingredient.fdc_id}</span>
          )}
          {ingredient.foodon_id && (
            <span className="font-mono text-2xs text-muted border border-hairline-strong px-[4px]">foodon:{ingredient.foodon_id}</span>
          )}
        </span>
      )}
    </div>
  )
}

function StepRow({ row, n }: { row: Row<Step>; n: number }) {
  const removed = row.kind === 'removed'
  const added = row.kind === 'added'
  const rowClass = added ? 'row-add' : row.kind === 'changed' ? 'row-change' : ''
  const step = row.value
  const meta = extractStepMeta(step.text)
  return (
    <div data-testid="step-row"
      className={`grid grid-cols-[20px_1fr] gap-[12px] py-[8px] px-[10px] border-b border-hairline ${rowClass}`}>
      <span className="font-mono text-sm text-accent-text">{n}</span>
      <div>
        <div className={`text-[14px] leading-normal flex items-baseline gap-[8px] flex-wrap ${removed ? 'text-faint line-through' : 'text-ink'}`}>
          {removed && <span className="sr-only">{SR_REMOVED}</span>}
          {added && <span className="sr-only">{SR_ADDED}</span>}
          {step.text}
          <span className="text-[10px] uppercase tracking-[0.05em] border border-hairline-strong text-faint px-[5px]">{step.technique}</span>
          {step.internal_temp_c !== null && (
            <span className="font-mono text-2xs text-warning">{step.internal_temp_c}°C internal</span>
          )}
          {meta.map((m) => (
            <span key={m} className="font-mono text-2xs text-muted border border-hairline-strong px-[4px]">{m}</span>
          ))}
          {added && (
            <span className="text-[10px] uppercase tracking-[0.06em] px-[5px] border border-success text-success">New</span>
          )}
        </div>
        {step.why && <div className="text-2xs text-muted mt-[3px]">{step.why}</div>}
      </div>
    </div>
  )
}

function FlavorRow({ row }: { row: Row<FlavorClaim> }) {
  const removed = row.kind === 'removed'
  const added = row.kind === 'added'
  const rowClass = added ? 'row-add' : row.kind === 'changed' ? 'row-change' : ''
  const claim = row.value
  return (
    <div data-testid="flavor-row"
      className={`flex justify-between items-baseline gap-[14px] py-[7px] px-[10px] border-b border-hairline ${rowClass}`}>
      <span className={`text-[14px] leading-normal ${removed ? 'text-faint line-through' : 'text-ink'}`}>
        {removed && <span className="sr-only">{SR_REMOVED}</span>}
        {added && <span className="sr-only">{SR_ADDED}</span>}
        {claim.claim}
      </span>
      {claim.provenance ? (
        <span className="text-2xs text-success whitespace-nowrap">✓ {claim.provenance}</span>
      ) : (
        <span className="text-2xs uppercase tracking-[0.05em] text-muted border border-muted px-[6px] whitespace-nowrap">unverified</span>
      )}
    </div>
  )
}

// buildStationChips (design "Cooking for", lines 365-373): skill/serves/avoid
// (allergens)/equipment/on hand, PLUS dietary and cuisine — the design's own
// stationChips array (line 1103) omitted both; every Constraints field gets a
// home here (§9). Empty array fields render "—", matching what the design
// already did for `avoid` (line 1105) rather than the silent blank the design
// left for equipment/on_hand.
function buildStationChips(c: Constraints): { k: string; v: string }[] {
  const arr = (xs: string[] | null | undefined) => {
    const items = list(xs)
    return items.length > 0 ? items.join(', ') : '—'
  }
  return [
    { k: 'skill', v: c.skill },
    { k: 'serves', v: String(c.servings) },
    { k: 'avoid', v: arr(c.allergens) },
    { k: 'dietary', v: arr(c.dietary) },
    { k: 'equipment', v: arr(c.equipment) },
    { k: 'on hand', v: arr(c.on_hand) },
    { k: 'cuisine', v: c.cuisine || '—' },
  ]
}

const fmt = (v: number) => String(Math.round(v * 10) / 10)
const money = (v: number) => `$${v.toFixed(2)}`

// --- formatQty / extractStepMeta ---
// Verbatim copies of DraftPane's exports (DraftPane dies in task 9; until
// then each component keeps its own — see task 5 brief). Do not edit
// DraftPane's copies from here; they diverge intentionally for one task.

// U+2009 thin space — the house quantity signature (30 ml, 10 g).
const THIN = ' '

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
