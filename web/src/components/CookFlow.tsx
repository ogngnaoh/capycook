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
  onSubmit: (notes: string) => void
}) {
  const [tasting, setTasting] = useState(false)
  const [notes, setNotes] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (tasting) textareaRef.current?.focus()
  }, [tasting])

  function submit() {
    onSubmit(notes)
    setTasting(false)
    setNotes('')
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
        <button type="button" onClick={() => setTasting(true)} className={ghostAccentBtn}>
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
