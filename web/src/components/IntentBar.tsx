import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { INTENT_EMPTY_ERROR, MOVE_LABEL, SCALE_INVALID_ERROR } from '../vocab'

// IntentRestore is a failed or cancelled move's typed input, handed back by
// Workbench (BC-A-13): the bar clears its fields at dispatch — and unmounts
// entirely while the move is proposing — so it cannot carry the text across
// the outcome itself.
export interface IntentRestore {
  intent?: string
  scale?: string
}

// IntentBar is the idle-state initiation surface (design 406-421): the
// free-text "what do you want to try next?" field the kitchen classifies
// server-side (empty moveType — never a client-side keyword router, the
// design's regex mapping is prototype-mock-only), suggested_next chips
// from the prior proposal, and the deterministic "Just the math —" row for
// the four services that need no rationale.
const primaryBtn = 'border border-accent bg-accent text-on-accent uppercase font-medium text-[12px] tracking-[0.06em] px-[20px] min-h-[44px] whitespace-nowrap transition'
const chipBtn = 'inline-flex items-center gap-[6px] min-h-[32px] px-[11px] border border-hairline-strong bg-panel text-ink font-medium text-[11px] tracking-[0.04em] transition hover:bg-ink hover:text-page'

function AutoTag() {
  return <span className="text-[9px] tracking-[0.06em] uppercase text-success">auto</span>
}

