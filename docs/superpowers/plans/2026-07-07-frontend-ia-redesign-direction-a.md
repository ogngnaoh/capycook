# Frontend IA Redesign — Direction A ("Line of Development") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the CapyCook web frontend's information architecture around the cook's job — timeline spine + dish stage + intent-first initiation + gate-as-culinary-decision — per the imported Claude Design prototype, against the frozen Go API.

**Architecture:** The Workbench keeps 100% of its wire logic (SSE stream, resync, `propose`, `runGate` incl. the 409 override, promote, dial) and swaps its presentation layer: `TrialStrip`/`SteeringPane`/`DraftPane`/`ProposedDraftView`/`RailTabs`/`VersionHistory` are replaced by `TimelineSpine`, `DishCard` (one component, plain + diff modes via the existing `mergeDiff`), `IntentBar`, a mode-based `GateBar`, and per-state stage cards. The token layer is re-pointed at the design's cc-palette without renaming any Tailwind utility.

**Tech Stack:** React 18 + Vite + Tailwind (theme-replaced config), vitest + Testing Library, existing `web/src/lib` diff machinery. No new dependencies.

**Design source of truth:** `agent_docs/design/CapyCook-Redesign.dc.html` (line refs below) + `agent_docs/design/BUILD-SPEC.md`. Requirements: `agent_docs/2026-07-07-claude-design-frontend-redesign-brief.md` §9 (non-negotiables).

## Global Constraints

