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

// Shared field styles: uppercase 12px labels over hairline controls.
const labelCls = 'block uppercase text-muted'
const inputCls = 'mt-1 w-full border border-hairline-strong bg-page p-1 text-ink normal-case placeholder:text-muted'

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
    <form onSubmit={onSubmit} data-testid="seed-setup"
      className="border border-hairline bg-page p-4 space-y-4">
      <h2 className="uppercase text-muted">Start a dish</h2>

      {errors.length > 0 && (
        <div role="alert" tabIndex={-1} ref={summaryRef}
          className="border border-critical bg-critical-surface p-2 text-critical focus:outline-none focus-visible:ring">
          <h3 className="uppercase font-medium">There is a problem</h3>
          <ul className="mt-1 list-disc list-inside">
            {errors.map((e, i) => (
              <li key={e.field || i}>
                {e.field
                  ? <a href={`#field-${e.field}`} className="underline"
                      onClick={(ev) => focusField(ev, e.field)}>{e.message}</a>
                  : e.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <label className={labelCls}>
          Seed — what do you want to cook?
          <textarea id="field-seed" value={values.seed} onChange={(e) => set('seed', e.target.value)} rows={2}
            aria-invalid={errorFor('seed') ? true : undefined}
            aria-describedby={errorFor('seed') ? 'field-seed-error' : undefined}
            className={inputCls}
            placeholder="e.g. a cozy one-pan chicken dinner" />
        </label>
        {errorFor('seed') && (
          <span id="field-seed-error" className="mt-1 block normal-case text-critical">{errorFor('seed')!.message}</span>
        )}
      </div>

      <fieldset className="space-y-1">
        <legend className={labelCls}>Allergens to avoid (FDA Big-9)</legend>
        <div className="flex flex-wrap gap-1">
          {BIG9_ALLERGENS.map((a) => {
            const on = values.allergens.includes(a)
            return (
              <label key={a}
                className={`flex items-center gap-1 px-2 py-1 border cursor-pointer uppercase transition ${
                  on ? 'border-hairline-strong bg-surface text-ink' : 'border-hairline text-muted hover:border-hairline-strong'}`}>
                <input type="checkbox" checked={on} onChange={() => toggleAllergen(a)}
                  className="appearance-none w-2 h-2 border border-hairline-strong bg-page checked:bg-accent checked:border-accent" />
                {a}
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-3 gap-3">
        <label className={labelCls}>
          Cuisine
          <select value="western" disabled
            className="mt-1 w-full border border-hairline-strong bg-surface p-1 text-muted normal-case">
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
              className={inputCls} />
          </label>
          {errorFor('servings') && (
            <span id="field-servings-error" className="mt-1 block normal-case text-critical">{errorFor('servings')!.message}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
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

      <button type="submit" disabled={submitting}
        className="px-4 py-2 uppercase font-medium enabled:bg-accent enabled:text-on-accent disabled:bg-surface disabled:text-muted">
        {submitting ? 'Starting…' : 'Start dish'}
      </button>
    </form>
  )
}
