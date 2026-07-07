import { useRef } from 'react'

// RailTab is which of the three narrow-viewport surfaces owns the screen below
// --bp-md: the recipe canvas, the development rail, or the trial record. On
// desktop (≥ md) all three show at once and this value is inert.
export type RailTab = 'recipe' | 'develop' | 'history'

// Each tab points at the region it reveals below md (aria-controls). The ids
// are the region wrappers Workbench toggles: the canvas scroll area, the
// steering pane (its existing skip-link anchor), and the trial strip.
const TABS: ReadonlyArray<{ id: RailTab; label: string; controls: string }> = [
  { id: 'recipe', label: 'Recipe', controls: 'canvas-region' },
  { id: 'develop', label: 'Develop', controls: 'steering-anchor' },
  { id: 'history', label: 'History', controls: 'trial-strip-region' },
]

// RailTabs is the narrow-viewport bottom navigation (brief §5b): below --bp-md
// the right rail and record strip collapse into three tabs — Recipe · Develop ·
// History — and the selected tab controls which region owns the canvas. It is
// an APG tab bar: role=tablist/tab, aria-selected, roving tabindex (one tab
// stop), Left/Right (wrap) + Home/End with automatic activation. The component
// always renders; `md:hidden` keeps it off the desktop layout, so the collapse
// is purely additive below the breakpoint (desktop stays pixel-identical).
export default function RailTabs({ active, onChange }: {
  active: RailTab
  onChange: (t: RailTab) => void
}) {
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([])
  const activeIndex = Math.max(0, TABS.findIndex((t) => t.id === active))

  function select(index: number) {
    onChange(TABS[index].id)
    btnRefs.current[index]?.focus()
  }

  // Roving tabindex with automatic activation (the APG tabs default): an arrow
  // both moves focus and selects; Home/End hit the ends; Left/Right wrap.
  function onKeyDown(e: React.KeyboardEvent) {
    const n = TABS.length
    let next = activeIndex
    switch (e.key) {
      case 'ArrowRight': next = (activeIndex + 1) % n; break
      case 'ArrowLeft': next = (activeIndex - 1 + n) % n; break
      case 'Home': next = 0; break
      case 'End': next = n - 1; break
      default: return
    }
    e.preventDefault()
    select(next)
  }

  return (
    <div role="tablist" aria-label="Workbench view" aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      className="md:hidden flex divide-x divide-hairline border-t border-hairline bg-page">
      {TABS.map((t, i) => (
        <button key={t.id} type="button" role="tab"
          ref={(el) => { btnRefs.current[i] = el }}
          id={`rail-tab-${t.id}`}
          aria-selected={t.id === active}
          aria-controls={t.controls}
          tabIndex={t.id === active ? 0 : -1}
          onClick={() => onChange(t.id)}
          className={`flex-1 min-h-[24px] px-2 py-2 uppercase text-center transition ${
            t.id === active
              ? 'bg-ink text-page font-medium'
              : 'bg-page text-ink hover:bg-surface'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
