import type { GateVerb } from '../types'

// The gate's single-key shortcuts (brief §5c / P4). Held in localStorage so
// the mapping is remappable and the whole feature is disableable (WCAG 2.1.4)
// without shipping a settings UI: the store is the contract, editable by hand
// under `capycook-gate-shortcuts`. Wire enums never change — only the key that
// dispatches each verb.
export type GateShortcuts = {
  enabled: boolean
  map: Record<GateVerb, string>
}

const STORAGE_KEY = 'capycook-gate-shortcuts'

// A accept · E edit · G regenerate · L alternatives · R ask-for-changes ·
// T take over (brief §5c). Single lowercase letters; matching is case-folded.
export const DEFAULT_SHORTCUTS: GateShortcuts = {
  enabled: true,
  map: {
    accept: 'a',
    edit: 'e',
    regenerate: 'g',
    alternatives: 'l',
    redirect: 'r',
    take_over: 't',
  },
}

// Read the stored shortcuts, falling back to defaults for anything missing,
// malformed, or absent (private-mode / no-localStorage throws are swallowed).
// A partial stored map is merged over the defaults so a hand-edit of one key
// never orphans the rest.
export function getShortcuts(): GateShortcuts {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SHORTCUTS
    const parsed = JSON.parse(raw) as Partial<GateShortcuts>
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_SHORTCUTS.enabled,
      map: { ...DEFAULT_SHORTCUTS.map, ...(parsed.map ?? {}) },
    }
  } catch {
    return DEFAULT_SHORTCUTS
  }
}

// Persist the shortcuts. Storage failures (private mode, quota) are non-fatal —
// the feature simply keeps whatever was last read.
export function setShortcuts(next: GateShortcuts): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // no-op — localStorage unavailable
  }
}
