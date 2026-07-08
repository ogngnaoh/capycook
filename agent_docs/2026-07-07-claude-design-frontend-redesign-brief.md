# CapyCook — Frontend Redesign Brief for Claude Design

> **What this is.** A single, self-contained package to hand to Claude Design for a
> **frontend information-architecture redesign** of CapyCook. Everything Claude Design
> needs is inlined here: the product, the user, the exact data model, the API/streaming
> contract the UI must honor, an honest read of what's wrong with today's IA, and a
> proposed cook-first direction to react to.
>
> **Scope.** Redesign the **frontend IA + interaction surface only.** The Go backend, the
> HTTP/SSE API, and the data model are **fixed and strong — do not change them.** The
> redesign must talk to exactly the contract in §4/§5 and must preserve every capability
> in §7. Visual styling is open (that's what Claude Design is for); the *organization of
> information* is the real target.
>
> **How to read it.** §1–3 = what/why/who. §4–5 = the hard technical contract (inline
> TypeScript + endpoints). §6 = what exists today (with a screenshot index). §7 = the
> diagnosis (why today's IA fights the cook). §8 = a proposed direction. §9 = the
> non-negotiables. §10 = the redesign work-list.

---

## 1. The product in one page

**CapyCook is a Dish Development Workbench** — an open-source, self-hostable,
**human-in-the-loop** system where a serious home cook co-develops a dish with an
interruptible AI orchestrator through **gated turns**. The cook brings an idea; the
system proposes one move at a time (a flavor direction, an ingredient change, a technique
step), grounds and costs it, and **stops at a gate** for the cook to accept, tweak,
redirect, or take over. Nothing changes the recipe without the cook's say-so.

It is deliberately **not** a recipe generator. A chatbot hands you a finished recipe;
CapyCook is a **co-development loop** you iterate with over days — including *after* you
cook, against the exact version you made.

**The three things that make it different from "just ask ChatGPT":**

1. **A versioned, branchable dish** — every accepted change is a snapshot with a diff and
   a parent, so you can compare trials, branch variations, and iterate against the version
   you actually cooked. (This durability is the headline differentiator.)
2. **Deterministic truth you can trust** — scaling, **nutrition (USDA-authoritative)**, and
   **cost (a clearly-labeled *approximate* table)** are computed by plain functions, never
   hallucinated. Flavor claims carry provenance or are labeled `[unverified]`.
3. **A deterministic safety gate that can hard-block** a dangerous proposal (e.g. an
   anaerobic oil infusion → botulism vector) before it ever reaches the cook.

**Important framing for the redesign:** the project's stated goal is that it *reads as
real engineering* — a hand-rolled gated state machine, a versioned data model, honest
grounding, an eval harness. **But that is the backend's job to be, not the frontend's job
to shout.** The frontend's job is to let a cook do their work intuitively, with the
engineering showing through as **trustworthiness and durability**, not as the organizing
principle. Today's UI inverts that (see §7).

**Design principles (from the product spec — treat as durable):**
- The agent proposes; the human disposes — **at every move.** The gate is mandatory.
- Deterministic truth for deterministic facts (never the model's arithmetic).
- Grounded or honest — a claim is cited or labeled `[unverified]`.
- Teach the *why* — every proposal carries its rationale.
- Safe by construction where the stakes are physical.

---

## 2. The user and their job

**Persona — the serious home cook ("amateur professional").** Reads Kenji and *Salt Fat
Acid Heat*, does weekend project cooks, hosts dinner parties. Wants to **understand *why* a
dish works** so they can repeat and riff on it. Their job is *"get better, make something
impressive, exercise creative agency"* — they want *more* engagement with the craft, not
less. They are the **hardest user to fool**, which is the point: it forces the system to be
honest and grounded.

**Jobs-to-be-done:**
- **JTBD-1 (primary):** develop an idea / ingredient / craving into a great, understood,
  cookable dish.
- **JTBD-2 (mastery):** understand what went wrong and how to improve it.
- **JTBD-3 (discovery):** explore surprising, grounded flavor directions (under the same
  safety gate).

**The mental model to design for.** A cook developing a dish thinks:
*"Here's my idea → let me try something → does that work? why? → I'll keep this, change
that → I cooked it, it was too salty → what do I change for next time?"*
They think in **the dish, attempts, taste, and reasons** — not in "moves", "gates",
"proposals", or "version chains." Those are the machine's words. (Today's UI leaks them;
see §7.)

**The signature scenario (design the happy path around this).** *Miso-carbonara over
three days*: seed a dish → develop it through a few gated moves → cook v2 → come back and
tell it "too salty, and I want more umami" → it reworks against the exact version you
cooked → you compare trials and promote the winner. This multi-iteration, multi-day arc is
where CapyCook beats a chatbot, so the IA should make it **legible and central**, not bury
it in a strip and a tab.

---

## 3. The core loop (what actually happens)

1. **Seed** — the cook states what they want to cook + constraints (dietary, allergens,
   equipment, skill, servings, on-hand ingredients).
2. **Move** — the orchestrator runs one unit of work and emits a **Proposal** (a
   structured diff against the current draft + a plain-language rationale + citations +
   confidence + any `[unverified]` claims + a safety verdict + 2–3 suggested next moves).
   The rationale **streams token-by-token**; the structured proposal arrives **whole**.
3. **Safety screen** — a deterministic gate may **block** the proposal before the cook
   ever sees it (it never reaches them).
4. **Gate** — the surviving proposal **stops** for the cook. The cook picks a verb.
5. **Verbs (six):** accept · edit · regenerate · alternatives (branch) · redirect (ask for
   changes) · take-over (hand-edit the draft).
6. **Advance** — the machine transitions and returns to a ready state. **Deterministic
   moves** (scale, unit-convert, recompute cost/nutrition) *may* auto-advance without a
   gate **only** when the "auto-apply safe steps" dial is on.
7. **Cook & iterate** — post-cook feedback is reasoned against the exact version cooked; a
   rework is proposed.

**Dish states (drive the whole UI):** `idle` (ready for a move) · `proposing` (a move is
running, rationale streaming, cancellable) · `awaiting_gate` (a proposal is waiting for a
verb) · `blocked` (the safety gate stopped a move).

---

## 4. The data model — *what information exists* (inline, authoritative)

This is the exact wire contract (`web/src/types.ts`, mirroring the Go structs). **The
redesign must render and preserve every field.** JSON from the draft/proposal is
`snake_case`; the HTTP envelope keys are `camelCase`. Go `nil` slices arrive as `null`.

```ts
// ---- enums ----
BIG9_ALLERGENS = ['milk','eggs','fish','crustacean shellfish','tree nuts',
                  'peanuts','wheat','soybeans','sesame']         // FDA Big-9
SKILLS         = ['beginner','intermediate','advanced']
CUISINES       = ['western']                                     // v0 is western-only
GateVerb       = 'accept'|'edit'|'regenerate'|'alternatives'|'redirect'|'take_over'
MoveType       = 'seed_expand'|'flavor_direction'|'ingredient_change'|'technique_step'
               | 'iterate_feedback'|'scale_servings'|'unit_convert'
               | 'cost_recompute'|'nutrition_recompute'
DishState      = 'idle'|'proposing'|'awaiting_gate'|'blocked'

// ---- the dish draft (the shared artifact the cook develops) ----
interface Draft {
  title: string
  concept: string                       // the one-line idea
  flavor_rationale: FlavorClaim[] | null
  ingredients: Ingredient[] | null
  steps: Step[] | null
  constraints: Constraints
  analysis: Analysis                    // deterministic — computed, never model-authored
}

interface Ingredient {
  name: string
  fdc_id: string | null                 // USDA FoodData Central id (nutrition source)
  foodon_id: string | null              // FoodOn ontology id (identity/allergen source)
  qty: number
  unit: string
}

interface Step {
  text: string
  technique: string                     // e.g. "sear", "emulsify"
  internal_temp_c: number | null        // safe-cook temp where relevant
  why: string                           // the teaching note — why this step
}

interface FlavorClaim {
  claim: string
  provenance: string | null             // null => render as [unverified]
  cuisine_context: string               // e.g. "western"
}

interface Constraints {
  dietary: string[] | null
  allergens: string[] | null            // Big-9 enum values only
  equipment: string[] | null
  skill: string                         // beginner|intermediate|advanced
  servings: number
  on_hand: string[] | null
  cuisine: string                       // "western" in v0
}

interface Analysis { cost: CostAnalysis; nutrition: NutritionAnalysis }

interface CostAnalysis {                // APPROXIMATE — a static price table, NOT USDA
  total_usd: number
  per_serving_usd: number
  approximate: boolean                  // true — must read as an estimate, not a guarantee
  missing: string[] | null              // ingredients with no price → excluded from the total
}

interface NutritionAnalysis {           // USDA-AUTHORITATIVE — trustworthy
  calories: number; protein_g: number; fat_g: number; sat_fat_g: number
  carbs_g: number; fiber_g: number; sugar_g: number; sodium_mg: number
  unverified: string[] | null           // nutrients that could not be grounded
}

// ---- the proposal (a gated, reviewable change to the draft) ----
interface Proposal {
  id: string
  move_id: string
  move_type: string                     // one of MoveType
  target_fields: string[] | null        // which draft fields it touches
  change: Op[] | null                   // the structured diff (JSON-Pointer ops)
  rationale: string                     // plain-language "why" (this is what streams)
  citations: Citation[] | null
  confidence: number                    // 0..1, LLM-emitted — NEVER a gating input
  unverified: string[] | null           // claims that could not be grounded
  safety: Safety
  suggested_next: string[] | null       // 2–3 recommended next MoveTypes
}

interface Op {                          // RFC-6901 JSON-Pointer diff op
  op: 'add'|'remove'|'replace'
  path: string
  value?: unknown
  from?: unknown                        // prior value on replace (powers the visual diff)
}

interface Citation { source: string; ref: string; date: string }

interface Safety {
  status: 'pass'|'blocked'
  reasons: string[] | null              // human-readable why-blocked
  rule_ids: string[] | null            // e.g. anaerobic-preservation, min-cook-temp, allergen
}

// ---- versions (the durability / develop-over-time spine) ----
interface VersionItem {
  id: string                            // "ver_...."
  parentVersionId: string | null        // tree, not DAG (branches never merge)
  createdAt: string
  draft: Draft                          // full snapshot at that version
}
interface VersionsResponse { currentVersionId: string | null; versions: VersionItem[] | null }

// ---- the dish envelope the workbench loads ----
interface DishDetail {
  id: string
  seed: string
  autonomyDial: boolean                 // "auto-apply safe steps"
  currentVersionId: string | null
  createdAt: string
  state: DishState
  draft: Draft
  pendingProposal?: Proposal            // single proposal at the gate
  pendingProposals?: Proposal[]         // >1 when "alternatives" produced a branch set
  inFlightMoveId?: string
  blocked?: BlockedInfo
}
interface BlockedInfo { moveId: string; reason: string; ruleId: string; ops?: Op[] | null }
interface DishSummary { id: string; title: string; updated_at: string }
```

**Reading the model as a designer:** a *dish* has a plain identity (`title`, `concept`),
a set of `ingredients` (each optionally resolved to USDA/FoodOn ids), numbered `steps`
(each with a *technique*, a safe *temp*, and a teaching *why*), `flavor_rationale` claims
(each grounded or `[unverified]`), the cook's `constraints`, and computed `analysis`
(trustworthy nutrition + approximate cost). A *proposal* is a **previewable, reasoned edit**
to that dish. *Versions* are the trail of trials. That's the whole vocabulary a cook needs
— everything else (`move_id`, `Op`, `rule_ids`, `confidence`) is machinery that can be
demoted or hidden.

---

## 5. The API + streaming contract — *what the frontend must do* (fixed)

Base: same-origin. Mutating requests send header `X-Session-Id` (a crypto-random id minted
client-side, re-minted after 30 min idle). Errors return `{ "error": string }`.

**Endpoints (`web/src/api.ts`):**

| Method | Path | Purpose | Body → Response |
|---|---|---|---|
| GET | `/healthz` | liveness | → 200 |
| GET | `/api/status` | which model edge + budget | → `{ llm_mode:'stub'|'live', model?, budget_spent_usd, budget_cap_usd }` |
| GET | `/api/dishes` | recent dishes | → `DishSummary[]` |
| POST | `/api/dishes` | create a dish | `{ seed, constraints, autonomy_dial? }` → `DishDetail` |
| GET | `/api/dishes/{id}` | load a dish (re-sync) | → `DishDetail` |
| PATCH | `/api/dishes/{id}` | toggle autonomy dial | `{ autonomy_dial }` → `{ id, autonomyDial }` |
| POST | `/api/dishes/{id}/move` | start a move | `{ moveType, steer, baseVersion? }` → `{ moveId }` (202) |
| POST | `/api/dishes/{id}/cancel` | cancel in-flight move | → `{ cancelled }` |
| POST | `/api/dishes/{id}/gate` | apply a gate verb | `{ proposalId, verb, edit?, confirmOverride? }` → `{ verb, proposalId, newVersionId?, newMoveId?, overridden? }` |
| GET | `/api/dishes/{id}/versions` | the version chain | → `VersionsResponse` |
| POST | `/api/dishes/{id}/promote` | make a version the trunk head | `{ versionId }` → `{ currentVersionId }` |
| GET | `/api/dishes/{id}/stream` | **SSE** live events | see below |

**Gate verb payloads** (`edit` shape depends on verb): `edit` → `{ ops: Op[] }`;
`take_over` → `{ draft: Draft }` (server synthesizes the diff); `redirect` → `{ steer: string }`.

**Safety warn-and-confirm:** for **human writes** (`edit` / `take_over`) that trip the
safety gate, the server returns **409 "confirm override required"** with the reasons. The
UI must show the reasons and, only on explicit confirm, resend the same gate call with
`confirmOverride: true`. (Model proposals that trip safety are hard-blocked upstream and
never reach the gate — that's the `blocked` state, not a 409.)

**SSE events (one persistent EventSource per dish; on reconnect, re-sync via GET — the
stream carries no history):**

| Event | Payload | UI meaning |
|---|---|---|
| `token` | `{ moveId, text }` | append a rationale token (the streaming "why") |
| `proposal-ready` | `{ moveId, proposal }` | a proposal reached the gate → `awaiting_gate` |
| `proposal-blocked` | `{ moveId, reason, ruleId, ops? }` | safety hard-blocked it → `blocked` |
| `move-cancelled` | `{ moveId }` | the move was cancelled → back to `idle` |
| `move-failed` | `{ moveId, reason }` | the move errored → offer retry |

**Two flow subtleties the UI must handle:**
- **Alternatives** deliver **two `proposal-ready` events sequentially** for the same gate
  (accumulate into `pendingProposals`, let the cook pick one to develop).
- **Deterministic auto-advance:** a deterministic move with the dial ON can resolve
  *before* the `POST /move` 202 returns and emits **no SSE event** — detect it by a changed
  `currentVersionId` on the follow-up GET and fold it into the timeline.

---

## 6. What exists today (inventory + screenshot index)

Two screens, History-API routed (no router lib): `/` (home) and `/dishes/:id` (workbench).
Described at the experience level; the current visual system is a monochrome "test-kitchen
fiche" (hairlines, uppercase micro-labels, mono numerics, a single terracotta accent, warm
palette, light+dark). It is **visually clean but organized around the machine** (see §7).

**Home (`/`)** — header title; a **"Start a dish"** form (free-text seed; Big-9 allergen
chips; cuisine locked to *western*; skill; servings; comma-lists for dietary / equipment /
on-hand); a **"Recent dishes"** list.

**Workbench (`/dishes/:id`)** — a **two-column** layout (desktop) that collapses to
**three tabs** on narrow screens (**Recipe / Develop / History**):
- **Header row:** [Dishes] · dish title · a live datum (`Trial n · $x/serving`) · a **state
  label** ("Bench ready" / "Proposing…" / "At the pass" / "On hold — safety") · a stub-mode
  banner · the **"Auto-apply safe steps"** dial · a theme toggle.
- **Left column ("the canvas"):**
  - **Trial strip** (top): the version chain as *Trial* pills — select to view a read-only
    snapshot, promote a winner, or "cook this and give tasting notes."
  - **Canvas body**, which shows *one of*: a **safety hold** (the blocked change, grayed
    where it would have landed) · a read-only **snapshot** · a **proposed-draft view** (the
    would-be recipe with the diff inline, 1 proposal) · an **alternatives picker** (radio
    group over what differs, >1 proposal) · or the plain **recipe** ("fiche"): title +
    concept, a one-line dashboard (`SERVES · g/PORTION · $/SERVING · kcal`) expanding to
    cost + nutrition panels + an uncertainty ledger, an aligned **ingredient table** (with
    `fdc:`/`foodon:` chips and baker's-% column), the numbered **steps** (technique / temp /
    time chips + a "why" line), the **flavor rationale** (provenance or `[unverified]`
    chips), a provenance legend, and a **"Station card"** (the constraints).
  - **Gate bar** (bottom, fixed on mobile): **Accept** (the one filled primary) + **Ask for
    changes** up front; **More ▾** reveals **Edit · Regenerate · Alternatives · Take over**.
    Single-key shortcuts (A·R·E·G·L·T). On a hold, only **Regenerate / Ask for changes**.
- **Right column ("Steering" rail):** a **thread** (your steer turns tinted/indented; the
  model's streamed rationale; collapsed auto-applied entries; post-cook "you cooked vN"
  entries; info notes) + a **move initiator**: `suggested_next` chips, a **"Move type"
  select** (the 9 move-types, or "auto"), a **"Direction (optional)"** textarea, and a
  **"Propose a move"** button.

**Screenshot & GIF reference index** (committed; each `.png` has `-dark` + `-light`):

`docs/01-end-to-end/evidence/phase5/` —
- `01-seed-intake`, `01b-seed-errors` — the seed/intake form (+ validation)
- `02-workbench-empty` — workbench, empty draft, idle
- `03-pass-proposal-canvas` — a proposal **at the gate**, rendered on the canvas
- `03b-technical-view-on` — the "technical view" toggle (raw ops / ids) on
- `03c-gate-more-open` — the gate bar's **More ▾** expanded
- `04-edit-form`, `05-take-over-form`, `06-override-prompt` — the edit / take-over / safety-override flows
- `07-accepted-idle-fiche`, `07b-dashboard-expanded` — the recipe fiche + expanded cost/nutrition
- `08-alternatives-comparison` — the alternatives picker
- `09-safety-hold-evidence`, `10-ask-for-changes-blocked`, `11-recovered-pass` — the safety-hold arc
- `12-trials-expanded`, `13-snapshot`, `14-promoted` — the trials / snapshot / promote flow
- `15-tasting-notes`, `16-postcook-proposal`, `17-dial-auto-applied` — post-cook iteration + auto-advance
- `18-skip-link`, `19-focus-gate` — accessibility affordances
- `N1-recipe-tab`, `N2-develop-tab`, `N3-history-tab`, `N4-safety-hold`, `N5-seed-intake` — the narrow/mobile tab states

`docs/media/` — `01-develop-loop.gif`, `02-safety-hold.gif`, `03-restart-survival.gif`,
`04-post-cook-rework.gif` (the four hero flows in motion).

---

## 7. Diagnosis — why today's IA doesn't fit a cook

The current UI is a **faithful visualization of the state machine**, not of the cook's job.
It's clean and accessible, but its *organizing principle* is the engineering architecture
(gate / move / proposal / version-chain), so a cook trying to develop a recipe has to
think in the system's terms. Seven specific frictions:

1. **The machine's vocabulary is the primary surface.** "At the pass", "Gate", "Proposal",
   "Move type", "Trials", "Station card", "Regenerate / Take over / Redirect", "autonomy
   dial." The labels were partly cook-translated, but the *structure* still exposes the
   move/gate primitives. A cook thinks "let me try making it spicier," not "let me issue a
   `flavor_direction` move."

2. **Split by system-concern, not by cook-task.** Left = the artifact, right = a "steering
   conversation." That mirrors a coding-tool diff-review, but a cook doesn't separate "the
   recipe" from "the conversation about the recipe" — developing the dish *is* the thinking.
   The chat rail feels like talking to a bot on the side rather than working on the dish.

3. **The decision moment reads as a form to submit, not a culinary call.** The gate is a
   persistent footer toolbar of verbs ("Gate — respond to the proposal"). The underlying
   idea — *"here's a change and why; want it?"* — is right, but presented as a verb bar it
   reads as machinery, not as "keep it / tweak it / try another way."

4. **Everything is one flat, equal-weight scroll.** The fiche is beautifully dense, but
   there's no sense of **where you are in developing the dish** — what's decided vs.
   still-open, what to try next, what you've learned. The dish reads as a static document,
   not a work-in-progress.

5. **Intent is a taxonomy dropdown.** The cook must classify their intent into one of nine
   "move types" (or "auto") *before* saying what they want. That's the wire enum leaking
   into the primary action. Intent should be expressed in the cook's words; the system maps
   it to a move type behind the scenes.

6. **The honesty differentiators read as metadata, not trust.** Grounded vs `[unverified]`,
   USDA-authoritative nutrition vs approximate cost, the uncertainty ledger — the *most
   distinctive, trust-building* content — appear as chips and legends, not as a clear
   "what I'm sure about / what I'm guessing" story the cook can lean on.

7. **The single biggest differentiator is the least prominent.** Develop-over-time —
   trials, branches, cook-it-then-rework-against-that-version — is the thing that beats a
   chatbot, yet it lives in a horizontal pill strip and a "History" tab. The multi-day
   development arc should be **spine**, not a strip.

**One-sentence root cause:** *the surface is organized around how the system is built, when
it should be organized around the cook's job — take an idea → develop a dish I understand →
cook it → improve it — with the engineering showing through as trust and durability rather
than as the layout.*

---

## 8. A proposed cook-first direction (react to this — it is a starting point, not a spec)

Reorganize around the cook's mental model and the develop-over-time arc, **while preserving
every capability in §9.** Six moves:

1. **Center the dish and its development timeline; drop the artifact-vs-chat split.**
   Make "this dish, evolving" the spine. The rationale/reasoning ("why") belongs *attached
   to the change it explains*, not siloed in a separate chat column. Consider: the dish as
   the main stage, and each decision (a "trial") as a step on a visible timeline that
   carries its own rationale, taste notes, and provenance.

2. **Intent-first initiation.** Let the cook say what they want in plain language ("make it
   cheaper", "add a crunchy element", "what pairs with miso?"); map it to a `MoveType` under
   the hood. Keep the *deterministic* actions (scale servings, convert units, recompute
   cost/nutrition) as explicit one-tap buttons — those genuinely *are* mechanical and are
   the ones the dial can auto-apply.

3. **Reframe the gate as a culinary decision.** Keep the mandatory checkpoint (it's
   non-negotiable) but present it as *"Here's the change I'd make, and why"* rendered **on
   the dish itself** (the proposed-draft view already nails this) with a small, legible
   decision: **Use it · Tweak it · Try another way** — mapping to accept / edit / (regenerate
   | alternatives | redirect). Preserve the keyboard-fast path for power users. Take-over
   stays available as "let me edit it myself."

4. **Make trust a first-class layer, not chrome.** Give provenance and uncertainty a clear
   voice: *"Nutrition — USDA-verified. Cost — approximate. This flavor pairing —
   unverified."* This honesty **is** the product; it should read as the system being
   straight with the cook, and it should be legible at a glance on any claim or number.

5. **Elevate the develop-over-time story to a visible spine.** Trials, branches, and the
   post-cook loop ("cook v2 → tell me how it went → I'll rework against exactly that")
   should be central and narratively clear: *"You're on Trial 3. You cooked Trial 2 and said
   it was too salty — here's what changed."* This is the demo that beats ChatGPT; make it
   the story, not a strip.

6. **Progressive disclosure of engineering depth.** Default view speaks cook. Power-user /
   portfolio-reviewer depth — raw JSON-ops diff, `rule_ids`, `fdc:`/`foodon:` ids, the
   move-type slugs, the autonomy dial, keyboard remap, the stub/live + budget meter — stays
   reachable behind a "technical view" (one already exists), demoted, never the default. The
   engineering is present and inspectable; it just isn't the front door.

**What to keep from today (it's good):** the proposed-draft-view diff (the change shown *on*
the recipe), the honest cost/nutrition split, the safety-hold "show the killed change"
pattern, the strong recipe-card density for the *final* recipe, and the accessibility rigor.

---

## 9. Hard constraints — non-negotiables for any redesign

The redesign is free on layout, visuals, motion, and IA — but it **must** keep all of this:

- **The gate is mandatory.** No draft change without an explicit human verb. Deterministic
  moves auto-advance **only** when the dial is on; creative moves always stop.
- **All six verbs reachable:** accept · edit · regenerate · alternatives · redirect ·
  take-over. (They can be relabeled/regrouped for cooks, but each must be dispatchable.)
- **The safety block must be surfaceable** as its own state: show the reason + the
  killed change; only Regenerate / Ask-for-changes are available on a hold. Plus the
  **409 warn-and-confirm** path for human writes that trip safety.
- **Honest grounding must stay visible:** `[unverified]` claims, USDA-authoritative
  nutrition vs. **approximate** cost, `missing`/`unverified` fields. Never present cost as a
  guarantee. `confidence` is shown, if at all, as informational — **never** as a gate.
- **Every data-model field in §4 must have a home** (or a deliberate, disclosed omission).
- **Streaming behavior:** rationale streams token-by-token; the proposal arrives whole;
  handle reconnect (re-sync via GET), cancel, move-failed (retry), sequential
  `alternatives`, and silent deterministic auto-advance.
- **Four states drive the UI:** `idle` / `proposing` / `awaiting_gate` / `blocked`.
- **Accessibility is an acceptance criterion, not a nicety** (the project's design bar is
  explicitly "a11y + IA depth," not just style). Preserve: skip links to the gate and
  steering, a roving-tabindex toolbar for the gate, polite live-region announcements for
  gate-lifecycle transitions, managed focus on route/panel changes, ≥24px target sizes,
  GOV.UK-style error summaries, reduced-motion support, full keyboard operability, and
  light/dark theming.
- **Backend/API/data model are frozen** — design to the §4/§5 contract exactly.

---

## 10. The redesign work-list

Screens/states to (re)design, each honoring §9:

1. **Home / dish intake** — seed + constraints; recent dishes. (Make intent feel like
   *starting a project*, not filling a form.)
2. **The workbench, `idle`** — the current dish + "what do you want to try?" initiation +
   the development timeline.
3. **The workbench, `proposing`** — streaming rationale + cancel.
4. **The gate, `awaiting_gate`** — the proposed change shown on the dish + the decision +
   the six verbs (regrouped) + edit / take-over / redirect surfaces.
5. **Alternatives** — comparing 2+ proposals, pick one to develop.
6. **The safety hold, `blocked`** — the killed change + the reason + the limited verbs; and
   the 409 warn-and-confirm for hand-edits.
7. **The develop-over-time spine** — trials/versions, snapshots, promote, branches.
8. **The post-cook loop** — "cook this version → tasting notes → rework against it."
9. **The final recipe** — the trustworthy, dense, cookable card (keep the fiche strengths).
10. **Technical/power view** — the demoted engineering depth (ops, ids, dial, budget, slugs).
11. **Narrow-screen** — the mobile/stacked information priority.

**Open questions worth deciding in Claude Design:**
- Does "the dish + its timeline" become one unified stage, or stay two regions with a
  cook-legible relationship?
- How prominent should the branching/tree model be for a v0 that's mostly linear trials?
- What is the *default* altitude of engineering detail on the gate — pure-cook, or a hybrid
  that keeps a little provenance visible because provenance is the differentiator?

---

*Source of truth for the contract: `web/src/types.ts` and `web/src/api.ts` (inlined above).
Product rationale: `DESIGN.md` (v0.4). Current vocabulary: `web/src/vocab.ts`. Prior
(visual) redesign brief: `agent_docs/2026-07-07-gate-c-redesign-brief.md`.*
