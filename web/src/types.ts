// TypeScript mirrors of the pinned Go contracts (end-to-end build spec §4).
// Draft/Proposal JSON is snake_case exactly as internal/draft and
// internal/proposal marshal it; the HTTP envelope keys are camelCase exactly
// as internal/httpapi marshals them. Go nil slices arrive as null — use
// list() when rendering.

// --- enums (spec §4 wire enums) ---

export const BIG9_ALLERGENS = [
  'milk', 'eggs', 'fish', 'crustacean shellfish', 'tree nuts',
  'peanuts', 'wheat', 'soybeans', 'sesame',
] as const
export type Allergen = (typeof BIG9_ALLERGENS)[number]

export const SKILLS = ['beginner', 'intermediate', 'advanced'] as const
export type Skill = (typeof SKILLS)[number]

export const CUISINES = ['western'] as const

export type GateVerb = 'accept' | 'edit' | 'regenerate' | 'alternatives' | 'redirect' | 'take_over'

export const MOVE_TYPES = [
  'seed_expand', 'flavor_direction', 'ingredient_change', 'technique_step',
  'iterate_feedback', 'scale_servings', 'unit_convert', 'cost_recompute',
  'nutrition_recompute',
] as const
export type MoveType = (typeof MOVE_TYPES)[number]

// list normalizes Go's nil-slice-as-null for rendering.
export function list<T>(xs: T[] | null | undefined): T[] {
  return xs ?? []
}

// --- internal/draft ---

export interface Ingredient {
  name: string
  fdc_id: string | null
  foodon_id: string | null
  qty: number
  unit: string
}

export interface Step {
  text: string
  technique: string
  internal_temp_c: number | null
  why: string
}

export interface FlavorClaim {
  claim: string
  provenance: string | null // null => [unverified]
  cuisine_context: string
}

export interface Constraints {
  dietary: string[] | null
  allergens: string[] | null // FDA Big-9 enum values only
  equipment: string[] | null
  skill: string // beginner|intermediate|advanced
  servings: number
  on_hand: string[] | null
  cuisine: string // enum, v0: "western"
}

export interface CostAnalysis {
  total_usd: number
  per_serving_usd: number
  approximate: boolean
  missing: string[] | null
}

export interface NutritionAnalysis {
  calories: number
  protein_g: number
  fat_g: number
  sat_fat_g: number
  carbs_g: number
  fiber_g: number
  sugar_g: number
  sodium_mg: number
  unverified: string[] | null
}

export interface Analysis {
  cost: CostAnalysis
  nutrition: NutritionAnalysis
}

export interface Draft {
  title: string
  concept: string
  flavor_rationale: FlavorClaim[] | null
  ingredients: Ingredient[] | null
  steps: Step[] | null
  constraints: Constraints
  analysis: Analysis
}

// --- internal/proposal ---

export interface Op {
  op: 'add' | 'remove' | 'replace'
  path: string // RFC-6901 JSON Pointer
  value?: unknown
  from?: unknown // old value on replace
}

export interface Citation {
  source: string
  ref: string
  date: string
}

export interface Safety {
  status: 'pass' | 'blocked'
  reasons: string[] | null
  rule_ids: string[] | null
}

export interface Proposal {
  id: string
  move_id: string
  move_type: string
  target_fields: string[] | null
  change: Op[] | null
  rationale: string
  citations: Citation[] | null
  confidence: number
  unverified: string[] | null
  safety: Safety
  suggested_next: string[] | null
}

// --- HTTP envelope (internal/httpapi wire shapes) ---

export type DishState = 'idle' | 'proposing' | 'awaiting_gate' | 'blocked'

export interface DishSummary {
  id: string
  title: string
  updated_at: string
}

export interface BlockedInfo {
  moveId: string
  reason: string
  ruleId: string
}

export interface DishDetail {
  id: string
  seed: string
  autonomyDial: boolean
  currentVersionId: string | null
  createdAt: string
  state: DishState
  draft: Draft
  pendingProposal?: Proposal
  pendingProposals?: Proposal[]
  inFlightMoveId?: string
  blocked?: BlockedInfo
}

export interface CreateDishRequest {
  seed: string
  constraints: Constraints
  autonomy_dial?: boolean
}

export interface MoveResponse {
  moveId: string
}

export interface CancelResponse {
  cancelled: boolean
}

export interface GateEditPayload {
  ops?: Op[] // verb edit
  draft?: Draft // verb take_over
  steer?: string // verb redirect
}

export interface GateRequestBody {
  proposalId: string
  verb: GateVerb
  edit?: GateEditPayload
  confirmOverride?: boolean
}

export interface GateResponse {
  verb: GateVerb
  proposalId: string
  newVersionId?: string
  newMoveId?: string
  overridden?: boolean
}

export interface VersionItem {
  id: string
  parentVersionId: string | null
  createdAt: string
  draft: Draft
}

export interface VersionsResponse {
  currentVersionId: string | null
  versions: VersionItem[] | null
}

export interface DialResponse {
  id: string
  autonomyDial: boolean
}

export interface PromoteResponse {
  currentVersionId: string
}

// GET /api/status (internal/httpapi LLMStatus): which model edge is wired
// (stub vs live) and the budget meter — drives the workbench stub banner.
export interface LLMStatusResponse {
  llm_mode: 'stub' | 'live'
  model?: string
  budget_spent_usd: number
  budget_cap_usd: number
}

// --- SSE payloads (internal/transport wire shapes) ---

export interface TokenEvent {
  moveId: string
  text: string
}

export interface ProposalReadyEvent {
  moveId: string
  proposal: Proposal
}

export interface ProposalBlockedEvent {
  moveId: string
  reason: string
  ruleId: string
}

export interface MoveCancelledEvent {
  moveId: string
}

export interface MoveFailedEvent {
  moveId: string
  reason: string
}
