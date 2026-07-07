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
      className="px-2 py-1 uppercase border border-hairline bg-transparent text-ink transition hover:bg-ink hover:text-page">
      Theme: {theme}
    </button>
  )
}
