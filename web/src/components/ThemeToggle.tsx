import { useState } from 'react'
import { getTheme, setTheme, type Theme } from '../theme'

const ORDER: Theme[] = ['system', 'light', 'dark']

// ThemeToggle is the header theme control: a ghost button cycling
// system → light → dark. 'system' clears the [data-theme] pin so the
// prefers-color-scheme media query decides; the pins persist in
// localStorage (theme.ts).
export default function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(getTheme)

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]
    setTheme(next)
    setThemeState(next)
  }

  return (
    <button type="button" onClick={cycle} aria-label={`Theme: ${theme} — switch`}
      title="Toggle light / dark"
      className="inline-flex items-center min-h-[32px] px-[10px] uppercase font-medium text-[11px] tracking-[0.08em] border border-hairline-strong bg-transparent text-ink transition hover:bg-ink hover:text-page">
      Theme: {theme}
    </button>
  )
}
