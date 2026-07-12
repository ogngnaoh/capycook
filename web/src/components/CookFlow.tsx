import { useEffect, useRef, useState } from 'react'
import { TASTING_NOTES_PROMPT } from '../vocab'

// CookFlow is the post-cook loop (design 386-404): the collapsed "Cooked
// this version?" row expands into the tasting-notes form, which asks for
// one rework proposal against exactly the trial in service. An empty notes
// string is allowed through — the caller applies the 'Cooked it.' fallback
// copy, this component only carries what the cook typed.
const ghostAccentBtn = 'border border-accent bg-transparent text-accent-text uppercase font-medium text-[12px] tracking-[0.06em] px-[16px] min-h-[40px] transition'
const fillAccentBtn = 'border border-accent bg-accent text-on-accent uppercase font-medium text-[12px] tracking-[0.06em] px-[18px] min-h-[40px] transition'
const ghostBtn = 'border border-hairline-strong bg-panel text-ink uppercase font-medium text-[12px] tracking-[0.06em] px-[16px] min-h-[40px] transition hover:bg-ink hover:text-page'

export default function CookFlow({ versionLabel, onSubmit }: {
  versionLabel: string // "Trial 2"
  // A promise-returning onSubmit reports its outcome: resolving `false`
  // marks a failed rework dispatch — the form stays open with the cook's
  // exact notes (BC-E-5) — while anything else closes and clears.
  onSubmit: (notes: string) => Promise<boolean | void> | void
}) {
  const [tasting, setTasting] = useState(false)
  const [notes, setNotes] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Focus protocol (BC-E-4, GateBar's leave-a-mode pattern): opening the form
  // focuses the notes field; closing it (Cancel or submit) unmounts that
  // field, so focus returns to the "I cooked this" trigger rather than
  // dropping to document.body. wasTasting keeps the initial mount from
  // focusing the trigger unprompted.
  const wasTasting = useRef(false)
  useEffect(() => {
    if (tasting) textareaRef.current?.focus()
    else if (wasTasting.current) triggerRef.current?.focus()
    wasTasting.current = tasting
  }, [tasting])

  // Typed-input preservation (BC-E-5): never clear/close fire-and-forget at
  // dispatch. A promise-returning submit closes only once the outcome is
  // known — a `false` resolve (failed rework POST) keeps the form open with
  // the exact notes, and by design the E-4 close-restore then never fires
  // (nothing closed). On success the dish usually leaves idle, unmounting
  // this form before the close lands; both paths are safe no-ops.
  function submit() {
    const result = onSubmit(notes)
    if (result instanceof Promise) {
      void result.then((ok) => {
        if (ok === false) return
        setTasting(false)
        setNotes('')
      })
    } else {
      setTasting(false)
      setNotes('')
    }
  }

  function cancel() {
    setTasting(false)
    setNotes('')
  }

  if (!tasting) {
    return (
      <div className="cc-rise mt-[16px] px-[16px] py-[14px] border border-hairline bg-panel flex items-center justify-between gap-[12px] flex-wrap">
        <span className="text-[13px] text-muted">
          Cooked this version? Tell CapyCook how it went and it'll rework against exactly this one.{' '}
          <span className="font-mono text-2xs text-faint normal-case">{versionLabel}</span>
        </span>
        <button type="button" ref={triggerRef} onClick={() => setTasting(true)} className={ghostAccentBtn}>
          I cooked this →
        </button>
      </div>
    )
  }

  return (
    <div className="cc-rise mt-[16px] px-[18px] py-[16px] border border-accent bg-accent-soft">
      <label htmlFor="cc-tasting-notes"
        className="block text-[11px] tracking-[0.1em] uppercase text-accent-text mb-[8px]">
        {TASTING_NOTES_PROMPT}
      </label>
      <textarea id="cc-tasting-notes" ref={textareaRef} value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="e.g. silky, but too salty by the end — more umami without more salt"
        className="w-full min-h-[70px] resize-y border border-hairline-strong bg-panel text-ink text-[14px] leading-normal p-[11px]" />
      <div className="flex gap-[10px] mt-[12px]">
        <button type="button" onClick={submit} className={fillAccentBtn}>
          Rework from these notes
        </button>
        <button type="button" onClick={cancel} className={ghostBtn}>
          Cancel
        </button>
      </div>
    </div>
  )
}
