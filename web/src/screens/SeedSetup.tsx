import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BIG9_ALLERGENS, CUISINES, SKILLS, type DishDetail } from '../types'
import { createDish } from '../api'

// SeedFormValues is the raw form state; typed constraints are derived on
// submit (servings stays a string until validated).
export interface SeedFormValues {
  seed: string
  allergens: string[]
  skill: string
  servings: string
  dietary: string
  equipment: string
  onHand: string
}

// SeedError pairs a problem with the field it belongs to, so the GOV.UK error
// summary can link each message to its input. A blank field is a form-level
// error (e.g. a failed POST) with no anchor.
export interface SeedError {
  field: '' | 'seed' | 'servings'
  message: string
}

// validateSeedForm returns the field-scoped problems with the form;
// empty means submittable.
export function validateSeedForm(v: SeedFormValues): SeedError[] {
  const errs: SeedError[] = []
  if (v.seed.trim() === '') errs.push({ field: 'seed', message: 'Enter a seed — say what you want to cook.' })
  const n = Number(v.servings)
  if (!Number.isInteger(n) || n < 1) {
    errs.push({ field: 'servings', message: 'Enter servings as a whole number, at least 1.' })
  }
  return errs
}

function splitList(raw: string): string[] {
  return raw.split(',').map((s) => s.trim()).filter((s) => s !== '')
}

const INITIAL: SeedFormValues = {
  seed: '', allergens: [], skill: 'intermediate', servings: '2',
  dietary: '', equipment: '', onHand: '',
}

// Shared field styles: uppercase 11px micro-labels over hairline-strong,
// panel-backed controls (design 97-98, 109-122).
const labelCls = 'block text-2xs uppercase tracking-ui text-muted mb-1'
const inputCls = 'mt-1 w-full border border-hairline-strong bg-panel p-2 text-ink normal-case placeholder:text-muted'