- **Frozen:** everything under `internal/`, `cmd/`, plus `web/src/api.ts` and `web/src/types.ts`. The UI talks to exactly the existing endpoints/SSE events.
- **§9 non-negotiables (brief):** gate mandatory; all six verbs dispatchable (`accept · edit · regenerate · alternatives · redirect · take_over`); safety hold is its own state with only Regenerate/Ask-for-changes; 409 warn-and-confirm for human writes; `[unverified]` chips, USDA-verified vs approximate cost, `missing`/`unverified` fields visible; confidence informational only; every §4 field has a home (or a deliberate, documented omission); token streaming + whole proposal + cancel + sequential alternatives + silent deterministic auto-advance + reconnect-resync; states `idle/proposing/awaiting_gate/blocked` drive the UI.
- **a11y is an acceptance criterion:** skip links to the dish and the decision, roving-tabindex gate toolbar, polite live region for gate lifecycle, managed focus (route change, proposal arrival, panel close), ≥24px targets (design uses ≥30px), GOV.UK error summaries on intake, `prefers-reduced-motion` honored, full keyboard operability incl. the remappable A/E/G/L/R/T map in `lib/shortcuts.ts`, light+dark.
- **Visual grammar:** square corners, hairlines, no shadows/gradients, uppercase micro-labels, mono numerics. All colors via tokens — never hex in components.
- **Prototype chrome that is NOT implemented:** the A/B direction switcher, the "Narrow" preview toggle (real responsive `@media` instead), the mock keyword→proposal router (the real server classifies: empty `moveType` = auto).
- **Design markup translation:** `{{ x }}` → props/state, `sc-if` → conditional render, `sc-for` → `.map()`, inline styles → Tailwind utilities per the token map in Task 1 (arbitrary values like `shadow-[inset_3px_0_var(--color-success)]` only where no utility exists; shared row tints become `index.css` component classes).
- **Commands:** tests `cd web && npx vitest run` · typecheck `cd web && npx tsc -b` · dev server `cd web && npm run dev` (Go server `make run` serves the API on :8080; vite proxies — check `vite.config.ts`).
- Tests assert copy via `vocab.ts` exports, never string literals. Never delete a §9-guarding assertion to make a suite pass — restate it against the new DOM.
- Commit after every task (`git add` the task's files only).

## File Structure (end state)

```
web/src/
  styles/tokens.css        MODIFIED  cc-palette values, --header-height 54px
  index.css                MODIFIED  + cc keyframes, diff-row classes
  ../tailwind.config.js    MODIFIED  + panel/faint/accent-soft colors, timeline width
  vocab.ts                 MODIFIED  new state/verb labels, gate copy
  App.tsx                  MODIFIED  Home restyle (intake hero + recent list)
  screens/SeedSetup.tsx    MODIFIED  intake form restyle (keeps all fields + validation)
  lib/trials.ts            NEW       buildTimeline(): wire versions → TimelineNode[]
  lib/shortcuts.ts         UNCHANGED (map already A/E/G/L/R/T)
  components/
    Workbench.tsx          MODIFIED  new chrome + grid; wire logic kept
    TimelineSpine.tsx      NEW       replaces TrialStrip + VersionHistory
    TrustStrip.tsx         NEW       "How sure —" strip
    DishCard.tsx           NEW       replaces DraftPane + ProposedDraftView
    ProposalHeader.tsx     NEW       "Here's the change I'd make" + citations
    ProposingCard.tsx      NEW       streaming rationale + Stop
    SafetyHold.tsx         NEW       replaces SafetyBlock (renders blocked verbs)
    AlternativesPicker.tsx REWRITTEN two-card comparison
    GateBar.tsx            REWRITTEN mode-based decision bar (forms move in here)
    IntentBar.tsx          NEW       replaces SteeringPane initiator
    CookFlow.tsx           NEW       "I cooked this" row + tasting-notes form
    Toast.tsx              NEW       bottom-center flash
    DialToggle.tsx         MODIFIED  chrome-toggle restyle
    ThemeToggle.tsx        MODIFIED  chrome-toggle restyle
  DELETED: TrialStrip, SteeringPane, DraftPane, ProposedDraftView,
           AlternativesPicker(old body), SafetyBlock, RailTabs,
           VersionHistory, ProposalCard, DiffMark (+ their tests)
```

Slice grouping for `docs/02a-frontend-redesign/milestone.md`: **S1** = Tasks 1–2 (tokens + intake) · **S2** = Tasks 3–5 (timeline + dish card) · **S3** = Tasks 6–8 (gate + states + intent) · **S4** = Tasks 9–10 (integration + a11y/evidence).

---

### Task 1: Token layer swap

**Files:**
- Modify: `web/src/styles/tokens.css` (palette blocks only, lines 104–202)
- Modify: `web/tailwind.config.js`
- Modify: `web/src/index.css`

**Interfaces:**
- Consumes: design tokens from `CapyCook-Redesign.dc.html:16-51`.
- Produces: Tailwind utilities `bg-panel`, `text-faint`, `bg-accent-soft`, `text-accent-soft`, `border-accent`, `w-timeline`, plus re-valued `page/surface/ink/muted/hairline/hairline-strong/accent/on-accent/success/warning/critical` and CSS classes `.row-add`, `.row-change`, `.cc-rise`, keyframes `cc-spin`, `cc-blink`. Every later task depends on these names.

**cc → token map (the translation table every markup-port task uses):**

| design var | CSS custom prop | Tailwind utility |
|---|---|---|
| `--cc-bg` | `--color-page` | `bg-page` |
| `--cc-panel` | `--color-panel` (NEW) | `bg-panel` |
| `--cc-panel-2` | `--color-surface` | `bg-surface` |
| `--cc-ink` | `--color-ink` | `text-ink` |
| `--cc-muted` | `--color-muted` | `text-muted` |
| `--cc-faint` | `--color-faint` (NEW) | `text-faint` |
| `--cc-line` | `--color-border` | `border-hairline` |
| `--cc-line-strong` | `--color-border-strong` | `border-hairline-strong` |
| `--cc-accent` | `--color-accent` | `bg-accent` / `border-accent` (fills/borders/≥16px text) |
| (small accent text) | `--color-accent-text` | `text-accent-text` — **use for <16px accent text; keeps AA** |
| `--cc-accent-ink` | `--color-on-accent` | `text-on-accent` |
| `--cc-accent-soft` | `--color-accent-soft` (NEW) | `bg-accent-soft` |
| `--cc-add` / `--cc-add-bg` | `--color-success` / `--color-success-surface` | `text-success` / `bg-success-surface` |
| `--cc-warn` / `--cc-warn-bg` | `--color-warning` / `--color-warning-surface` | as today |
| `--cc-crit` / `--cc-crit-bg` | `--color-critical` / `--color-critical-surface` | as today |

- [ ] **Step 1: Re-value the palette in `tokens.css`**

Replace the three palette blocks' values (keep structure, `color-scheme`, aliases, and the `--focus-ring` rule). Light (`:root`): page `#FBF9F4`, panel `#FFFFFF` (new prop), surface `#F4F0E8`, ink `#1C1A17`, muted `#6B6560`, faint `#9A938A` (new), border `#E7E1D6`, border-strong `#CEC6B7`, accent `#C05A2C`, accent-text `#A04E30` (kept — AA), on-accent `#FFFFFF`, accent-soft `#F2E3D8` (new), success `#2C6E49`, success-surface `#E7F0E8`, warning `#B36200`, warning-surface `#FBEED9`, critical `#C4271C`, critical-surface `#FBE4E1`. Info pair: keep current values (legacy chips only).
Dark (both the media block and `[data-theme="dark"]` — they must stay mirrored): page `#16130E`, panel `#201C15`, surface `#26211A`, ink `#ECE5D8`, muted `#A79E90`, faint `#7C7364`, border `#322C22`, border-strong `#443C2E`, accent `#D2794D`, accent-text `#D98E73` (kept), on-accent `#17130E`, accent-soft `#33261C`, success `#7FB894`, success-surface `#1E2A20`, warning `#E0A552`, warning-surface `#2A2114`, critical `#E58A7F`, critical-surface `#2E1A17`.
Also: `--header-height: 54px` (design header height, line 59).

- [ ] **Step 2: Extend `tailwind.config.js`**

In `colors`: add `panel: 'var(--color-panel)'`, `faint: 'var(--color-faint)'`, `'accent-soft': 'var(--color-accent-soft)'`. In `extend.width`: add `timeline: '308px'` (drop `steering`/`versions` in Task 9 when their consumers die — not before).

- [ ] **Step 3: Add keyframes + diff-row classes to `index.css`**

```css
@layer components {
  /* Diff tints (design lines 1009-1024): green wash + 3px inset spine. */
  .row-add    { background: var(--color-success-surface); box-shadow: inset 3px 0 var(--color-success); }
  .row-change { background: var(--color-success-surface); box-shadow: inset 3px 0 var(--color-accent); }
  .cc-rise { animation: cc-rise .18s ease both; }
}
@keyframes cc-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes cc-spin { to { transform: rotate(360deg); } }
@keyframes cc-blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
```
(The existing `@media (prefers-reduced-motion: reduce)` block in `index.css` already zeroes all animations — verify it still covers these.)

- [ ] **Step 4: Verify** — `cd web && npx tsc -b && npx vitest run`. Expected: full suite PASSES (values only changed; no utility renamed). Then `npm run dev`, eyeball light+dark: warm paper page, white panels.

- [ ] **Step 5: Commit** — `feat(web): re-point token palette at redesign cc set`

---

### Task 2: Intake + home restyle

**Files:**
- Modify: `web/src/App.tsx` (the `Home` component)
- Modify: `web/src/screens/SeedSetup.tsx`
- Test: `web/src/screens/SeedSetup.test.tsx`, `web/src/App.test.tsx`

**Interfaces:**
- Consumes: design lines 84–140 (intake), Task 1 utilities.
- Produces: unchanged external API — `SeedSetup({ onCreated })` still posts via `createDish` and calls `onCreated(dish)`; `validateSeedForm`/`SeedFormValues`/`SeedError` exports keep their signatures (tests and future tasks rely on them).

**What changes / what must NOT change:**
- Keep: every constraint field (seed, Big-9 allergens, dietary, equipment, on-hand, skill select, servings, cuisine locked `western · v0`), `validateSeedForm`, the GOV.UK error summary (`role="alert"`, links focus the offending field), submit → `createDish`.
- Restyle: hero header (`Start a dish` eyebrow, 34px "What do you feel like cooking?" h1, muted intro — design 87–89); seed becomes the 16px textarea (design 97–98); allergens become toggle **buttons** with `aria-pressed` (design 103–107, port the on/off styles from line 1122); skill/servings/dietary/equipment/on-hand in the hairline grid voice (design 109–122); primary button `Develop this dish →` filled accent with `text-on-accent` (design 125); recent dishes as "Pick up where you left off" rows: title + meta line + mono timestamp (design 129–138), using real `DishSummary` data.

- [ ] **Step 1: Update tests first.** In `SeedSetup.test.tsx`: allergen selection now via `getByRole('button', { name: 'peanuts' })` + `aria-pressed` assertions; validation copy unchanged (asserts stay). In `App.test.tsx`: recent-dish row still `getByRole('button', { name: /title/ })`. Run: expect the allergen ones to FAIL (still checkboxes).
- [ ] **Step 2: Restyle `SeedSetup.tsx`** per above (uppercase 11px labels = `text-2xs uppercase tracking-ui text-muted`; inputs `border-hairline-strong bg-panel p-2`; min target 44px on the primary).
- [ ] **Step 3: Restyle `Home`** — max-w wrapper, header row `CapyCook — dish development workbench` kept as h1 for the route-focus contract, then SeedSetup, then the recent list with the "Pick up where you left off" eyebrow.
- [ ] **Step 4: Verify** — `npx vitest run src/screens src/App.test.tsx` PASS; dev-server eyeball light/dark + keyboard walk (tab order: skip nothing, error summary focuses).
- [ ] **Step 5: Commit** — `feat(web): redesign intake + home per direction A`

---

### Task 3: `lib/trials.ts` — timeline view-model (TDD)

**Files:**
- Create: `web/src/lib/trials.ts`
- Test: `web/src/lib/trials.test.ts`

**Interfaces:**
- Consumes: `VersionsResponse`, `VersionItem`, `Proposal` from `../types`; `deltaSummary` from `./deltaSummary`; `MOVE_LABEL`, `trialAlias` from `../vocab`.
- Produces (Tasks 4/9 depend on these exact shapes):

```ts
export interface TimelineNode {
  id: string
  n: number                    // 1-based trial number, wire order
  head: string                 // "Trial 2" | "Trial 3 — your decision" (pending)
  note: string                 // draft.concept, or deltaSummary for pending
  when: string                 // formatted createdAt ('' for pending)
  cooked: boolean
  cookNote?: string
  branch: boolean              // parent already had an earlier child
  isCurrent: boolean
  isViewing: boolean
  pending: boolean
}
export function buildTimeline(
  data: VersionsResponse,
  opts: {
    viewingId: string | null
    cookNotes: Record<string, string>          // session-local, versionId → note
    pendingProposal?: { move_type: string; change: Op[] | null } | null
    baseDraft?: Draft                          // names deltaSummary items for pending
  },
): TimelineNode[]
export function formatWhen(iso: string): string  // "Mon 6:12p" style; '' on parse failure
```

Rules: nodes in wire order (`versions.versions` as returned); `branch` = true when another earlier version shares the same `parentVersionId`; `cooked`/`cookNote` from `opts.cookNotes` (documented limitation: session-local, like today's thread — lost on reload); pending node appended only when `pendingProposal` is set, with `head = trialAlias(len+1) + ' — your decision'`, `note = deltaSummary(list(change), baseDraft)`, label from `MOVE_LABEL[move_type] ?? move_type`.

- [ ] **Step 1: Write failing tests** covering: empty response → `[]`; two linear versions → n 1..2, no branch; a version whose parent has two children → second child `branch: true`; `cookNotes` maps through; `viewingId`/`currentVersionId` flags; pending node appended with deltaSummary note; `formatWhen('2026-07-07T18:12:00Z')` matches `/\w{3} \d{1,2}:\d{2}(a|p)/` and `formatWhen('garbage') === ''`.
- [ ] **Step 2: Run** `npx vitest run src/lib/trials.test.ts` — FAIL (module missing).
- [ ] **Step 3: Implement** (`formatWhen` via `new Date(iso)` + `toLocaleString` parts: `Mon 6:12p` = weekday short + h:mm + a/p; guard `isNaN(getTime())`).
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(web): timeline view-model for the line of development`

---

### Task 4: `TimelineSpine` component

**Files:**
- Create: `web/src/components/TimelineSpine.tsx`
- Test: `web/src/components/TimelineSpine.test.tsx`

**Interfaces:**
- Consumes: `TimelineNode` from `../lib/trials`.
- Produces:

```ts
export default function TimelineSpine({ nodes, summary, nextHint, technical, onView, onPromote }: {
  nodes: TimelineNode[]
  summary: string          // "Trial 3 · you cooked Trial 2"
  nextHint: string         // dashed next-node caption
  technical: boolean       // shows ver ids
  onView: (id: string) => void      // never called for pending nodes
  onPromote: (id: string) => void
}): JSX.Element
```

**Markup port — design lines 146–184:** `<aside aria-label="Development timeline">` with sticky eyebrow header ("The line of development" + summary); per node: rail segment + dot (current/pending accent, past hairline — port the style logic from lines 1071–1090 as class-name conditionals, not inline style strings), card button (`aria-current` on the current trial), Cooked/Branch badges (160–161), cookNote quote block with accent left border (165–167), mono `when` + tech ver id (168–171), "Promote to trunk" control on non-current past nodes (172–174 — render as a real `<button>`, NOT the prototype's nested `role="button"` span: put it OUTSIDE the card button, sibling row, to keep valid HTML), then the dashed pending-next hint (178–182). Pending node: accent-soft card, non-interactive.

- [ ] **Step 1: Failing tests** — renders one `aria-current="true"`; pending node has no clickable card (`onView` not called on click); promote button visible only on non-current real nodes and fires `onPromote(id)`; cooked badge + note rendered when `cookNote` set; `technical` toggles the ver-id line.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** — `feat(web): timeline spine component`

---

### Task 5: `DishCard` + `TrustStrip`

**Files:**
- Create: `web/src/components/DishCard.tsx`, `web/src/components/TrustStrip.tsx`
- Test: `web/src/components/DishCard.test.tsx`, `web/src/components/TrustStrip.test.tsx`

**Interfaces:**
- Consumes: `Draft`, `Proposal`, `list` from `../types`; `mergeDiff, DiffView, Row, ScalarDiff` from `../lib/mergeDiff`; `formatQty`/`extractStepMeta` — **move these two exports out of `DraftPane.tsx` into `DishCard.tsx` verbatim** (DraftPane dies in Task 9; keep their tests by moving the relevant cases into DishCard.test).
- Produces:

```ts
// One component, two modes. diff present → render the union view (adds green,
// changes green+accent spine with old value struck, removes struck rows).
export default function DishCard({ draft, diff, technical, showDetail }: {
  draft: Draft               // the CURRENT draft (diff mode renders base+ops union)
  diff?: DiffView | null
  technical: boolean
  showDetail: boolean        // cost/nutrition panels — idle & snapshot only (design showDetail)
}): JSX.Element

export function TrustStrip({ draft }: { draft: Draft }): JSX.Element
// "How sure —" • Nutrition USDA-verified • Cost approximate • N flavor claim(s) unverified
// (count = flavor_rationale entries with null provenance; row hidden when 0)
```

Internally: `const view: DiffView = diff ?? plainView(draft)` where `plainView` wraps every row as `kind:'same'` — one render path.

**Markup port — design lines 280–384 (+190–196 for TrustStrip):**
- Header: title (24px bold), concept (changed → success tint + struck old line, 283–290), dashboard row of hairline cells `Serves · Cost/serving (+ "approx" warning tag) · Calories · Sodium/serving` — mono 16px values (291–296).
- Ingredients (299–314): grid `[70px 1fr auto]`, mono qty right-aligned (`formatQty`), name + changed-from struck mono label + `New` success chip; `technical` → `fdc:`/`foodon:` chips. Removed rows: struck, muted, `.row-change`-free (plain strike + `<span class="sr-only">` prefixes `SR_REMOVED` — keep the aural diff grammar from `vocab.ts`).
- Method (316–332): mono step number in accent-text, text + technique chip + `internal_temp_c` mono warning chip when present + `New` chip, then the muted "why" line. Keep `extractStepMeta` time/temp chips.
- Why it works (334–344): claim + (`✓ provenance` in success | `unverified` bordered chip).
- Cost + nutrition detail (346–363, `showDetail` only): two panels — "Cost — approximate" (warning dot, totals, `Excludes X — no price on file.` from `cost.missing`) and "Nutrition — USDA-verified" (success dot, mono macro grid incl. protein/fat/sat/carbs/fiber/sugar; append `nutrition.unverified` items as `unverified: a, b` warning line when non-empty).
- Cooking for (365–373): constraint chips `skill/serves/avoid/equipment/on hand` (+ dietary — the design omitted it; include it, every field needs a home).
- Technical ops block (375–383, `technical && diff`): mono `op path value` lines from the proposal ops — pass ops through `diff.other`? No: render from the `Proposal.change` the caller used to build `diff`; simplest is an optional `ops?: Op[]` prop rendered only when `technical`. Add it to the interface: `ops?: Op[] | null`.
- `DiffView.failed`/`.other` non-empty → one muted line above the card: `Some changes could not be previewed — accepting still applies them.` + `other` labels list (§9: no silent omission).

- [ ] **Step 1: Failing tests** — plain mode renders all sections + no tint classes; diff mode: added ingredient row has `.row-add` + `New` chip + `SR_ADDED` sr-text, changed row shows struck old qty, removed row struck + `SR_REMOVED`; concept change shows struck old concept; `[unverified]` chip for null-provenance claim; approximate cost never rendered without the `approx` tag; `showDetail=false` hides the panels; `technical` shows id chips + ops lines; missing-cost line lists `cost.missing`.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS (including the moved formatQty/extractStepMeta cases).
- [ ] **Step 5: Commit** — `feat(web): dish card with inline diff + trust strip`

---

### Task 6: `GateBar` rewrite (mode-based decision bar)

**Files:**
- Rewrite: `web/src/components/GateBar.tsx`
- Modify: `web/src/vocab.ts` (+ `web/src/vocab.test.ts`)
- Test: `web/src/components/GateBar.test.tsx`

**Interfaces:**
- Consumes: `GateVerb`, `Proposal`, `Draft`, `Op` from `../types`; `getShortcuts` from `../lib/shortcuts`; new vocab below.
- Produces:

```ts
export type GateMode = 'decide' | 'another' | 'tweak' | 'redirect' | 'takeover'
export default function GateBar({ proposal, draft, onAccept, onEditSubmit, onRegenerate,
  onAlternatives, onRedirectSubmit, onTakeoverSubmit, disabled }: {
  proposal: Proposal
  draft: Draft                                  // seed for the take-over editor
  onAccept: () => Promise<void> | void
  onEditSubmit: (ops: Op[]) => Promise<void> | void
  onRegenerate: () => Promise<void> | void
  onAlternatives: () => Promise<void> | void
  onRedirectSubmit: (steer: string) => Promise<void> | void
  onTakeoverSubmit: (draft: Draft) => Promise<void> | void
  disabled?: boolean
}): JSX.Element
```

**vocab.ts changes (update `vocab.test.ts` accordingly):**

```ts
export const STATE_LABEL: Record<string, string> = {
  idle: 'Ready', proposing: 'Thinking…',
  awaiting_gate: 'Needs your call', blocked: 'Safety hold',
}
export const VERB_LABEL: Record<GateVerb, string> = {
  accept: 'Use it', edit: 'Tweak it', regenerate: 'Regenerate',
  alternatives: 'Compare two options', redirect: 'Ask for changes',
  take_over: 'Edit it myself',
}
export const GATE_PROMPT = 'Want this change?'
export const GATE_ANOTHER_LABEL = 'Try another way'
export const BLOCKED_REGEN = 'Try a different way'
export const BLOCKED_REDIRECT = 'Ask for a safer change'
// STATE_GLOSS: keep keys, reword to the new register:
// idle 'ready for your next idea' · awaiting_gate 'a change is waiting on you'
// blocked 'a safety rule stopped this change'
```
(Keep `LEVEL_ONE_VERBS = ['accept','edit']`; `MORE_VERBS = ['regenerate','alternatives','redirect','take_over']` — the "Try another way ▾" row.)

**Markup port — design lines 424–486.** Sticky bottom bar (`sticky bottom-0 z-sticky border-t border-hairline-strong bg-panel`), `role="toolbar"` `aria-label="Decide on this change"` with the existing roving-tabindex Arrow-key pattern and the aria-disabled (never native `disabled`) in-flight lock — both preserved from the current GateBar implementation (see its header comment; keep those code paths).
- `decide` (428–438): `GATE_PROMPT` + primary **Use it** (accent fill, `text-on-accent`, kbd hint `A` in mono) + ghost **Tweak it** (`E`) + ghost **Try another way ▾**.
- `another` (440–450): Regenerate `G` · Compare two options `L` · Ask for changes `R` · Edit it myself `T` · ← Back. Escape → decide.
- `tweak` (452–461): the REAL ops editor — port the field list from the current `EditForm` in `Workbench.tsx:690-728` (one labeled input per op via `opLineLabel`, `editableValue`/`parseEdited` move here) with the design's visual voice; submit `Keep with edit` → `onEditSubmit(ops)`; Cancel → decide.
- `redirect` (463–472): steer input (placeholder `e.g. keep the salt but add brightness instead`) + Send (disabled while blank) + Cancel.
- `takeover` (474–483): mono textarea seeded `JSON.stringify(draft, null, 2)`, GOV.UK parse-error message pattern from the current `TakeOverForm` (aria-invalid/aria-describedby/focus-the-error), `Save draft` → parsed Draft.
- Shortcuts: document-level keydown (skip when target is input/textarea/select; Escape blurs — port design 908–921), gated on `getShortcuts().enabled`, dispatching through the same handlers; only active in `decide` mode.
- Focus: entering any form mode focuses its first field; Back/Cancel returns focus to the mode's opener (keep the `focusGateBar` protocol — it moves into this component).

- [ ] **Step 1: Failing tests** — decide shows the three controls with vocab labels; "Try another way" opens the four-verb row; all six verbs dispatchable (accept/edit-submit/regenerate/alternatives/redirect-submit/takeover-submit each reach their callback); tweak lists one input per op and submits edited values (reuse the old GateBar/EditForm test cases' op fixtures); redirect Send disabled when empty; takeover invalid JSON → error focused, no submit; ArrowRight cycles toolbar focus; keydown 'a' in decide fires onAccept, 'a' inside an input does not; Escape in 'another' returns to decide; in-flight lock: while a dispatch promise is pending buttons are `aria-disabled` and re-clicks don't re-fire.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement (vocab first, then bar).** **Step 4: Run** GateBar + vocab suites — PASS.
- [ ] **Step 5: Commit** — `feat(web): gate as a culinary decision — mode-based gate bar`

---

### Task 7: Stage state cards (proposing · hold · alternatives · header · toast · override)

**Files:**
- Create: `ProposingCard.tsx`, `SafetyHold.tsx`, `ProposalHeader.tsx`, `Toast.tsx` (in `web/src/components/`)
- Rewrite: `web/src/components/AlternativesPicker.tsx`
- Tests: matching `.test.tsx` for each; delete `SafetyBlock.test.tsx` assertions only after re-homing them in `SafetyHold.test.tsx`.

**Interfaces (produced):**

```ts
export function ProposingCard({ text, onCancel }: { text: string; onCancel: () => void })
// design 206–217: accent-soft card, spinner (cc-spin, aria-hidden), "Working on your idea",
// Stop button, streamed text + blink caret (both animations inert under reduced motion
// via the global media rule; text still updates).

export function SafetyHold({ reason, ruleId, ops, technical, onRegenerate, onRedirectSubmit }: {
  reason: string; ruleId: string; ops?: Op[] | null; technical: boolean
  onRegenerate: () => void; onRedirectSubmit: (steer: string) => void
})
// design 219–240: role="alert" tabIndex={-1}, self-focuses on mount (keep SafetyBlock's
// useEffect focus), critical border/bg, "Safety hold — this change was stopped", reason,
// "What it would have added" struck op lines (render via opLineLabel(op) — the wire gives
// Op[], not prose), technical → mono `rule_id: {ruleId}`, then BLOCKED_REGEN (ink fill)
// + BLOCKED_REDIRECT (ghost — opens an inline steer input matching GateBar's redirect row).
// ONLY these two verbs (§9).

export function ProposalHeader({ proposal, streaming, technical }: {
  proposal: Proposal; streaming: boolean; technical: boolean
})
// design 262–277: h2 "Here's the change I'd make", technical → mono `{move_type} · conf {n}%`,
// rationale paragraph, citation chips `{source} · {ref}`. Confidence NEVER gates anything.
// unverified claims list (proposal.unverified) → muted `unverified: …` line (field home).

export default function AlternativesPicker({ proposals, base, onPick }: {
  proposals: Proposal[]; base: Draft; onPick: (id: string) => void
})
// design 242–260: "Two ways to go — pick one to develop" + one card per proposal
// (letter A/B, headline = first citation-free rationale sentence? NO — use
// deltaSummary(list(p.change), base) as the title line and p.rationale trimmed to
// ~140 chars as the blurb), change lines from summarizeOps below. Card = one <button>.
// Picking = client-side selection → onPick(id) (Workbench keeps its selectedProposalId
// contract; gate verbs then target the picked proposal).

export function summarizeOps(ops: Op[], base: Draft): { sign: '+' | '→'; text: string }[]
// small helper in AlternativesPicker.tsx: add → '+', replace/remove → '→', text via
// opLineLabel/deltaSummary vocabulary; cap at 4 lines + '+n more'.

export function Toast({ message }: { message: string })
// design 728–730: fixed bottom-center ink-on-bg chip; render only when message non-empty;
// role="status".
```

Also: the 409 override — keep the existing `OverridePrompt` `<dialog role="alertdialog">` in `Workbench.tsx` (it already matches the design's modal semantics, 713–725); restyle only: critical 2px border, panel bg, title `Your edit trips a safety rule`, buttons `Go back — I'll change it` (ink fill, focused on open) / `Use it anyway` (critical ghost).

- [ ] **Step 1: Failing tests** — ProposingCard: renders text + Stop fires; SafetyHold: role=alert, focuses itself, reason + struck op labels, technical toggles rule_id, exactly two verb buttons, redirect input submits steer; ProposalHeader: rationale + citations + technical meta line + unverified line; AlternativesPicker: two cards, change lines with signs, click fires onPick with the right id; Toast: hidden when empty, role=status when set.
- [ ] **Step 2–4:** implement → suites PASS.
- [ ] **Step 5: Commit** — `feat(web): stage state cards for proposing/hold/alternatives`

---

### Task 8: `IntentBar` + deterministic chips + `CookFlow`

**Files:**
- Create: `web/src/components/IntentBar.tsx`, `web/src/components/CookFlow.tsx`
- Tests: `IntentBar.test.tsx`, `CookFlow.test.tsx`

**Interfaces:**

```ts
export default function IntentBar({ canPropose, autonomyOn, servings, suggestedNext, onMove }: {
  canPropose: boolean
  autonomyOn: boolean            // renders the 'auto' tag on deterministic chips
  servings: number               // current, for the scale prompt default (×2)
  suggestedNext: string[]        // wire move-type slugs
  onMove: (moveType: string, steer: string) => void
})
// design 406–421. Label "What do you want to try next?"; free-text input + "Try it →"
// (Enter submits) → onMove('', text)  ← EMPTY moveType = the kitchen classifies (the
// SteeringPane 'auto' option today; the design's client-side keyword router is mock-only).
// suggestedNext chips (MOVE_LABEL names) above the input: click → onMove(slug, '').
// "Just the math —" row: Scale servings… (opens an inline number input, default
// servings*2, submit → onMove('scale_servings', String(n))) · Convert units →
// onMove('unit_convert','') · Recompute cost → onMove('cost_recompute','') ·
// Recompute nutrition → onMove('nutrition_recompute',''). Each chip shows the success
// 'auto' micro-tag when autonomyOn (they auto-advance; §3.6).
// canPropose=false → render nothing (the stage shows a state card instead).

export default function CookFlow({ versionLabel, onSubmit }: {
  versionLabel: string                       // "Trial 2"
  onSubmit: (notes: string) => void
})
// design 386–404: the "Cooked this version?" row → expands to the tasting form
// ("Tasting notes — what worked, what to change?", textarea, "Rework from these notes"
// accent fill + Cancel). Submit → onSubmit(notes). Focus lands in the textarea on open.
```

- [ ] **Step 1: Failing tests** — IntentBar: Enter and button both call `onMove('', 'make it cheaper')` and clear the input; suggested chip calls `onMove('technique_step','')`; scale chip opens number input and submits `('scale_servings','4')`; auto tags render only when `autonomyOn`; nothing renders when `!canPropose`. CookFlow: row → form on click, textarea focused, submit passes notes, cancel collapses.
- [ ] **Step 2–4:** implement → PASS.
- [ ] **Step 5: Commit** — `feat(web): intent-first initiation + cook/tasting flow`

---

### Task 9: Workbench integration (the big swap)

**Files:**
- Rewrite layout in: `web/src/components/Workbench.tsx` (keep the wire logic — see Keep list)
- Modify: `web/src/components/DialToggle.tsx`, `web/src/components/ThemeToggle.tsx` (chrome-toggle restyle, design line 73/76 + 1135)
- Delete: `TrialStrip.tsx`, `SteeringPane.tsx`, `DraftPane.tsx`, `ProposedDraftView.tsx`, `SafetyBlock.tsx`, `RailTabs.tsx`, `VersionHistory.tsx`, `ProposalCard.tsx`, `DiffMark.tsx` + their tests (only after their assertions are re-homed; `DiffMark`'s sr-grammar assertions live in DishCard.test now)
- Modify: `web/tailwind.config.js` (drop `width.steering`/`width.versions`)
- Test: `web/src/components/Workbench.test.tsx` (major update)

**Keep verbatim (wire logic):** `resync`, the `useEffect` SSE subscription + all five handlers' state semantics, `expectedMove` staleness guard, `propose` (incl. auto-advance detection — its thread-append becomes a Toast + `refreshVersions`), `runGate` (incl. 409 → override panel), `gateTarget`, `cancelMove`, `promote`, `toggleDial`, `refreshVersions`, live-region `announce` machinery, route-focus, document.title, skip-link handlers (retargeted), `OverridePrompt`.

**Replace thread with:**
```ts
const [streamText, setStreamText] = useState('')          // onToken: if (e.moveId === expectedMove.current) setStreamText(t => t + e.text); cleared on ready/blocked/cancelled/failed/propose
const [cookNotes, setCookNotes] = useState<Record<string, string>>({})
const [toast, setToast] = useState('')                    // flash(msg): set + 2600ms clear (keep timer in a ref)
const [technical, setTechnical] = useState(() => localStorage.getItem(TECH_VIEW_KEY) === '1')
// TECH_VIEW_KEY: move the constant from ProposedDraftView.tsx unchanged (grep its value first)
```
`ThreadEntry`, `appendToken`, `finishTokens` die. `EditForm`/`TakeOverForm`/`RedirectForm` die here (their logic moved into GateBar in Task 6).

**New layout (design 53–78, 142–188, 424–488):**
```
<div bg-page text-ink min-h-screen>
  live region (kept) · skip links: "Skip to the dish" → #stage · "Skip to the decision" → gate/hold/intent anchor (kept handler pattern)
  <header sticky top-0 z-sticky h-header border-b bg-panel>          ← 54px
    [Dishes] · CapyCook / {title h1 (route-focus target, kept)} · state pill (dot color: idle success · proposing/awaiting accent · blocked critical + STATE_LABEL)
    [flex-1] · DialToggle · Technical-view toggle (aria-pressed, persists) · ThemeToggle
  </header>
  stub strip (design 80–82): getLLMStatus → mode + `budget ${spent} / ${cap}` when stub
  reconnect / move-failed / action-error banners (kept, restyled to token voice)
  <div class="wb-grid">                                              ← grid-cols-[308px_1fr]; <md: single column, stage first, timeline after (CSS order, design 40–45); NO RailTabs
    <TimelineSpine>  nodes=buildTimeline(versions,{viewingId:snapshot?.id??null, cookNotes, pendingProposal:(single pending)?{move_type,change}:null, baseDraft:detail.draft})
                     onView→setSnapshot(find version)·announce; onPromote→promote
    <section id="stage">
      <TrustStrip draft={displayDraft} />
      snapshot → banner (design 198–204: "Viewing a past trial — {Trial n}, read-only." + Back to current) above a plain DishCard(snapshot.draft, showDetail)
      blocked  → SafetyHold(reason, ruleId, ops, technical, onRegenerate=()=>onVerb('regenerate'), onRedirectSubmit=steer=>runGate({proposalId:gateTarget()!, verb:'redirect', edit:{steer}}))  + plain DishCard(detail.draft) below (the dish stays visible under the hold)
      proposing→ ProposingCard(streamText, cancelMove) + plain DishCard(detail.draft)
      1 pending→ ProposalHeader(selected, false, technical) + DishCard(draft=detail.draft, diff=mergeDiff(detail.draft, list(selected.change)), ops=selected.change, technical)
      2+ pending→ AlternativesPicker(pending, detail.draft, onPick=setSelectedProposalId → then renders as 1-pending path against the picked one — keep a picked flag so the compare view yields to the diff view)
      idle     → DishCard(detail.draft, showDetail) + CookFlow(versionLabel=trialAlias(currentIndex+1), onSubmit=notes=>{setCookNotes({...cookNotes,[cur]:notes}); void propose('iterate_feedback', notes, detail.currentVersionId!)}) + IntentBar(canPropose, detail.autonomyDial, servings, suggestedNext, onMove=(mt,steer)=>void propose(mt,steer))
      snapshot + idle also gets CookFlow against the snapshot version (cook an old trial — design 386–391 shows the row on snapshots too)
    </section>
  </div>
  awaiting_gate && exactly-one-target → <GateBar proposal={selected} draft={detail.draft} …all six callbacks wired to runGate/onVerb/gateTarget/> (sticky bottom INSIDE the stage column, design 426)
  <Toast message={toast} /> · OverridePrompt (kept)
</div>
```
Auto-advance path: `propose` detecting the silent version change → `flash(\`${MOVE_LABEL[mt] ?? mt} — applied automatically (safe step)\`)` + announce + `refreshVersions` (design 983).

- [ ] **Step 1: Rewrite `Workbench.test.tsx` first** against the new DOM, preserving every behavioral contract the old suite guarded (mock `api.ts` + the stream handle exactly as the current tests do — reuse its harness): load+render; token → ProposingCard text grows; proposal-ready → gate visible + announce + `aria-current` pending node in timeline; stale proposal-ready ignored; accept → runGate + toast; blocked → SafetyHold with two verbs only; 409 edit → override dialog → confirm resends with `confirmOverride`; alternatives two sequential events → picker → pick → diff view; cancel; move-failed banner + retry; reconnect → resync; snapshot view + promote; cook flow → `postMove('iterate_feedback', notes, versionId)`; auto-advance → toast + no gate; skip links focus stage/decision; header state pill text from `STATE_LABEL`. Expect: FAIL against old markup.
- [ ] **Step 2: Rewrite the Workbench render + state changes; restyle DialToggle/ThemeToggle; add `.wb-grid` (index.css: `display:grid; grid-template-columns:308px 1fr;` + `@media (max-width:1023px)` single column + order swap + timeline `border-top`).**
- [ ] **Step 3: Delete the dead components + their tests; drop the dead tailwind widths; fix all imports.**
- [ ] **Step 4: Verify** — `npx tsc -b && npx vitest run` — FULL suite PASS. `rg -n "TrialStrip|SteeringPane|DraftPane|ProposedDraftView|SafetyBlock|RailTabs|VersionHistory|ProposalCard|DiffMark" web/src` → no hits.
- [ ] **Step 5: Commit** — `feat(web): direction-A workbench — timeline spine, stage, gate, intent bar`

---

### Task 10: a11y + responsive polish, live verification, evidence

**Files:**
- Modify: whatever the walk flags (expected: focus order tweaks, aria labels, contrast fixes)
- Create: `docs/02a-frontend-redesign/evidence/` screenshots
- Modify: `docs/02a-frontend-redesign/milestone.md`, `handoff.md`, `docs/milestones.md`

- [ ] **Step 1: Full-suite + typecheck + `make test` (Go untouched — must still pass).**
- [ ] **Step 2: Live walk (dev server + browser, stub mode):** create a dish → propose ("make it richer") → watch streaming → gate: tweak → accept → timeline grows → cook flow → tasting → rework diff → alternatives → pick → safety trip (steer "infuse garlic in oil at room temp for two days") → hold verbs → recover → take-over with a garlicky-oil draft → 409 modal → back off. Both themes; viewport 1440 and 400px; keyboard-only pass (skip links, A/E/G/L/R/T, arrows in toolbar, Escape); VoiceOver spot-check of the live region on proposal-ready.
- [ ] **Step 3: Screenshots** (light+dark × {intake, idle fiche, proposing, gate-on-dish, alternatives, safety hold, override, snapshot, narrow gate}) → `docs/02a-frontend-redesign/evidence/`.
- [ ] **Step 4: Docs:** flip slice statuses in `milestone.md`; overwrite `handoff.md`; dated log line for anything learned; update `CLAUDE.md` frontend line (graybox → direction-A workbench).
- [ ] **Step 5: Commit** — `feat(web): redesign polish + evidence — direction A shipped`

---

## Self-Review (done at planning time)

- **Spec coverage:** §9 items each land in a named task (gate/verbs → T6; hold+409 → T7/T9; honesty → T5; streaming/cancel/alternatives/auto-advance → T7/T9; four states → T9; a11y → every task + T10; every-field-a-home → T5 (constraints incl. dietary; nutrition.unverified; cost.missing; citations; confidence; suggested_next → T8; fdc/foodon + ops + rule_ids → technical view T5/T7; parentVersionId → branch badge T3). Deliberate omissions to document in milestone.md: `Citation.date` (chips show source·ref only — matches design), per-node move-type slugs in the timeline (not on the wire's VersionItem).
- **Placeholder scan:** clean — every step names files, code or design line ranges, and expected outcomes.
- **Type consistency:** `TimelineNode`/`buildTimeline` (T3→T4/T9), `DishCard(draft,diff,ops,technical,showDetail)` (T5→T9), GateBar callbacks (T6→T9), `onMove(moveType,steer)` (T8→T9 `propose`), `summarizeOps` local to T7 — checked.