export default function IntentBar({ canPropose, autonomyOn, servings, suggestedNext, onMove, restore }: {
  canPropose: boolean
  autonomyOn: boolean // renders the 'auto' tag on deterministic chips
  servings: number // current, for the scale prompt default (×2)
  suggestedNext: string[] // wire move-type slugs
  onMove: (moveType: string, steer: string) => void
  restore?: IntentRestore | null // a failed/cancelled move's typed input (BC-A-13)
}) {
  const [intent, setIntent] = useState('')
  const [intentError, setIntentError] = useState(false)
  const [scaling, setScaling] = useState(false)
  const [scaleTo, setScaleTo] = useState('')
  const [scaleError, setScaleError] = useState(false)
  const intentRef = useRef<HTMLInputElement>(null)
  const scaleRef = useRef<HTMLInputElement>(null)

  // Typed-input preservation (BC-A-13): a failed or cancelled move never
  // discards what the cook typed. The intent text returns to the field; a
  // scale value reopens the inline scale form pre-filled. Applies on mount
  // (the post-cancel remount) and whenever a fresh restore lands (a failed
  // POST while the bar is still mounted).
  useEffect(() => {
    if (!restore) return
    if (restore.intent !== undefined) setIntent(restore.intent)
    if (restore.scale !== undefined) {
      setScaleTo(restore.scale)
      setScaleError(false)
      setScaling(true)
    }
  }, [restore])

  if (!canPropose) return null

  // Only slugs the house vocab actually names ever become a chip (BC-A-14):
  // an accessible name is either the real move label or the chip does not
  // render — never a raw wire slug standing in for one.
  const namedSuggestions = suggestedNext.filter(
    (slug): slug is keyof typeof MOVE_LABEL => slug in MOVE_LABEL,
  )

  // Empty-guard (BC-A-4): an empty or whitespace-only intent is never a
  // silent no-op — the field is marked invalid, a linked error appears, and
  // focus stays on the field. No move is dispatched.
  function submitIntent() {
    const text = intent.trim()
    if (text === '') {
      setIntentError(true)
      intentRef.current?.focus()
      return
    }
    setIntentError(false)
    onMove('', text)
    setIntent('')
  }

  function onIntentKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitIntent()
    }
  }

  function openScale() {
    setScaleTo(String(servings * 2))
    setScaleError(false)
    setScaling(true)
  }

  // Empty-guard (BC-A-9): blank/zero/negative servings never no-op silently
  // (non-numeric text is the native number input's job, not this guard's).
  function submitScale() {
    const n = Math.trunc(Number(scaleTo))
    if (scaleTo.trim() === '' || !Number.isFinite(n) || n < 1) {
      setScaleError(true)
      scaleRef.current?.focus()
      return
    }
    setScaleError(false)
    onMove('scale_servings', String(n))
    setScaling(false)
  }

  function onScaleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitScale()
    }
  }

  return (
    <div id="cc-steer" className="cc-rise mt-[20px] px-[18px] py-[16px] border border-hairline-strong bg-panel">
      {namedSuggestions.length > 0 && (
        <div className="flex items-center gap-[8px] flex-wrap mb-[12px]">
          <span className="text-[11px] tracking-[0.08em] uppercase text-faint">Try next —</span>
          {namedSuggestions.map((slug) => (
            <button key={slug} type="button" onClick={() => onMove(slug, '')} className={chipBtn}>
              {MOVE_LABEL[slug]}
            </button>
          ))}
        </div>
      )}

      <label htmlFor="cc-intent" className="block text-[11px] tracking-[0.1em] uppercase text-muted mb-[8px]">
        What do you want to try next?
      </label>
      {/* BC-G-12: flex-wrap + min-w-0 on the input — a flex item's default
          min-width is its content/UA-default width (~170-200px for a text
          input), which does not shrink below that just because it's
          flex-1; at 320px viewport that pushed "Try it →" 49px past the
          right edge. min-w-0 lets it shrink to whatever's left; flex-wrap
          is the fallback if even that isn't enough room. */}
      <div className="flex flex-wrap gap-[10px] items-start">
        <input id="cc-intent" ref={intentRef} value={intent} onChange={(e) => setIntent(e.target.value)}
          onKeyDown={onIntentKeyDown}
          aria-invalid={intentError ? true : undefined}
          aria-describedby={intentError ? 'cc-intent-error' : undefined}
          placeholder="make it cheaper · add a crunchy element · what pairs with miso?"
          className="flex-1 min-w-0 border border-hairline-strong bg-panel text-ink text-[15px] px-[13px] min-h-[44px]" />
        <button type="button" onClick={submitIntent} className={primaryBtn}>
          Try it →
        </button>
      </div>
      {intentError && (
        <p id="cc-intent-error" role="alert" className="mt-[6px] text-[12px] text-critical">
          <span className="sr-only">Error: </span>{INTENT_EMPTY_ERROR}
        </p>
      )}

      <div className="flex items-center gap-[8px] flex-wrap mt-[12px]">
        <span className="text-[11px] tracking-[0.08em] uppercase text-faint">Just the math —</span>

        {scaling ? (
          <span className="inline-flex items-center gap-[6px]">
            <label htmlFor="cc-scale-servings" className="sr-only">Scale servings to</label>
            <input id="cc-scale-servings" ref={scaleRef} type="number" min={1} step={1} value={scaleTo}
              onChange={(e) => setScaleTo(e.target.value)}
              onKeyDown={onScaleKeyDown}
              aria-invalid={scaleError ? true : undefined}
              aria-describedby={scaleError ? 'cc-scale-servings-error' : undefined}
              className="w-[64px] min-h-[32px] border border-hairline-strong bg-panel text-ink font-mono text-[13px] px-[8px]" />
            <button type="button" onClick={submitScale} className={chipBtn}>
              Scale it →
            </button>
          </span>
        ) : (
          <button type="button" onClick={openScale} className={chipBtn}>
            {MOVE_LABEL.scale_servings}…
            {autonomyOn && <AutoTag />}
          </button>
        )}

        <button type="button" onClick={() => onMove('unit_convert', '')} className={chipBtn}>
          {MOVE_LABEL.unit_convert}
          {autonomyOn && <AutoTag />}
        </button>
        <button type="button" onClick={() => onMove('cost_recompute', '')} className={chipBtn}>
          {MOVE_LABEL.cost_recompute}
          {autonomyOn && <AutoTag />}
        </button>
        <button type="button" onClick={() => onMove('nutrition_recompute', '')} className={chipBtn}>
          {MOVE_LABEL.nutrition_recompute}
          {autonomyOn && <AutoTag />}
        </button>
      </div>
      {scaling && scaleError && (
        <p id="cc-scale-servings-error" role="alert" className="mt-[6px] text-[12px] text-critical">
          <span className="sr-only">Error: </span>{SCALE_INVALID_ERROR}
        </p>
      )}
    </div>
  )
}
