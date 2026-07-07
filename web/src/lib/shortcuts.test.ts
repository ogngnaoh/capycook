import { DEFAULT_SHORTCUTS, getShortcuts, setShortcuts } from './shortcuts'

beforeEach(() => {
  localStorage.clear()
})

test('defaults when nothing is stored (A · E · G · L · R · T, enabled)', () => {
  const s = getShortcuts()
  expect(s.enabled).toBe(true)
  expect(s.map).toEqual({
    accept: 'a',
    edit: 'e',
    regenerate: 'g',
    alternatives: 'l',
    redirect: 'r',
    take_over: 't',
  })
})

test('a partial stored map is merged over the defaults', () => {
  localStorage.setItem('capycook-gate-shortcuts', JSON.stringify({ enabled: true, map: { accept: 'y' } }))
  const s = getShortcuts()
  expect(s.map.accept).toBe('y') // remapped
  expect(s.map.regenerate).toBe('g') // default survives
})

test('setShortcuts persists and getShortcuts reads it back', () => {
  const next = { enabled: true, map: { ...DEFAULT_SHORTCUTS.map, redirect: 'x' } }
  setShortcuts(next)
  expect(getShortcuts()).toEqual(next)
})

test('the whole feature is disableable (WCAG 2.1.4)', () => {
  setShortcuts({ enabled: false, map: DEFAULT_SHORTCUTS.map })
  expect(getShortcuts().enabled).toBe(false)
})

test('corrupt JSON falls back to defaults instead of throwing', () => {
  localStorage.setItem('capycook-gate-shortcuts', '{not json')
  expect(getShortcuts()).toEqual(DEFAULT_SHORTCUTS)
})
