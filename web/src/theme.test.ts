import { applyStoredTheme, getTheme, setTheme, THEME_STORAGE_KEY } from './theme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

test('setTheme("dark") stamps data-theme and stores the preference', () => {
  setTheme('dark')
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
})

test('setTheme("light") stamps data-theme and stores the preference', () => {
  setTheme('light')
  expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
})

test('setTheme("system") clears the attribute and the stored preference', () => {
  setTheme('dark')
  setTheme('system')
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
})

test('getTheme reads the stored preference, defaulting to system', () => {
  expect(getTheme()).toBe('system')
  setTheme('dark')
  expect(getTheme()).toBe('dark')
})

test('applyStoredTheme stamps the stored preference on boot', () => {
  localStorage.setItem(THEME_STORAGE_KEY, 'dark')
  applyStoredTheme()
  expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
})

test('applyStoredTheme ignores an unknown stored value', () => {
  localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
  applyStoredTheme()
  expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
})
