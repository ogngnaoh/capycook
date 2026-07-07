// Theme preference: 'light' | 'dark' pin the palette via [data-theme] on
// <html>; 'system' clears it so the prefers-color-scheme media query in
// tokens.css decides. Preference persists in localStorage and is applied
// on boot (main.tsx). The header toggle control lands in task 5.3.

export type Theme = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'capycook-theme'

export function setTheme(t: Theme): void {
  if (t === 'system') {
    localStorage.removeItem(THEME_STORAGE_KEY)
    document.documentElement.removeAttribute('data-theme')
    return
  }
  localStorage.setItem(THEME_STORAGE_KEY, t)
  document.documentElement.setAttribute('data-theme', t)
}

export function getTheme(): Theme {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

export function applyStoredTheme(): void {
  const t = getTheme()
  if (t !== 'system') document.documentElement.setAttribute('data-theme', t)
}
