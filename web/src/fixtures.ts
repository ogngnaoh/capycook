// Shared test fixtures + doubles for the workbench test suite. Not imported
// by application code.
import type { Constraints, DishDetail, Draft, Proposal } from './types'

export function emptyConstraints(): Constraints {
  return {
    dietary: [], allergens: [], equipment: [],
    skill: 'intermediate', servings: 2, on_hand: [], cuisine: 'western',
  }
}

export function sampleDraft(over: Partial<Draft> = {}): Draft {
  return {
    title: 'Seared Chicken Thighs',
    concept: 'Crispy skin with a thyme pan sauce.',
    flavor_rationale: [
      { claim: 'thyme pairs with chicken', provenance: null, cuisine_context: 'western' },
    ],
    ingredients: [
      { name: 'chicken thigh', fdc_id: null, foodon_id: null, qty: 4, unit: 'piece' },
      { name: 'thyme', fdc_id: null, foodon_id: null, qty: 2, unit: 'sprig' },
    ],
    steps: [
      { text: 'Sear skin-side down until crisp.', technique: 'saute', internal_temp_c: 74, why: 'render the fat' },
    ],
    constraints: emptyConstraints(),
    analysis: {
      cost: { total_usd: 8.4, per_serving_usd: 4.2, approximate: true, missing: [] },
      nutrition: {
        calories: 520, protein_g: 34, fat_g: 40, sat_fat_g: 11,
        carbs_g: 2, fiber_g: 0, sugar_g: 0, sodium_mg: 640, unverified: [],
      },
    },
    ...over,
  }
}

export function sampleProposal(over: Partial<Proposal> = {}): Proposal {
  return {
    id: 'pr_1',
    move_id: 'mv_1',
    move_type: 'seed_expand',
    target_fields: ['title'],
    change: [{ op: 'replace', path: '/title', from: 'Old Title', value: 'New Title' }],
    rationale: 'A tighter concept.',
    citations: [{ source: 'USDA FDC', ref: '11215', date: '2026-07-06' }],
    confidence: 0.72,
    unverified: ['cook time is an estimate'],
    safety: { status: 'pass', reasons: [], rule_ids: [] },
    suggested_next: ['technique_step', 'ingredient_change'],
    ...over,
  }
}

export function dishDetail(over: Partial<DishDetail> = {}): DishDetail {
  return {
    id: 'd1',
    seed: 'a cozy chicken dinner',
    autonomyDial: true,
    currentVersionId: 'ver_1',
    createdAt: '2026-07-06T00:00:00Z',
    state: 'idle',
    draft: sampleDraft(),
    ...over,
  }
}

export function jsonResponse(data: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => data } as Response
}

// MockEventSource stands in for the browser EventSource: tests emit named
// SSE events and drive open/error to exercise the reconnect path.
export class MockEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  static instances: MockEventSource[] = []
  static reset() { MockEventSource.instances = [] }

  url: string
  readyState: number = MockEventSource.CONNECTING
  onopen: ((ev?: unknown) => void) | null = null
  onerror: ((ev?: unknown) => void) | null = null
  private listeners = new Map<string, Array<(ev: MessageEvent) => void>>()

  constructor(url: string) {
    this.url = url
    MockEventSource.instances.push(this)
  }

  addEventListener(name: string, fn: (ev: MessageEvent) => void) {
    const arr = this.listeners.get(name) ?? []
    arr.push(fn)
    this.listeners.set(name, arr)
  }

  removeEventListener() {}

  close() { this.readyState = MockEventSource.CLOSED }

  open() {
    this.readyState = MockEventSource.OPEN
    this.onopen?.()
  }

  fail() { this.onerror?.() }

  emit(name: string, payload: unknown) {
    for (const fn of this.listeners.get(name) ?? []) {
      fn({ data: JSON.stringify(payload) } as MessageEvent)
    }
  }
}