// SeedSetup is the dish-creation screen: a free-text seed plus the typed
// constraint set (FDA Big-9 allergen multiselect as square checkbox chips,
// cuisine fixed to western, skill, servings, free lists) on a quiet
// hairline card.
export default function SeedSetup({ onCreated }: { onCreated: (d: DishDetail) => void }) {
  const [values, setValues] = useState<SeedFormValues>(INITIAL)
  const [errors, setErrors] = useState<SeedError[]>([])
  const [submitting, setSubmitting] = useState(false)
  const summaryRef = useRef<HTMLDivElement>(null)

  // GOV.UK pattern: a failed submit moves focus to the error summary so the
  // problems are announced and reachable by keyboard.
  useEffect(() => {
    if (errors.length > 0) summaryRef.current?.focus()
  }, [errors])

  const errorFor = (field: SeedError['field']) => errors.find((e) => e.field === field)

  function focusField(e: React.MouseEvent, field: string) {
    e.preventDefault()
    document.getElementById(`field-${field}`)?.focus()
  }

  function set<K extends keyof SeedFormValues>(key: K, value: SeedFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  function toggleAllergen(a: string) {
    setValues((v) => ({
      ...v,
      allergens: v.allergens.includes(a) ? v.allergens.filter((x) => x !== a) : [...v.allergens, a],
    }))
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const errs = validateSeedForm(values)
    setErrors(errs)
    if (errs.length > 0) return
    setSubmitting(true)
    try {
      const detail = await createDish({
        seed: values.seed.trim(),
        constraints: {
          dietary: splitList(values.dietary),
          allergens: values.allergens,
          equipment: splitList(values.equipment),
          skill: values.skill,
          servings: Number(values.servings),
          on_hand: splitList(values.onHand),
          cuisine: 'western',
        },
      })
      onCreated(detail)
    } catch (err) {
      setErrors([{ field: '', message: err instanceof Error ? err.message : 'The dish could not be created — try again.' }])
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} data-testid="seed-setup" className="space-y-5">
      <div>
        <div className="text-2xs uppercase tracking-ui text-muted">Start a dish</div>
        <h2 className="mt-2 mb-1 text-2xl font-bold">What do you feel like cooking?</h2>
        <p className="max-w-prose text-md text-muted">
          Bring an idea, a craving, or a leftover. CapyCook develops it with you one grounded
          move at a time — and remembers every version so you can cook it, taste it, and improve it.
        </p>
      </div>

      {errors.length > 0 && (
        <div role="alert" tabIndex={-1} ref={summaryRef}
          className="border-2 border-critical bg-critical-surface p-3 focus:outline-none focus-visible:ring">
          <h3 className="text-2xs font-bold uppercase tracking-ui text-critical">There is a problem</h3>
          <ul className="mt-2 list-disc list-inside space-y-1">
            {errors.map((e, i) => (
              <li key={e.field || i}>
                {e.field
                  ? <a href={`#field-${e.field}`} className="text-critical underline"
                      onClick={(ev) => focusField(ev, e.field)}>{e.message}</a>
                  : <span className="text-critical">{e.message}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <label className={labelCls}>
          Seed — what do you want to cook?
          <textarea id="field-seed" value={values.seed} onChange={(e) => set('seed', e.target.value)} rows={3}
            aria-invalid={errorFor('seed') ? true : undefined}
            aria-describedby={errorFor('seed') ? 'field-seed-error' : undefined}
            className={`${inputCls} min-h-[88px] resize-y text-md`}
            placeholder="e.g. miso carbonara — umami-rich but silky, weeknight-fast" />
        </label>
        {errorFor('seed') && (
          <span id="field-seed-error" className="mt-1 block normal-case text-critical">{errorFor('seed')!.message}</span>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className={labelCls}>
          Anything to keep out? <span className="normal-case text-faint">(FDA Big-9)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {BIG9_ALLERGENS.map((a) => {
            const on = values.allergens.includes(a)
            return (
              <button key={a} type="button" aria-pressed={on} onClick={() => toggleAllergen(a)}
                className={`min-h-[32px] border px-3 py-2 text-2xs uppercase tracking-ui transition ${
                  on ? 'border-accent bg-accent-soft text-ink' : 'border-hairline-strong bg-panel text-ink hover:border-accent'}`}>
                {a}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-3 gap-4">
        <label className={labelCls}>
          Cuisine
          <select value="western" disabled
            className="mt-1 w-full border border-hairline bg-surface p-2 text-muted normal-case">
            {CUISINES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className={labelCls}>
          Skill
          <select value={values.skill} onChange={(e) => set('skill', e.target.value)}
            className={inputCls}>
            {SKILLS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <div>
          <label className={labelCls}>
            Servings
            <input id="field-servings" type="number" min={1} step={1} value={values.servings}
              onChange={(e) => set('servings', e.target.value)}
              aria-invalid={errorFor('servings') ? true : undefined}
              aria-describedby={errorFor('servings') ? 'field-servings-error' : undefined}
              className={`${inputCls} font-mono`} />
          </label>
          {errorFor('servings') && (
            <span id="field-servings-error" className="mt-1 block normal-case text-critical">{errorFor('servings')!.message}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <label className={labelCls}>
          Dietary (comma-separated)
          <input value={values.dietary} onChange={(e) => set('dietary', e.target.value)}
            placeholder="vegetarian, low sodium"
            className={inputCls} />
        </label>
        <label className={labelCls}>
          Equipment (comma-separated)
          <input value={values.equipment} onChange={(e) => set('equipment', e.target.value)}
            placeholder="cast iron, oven"
            className={inputCls} />
        </label>
        <label className={labelCls}>
          On hand (comma-separated)
          <input value={values.onHand} onChange={(e) => set('onHand', e.target.value)}
            placeholder="thyme, lemons"
            className={inputCls} />
        </label>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={submitting}
          className="min-h-[44px] border border-accent px-5 py-3 text-base font-medium uppercase tracking-ui enabled:bg-accent enabled:text-on-accent disabled:border-hairline-strong disabled:bg-surface disabled:text-muted">
          {submitting ? 'Developing…' : 'Develop this dish →'}
        </button>
        <span className="text-2xs text-faint">or press Enter</span>
      </div>
    </form>
  )
}
