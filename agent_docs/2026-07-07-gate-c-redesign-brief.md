# Gate-C Redesign Brief — Accessibility + IA + Brand Feel

Milestone 01, Phase 5 redirect. Synthesized 2026-07-07 from three research passes
(accessibility audit of `web/src`, IA research vs. culinary-R&D/agentic-review
references, brand-feel research vs. fine-dining/computational-gastronomy references).
This is the working input for the redesign build phase. Evidence screenshots:
`docs/01-end-to-end/evidence/phase5/`.

---

## 0. LOCKED constraints (violating any of these fails the gate)

- **Visual language is LOCKED.** Acne-structure minimalism (12px uppercase UI, square
  corners, hairline borders, no shadows) + Anthropic warm palette (ivory/oat surfaces,
  slate text, terracotta accent), light + dark themes. No new palettes, typefaces,
  radii, shadows, or tokens. **One permitted token-value edit** (a11y compliance, stays
  in the terracotta family): repoint `--focus-ring` from `--color-accent` to
  `--color-accent-text` (`tokens.css:143`).
- **Wire protocol is FROZEN.** The six gate verbs (`accept / edit / regenerate /
  alternatives / redirect / take_over`), move-type enums (`seed_expand`,
  `flavor_direction`, …), and SSE event shapes stay as-is. **One additive API change
  is in scope**: the `proposal.blocked` SSE event / GET payload must include the
  blocked ops so the UI can show the evidence (see task 6). Surface *labels* may be
  translated; enums never change.
- **PREREGISTRATION.md untouched.** Nothing here touches eval methodology.
- **No new dependencies.** Everything below is achievable with React + Tailwind +
  the existing token/chip system. (Tailwind's `sr-only` utility and native
  `<dialog>` count as existing capabilities.)
- Keep what already passes: real `<button>`s, `fieldset/legend` on Big-9,
  `role="switch"` dial, `role="status"/"alert"` banners, the global
  `prefers-reduced-motion` clamp (`index.css:27–36`), `aria-hidden` decorative
  glyphs, text-labeled chips.

---

## 1. The redirect

**Verbatim:** the UI "looks good from a stylistic standpoint" but needs better
**accessibility** and **information architecture** so the app "exudes a
Michelin-star, agentic computational gastronomy, recipe development platform that
cooks of all levels can use."

**Interpretation.** Three distinct mandates, one direction:

1. *Accessibility* — the core loop (notice a state change → review a diff → act on
   the 6-verb gate) is today invisible and inoperable non-visually: no live regions,
   no focus management, one keyboard-dead widget (alternatives picker), measured
   AA contrast failures. Fixes are almost entirely invisible (semantics, focus,
   two token-family edits) — the locked style survives intact.
2. *Information architecture* — the decision object (the proposal) is buried third
   on the page as a raw RFC-6902 ops dump; versions (the actual product of dish
   development) are hidden behind a toggle; six flat verbs conflate three altitudes;
   the UI narrates its own wire protocol. Fix by re-ranking, not restyling.
3. *"Michelin-star, computational gastronomy, all levels"* — the functional notation
   IS the luxury (Noma Projects, Modernist Cuisine, HACCP). Stop apologizing for the
   data: typeset it like a test kitchen's instrument panel, adopt the professional
   kitchen's own state vocabulary (pass / hold / trial / tasting note / station
   card), and keep novices oriented with plain-language glosses. Zero new tokens.

These converge: nearly every change is placement, semantics, ranking, and words.

---

## 2. Design goals

Make the gate loop fully perceivable and operable for every cook — narrated to
assistive tech, keyboard-complete, focus-managed. Re-rank every surface around the
proposal-as-recipe-diff and the trial record, with the machinery (ops, ids,
confidence) exactly one disclosure away. Speak the development kitchen's own
language — pass, hold, trial, tasting notes, station card — so precision reads as
Michelin/lab craft while first-use glosses keep beginners oriented, all inside the
locked tokens.

---

## 3. Contradictions between research inputs — calls made

| # | Conflict | Call |
|---|----------|------|
| 1 | IA: never show `/INGREDIENTS REPLACE` paths in the default view. Brand-feel: slash-path + op chip is "legitimate lab notation," keep it. | **IA wins for the default view**: section labels in cook vocabulary ("Ingredients — changed") with the compact op chip (ADD/REPLACE/REMOVE) retained; raw JSON-pointer paths live only in Technical view. The lab-notation feel is carried by quantities/temps/percent notation instead. |
| 2 | IA: provenance ids (`fdc:`, FoodOn) behind Technical view. Brand-feel: keep visible — they're the Gretel "hyper-functional labelling" credibility. | **Split by surface.** Draft canvas (idle): visible at smallest mono size with a once-per-pane footer legend (`sourced — USDA FoodData Central · FoodOn`). Proposal diff (decision moment): behind Technical view — cognitive load at the gate wins. |
| 3 | IA: confidence behind Technical view. Brand-feel: keep `conf 0.60` visible with a gloss. | **Technical view only** (novice narrative requires never meeting it); when shown, it carries the gloss "kitchen's confidence in this move." Technical view is a persisted preference, so power users see it always. |
| 4 | Brand-feel kitchen jargon (AT THE PASS, BENCH READY) vs. IA/redirect "cooks of all levels" plain language. | **Adopt the naming map**, but every renamed state carries a plain-language gloss on first appearance / as subtitle (e.g. `AT THE PASS — awaiting your decision`). Pros recognize the form; beginners absorb it as craft education. |
| 5 | Brand-feel: move-type chips (`flavor_direction`) "stay as-is." IA: translate slugs everywhere. | **Translate everywhere a human reads them** — plain label primary, slug demoted to secondary mono text (picker, chips, thread). Wire enums untouched. |
| 6 | IA: alternatives as A/B "tabs." A11y: alternatives as APG radio group. | **One control:** semantically an APG radio group (roving tabindex, arrow keys, `aria-checked`), visually the IA comparison switcher. Not the tabs pattern. |
| 7 | A11y: fix warning-chip contrast (ink text on warning-surface). Brand-feel: delete the chip pile entirely (one uncertainty ledger line). | **Both.** Collapse to the ledger line (brand-feel #3); the ledger and any surviving warning chips use the fixed ink-on-warning-surface + `border-warning` variant. |
| 8 | Brand-feel: six verb labels "stay verbatim" on surface. IA: level-1 verb reads "Ask for changes" (= redirect). | **Wire enum frozen; surface split by level.** Level 1: `ACCEPT` + `ASK FOR CHANGES` (secondary mono slug `redirect`, consistent with call #5). The More ▾ group keeps verbatim names (EDIT · REGENERATE · ALTERNATIVES · TAKE OVER). All-levels mandate wins at the primary decision surface. |
| 9 | IA: rationale streams pinned to canvas top. A11y: never live-region the token stream. | **Both, different channels.** Visually the stream pins to the canvas; aurally only start/completion are announced via the status region (optional sentence-chunk buffer on ~2s debounce in a second polite region). |

---

## 4. Accessibility workplan

### 4a. Audit table (current gaps, verified against `web/src` + screenshots)

| # | Area | Gap | Evidence | WCAG / pattern |
|---|------|-----|----------|----------------|
| 1 | SSE rationale stream | No `aria-live` anywhere in the thread; streamed tokens, cancel rows, and the header state label mutate silently. | `SteeringPane.tsx:51–61`, `Workbench.tsx:99,304` | 4.1.3 Status Messages; live region must pre-exist (Soueidan) |
| 2 | Proposal arrival | `onProposalReady` only `setState`s — the product's most important transition has no announcement and no focus move. | `Workbench.tsx:100–106,413` | 4.1.3; heading-focus on view change (Fable/Gatsby testing) |
| 3 | Block state | `role="alert"` announces, but focus isn't moved and the gate bar remount (6→2 verbs) can drop focus to `<body>`. | `SafetyBlock.tsx:9`, `Workbench.tsx:415–419`, `GateBar.tsx:69–71` | 2.4.3 |
| 4 | Gate-bar lock | Native `disabled` on all verbs while dispatching → focused button unmounts focus to `<body>`; SR goes silent mid-action. | `GateBar.tsx:41–42,61,76` | Use `aria-disabled` + click guard (CSS-Tricks, MDN) |
| 5 | Gate-bar keyboard model | Six tab stops, `role="group"`, no roving tabindex/arrows/shortcuts; label just "Gate"; dispatch spinner never announced. | `GateBar.tsx:72–83` | APG Toolbar |
| 6 | Alternatives picker | **Hard keyboard failure**: cards are `<div onClick>` — unfocusable, no role/state, "Click to select." | `ProposalCard.tsx:64–72`, `Workbench.tsx:385–389` | 2.1.1, 4.1.2; APG Radio Group |
| 7 | Diff aural legibility | Old value = CSS strikethrough, new = bg tint; neither announced; `→` aria-hidden with no textual equivalent — old/new mash together for SR users. | `ProposalCard.tsx:40–49` | 1.3.1 (MDN: `<del>/<ins>` not announced by default) |
| 8 | Seed-form errors | Summary `role="alert"` but not focused, errors not links, no `aria-invalid`/`aria-describedby` on fields. | `SeedSetup.tsx:60–64,92–96,138–143` | 3.3.1/3.3.2; GOV.UK pattern |
| 9 | Landmarks/headings/title | No `<h1>`; `<header>` inside `<main>`; unnamed `<section>`s; `document.title` never updated; `navigate()` neither announces nor focuses. | `App.tsx:18–25`, `Workbench.tsx:298–321`, panes | 2.4.2, 1.3.1, 2.4.1; Sutton SPA-routing research |
| 10 | Skip links | None; keyboard path to the gate crosses header + draft + panels. | `App.tsx`, `Workbench.tsx:296–321` | 2.4.1 |
| 11 | Target size | "I cooked this"/"Promote" ≈18px; chips ≈18px; Big-9 checkbox 10×10px; Dismiss ≈16px — all under the 24px floor. | `VersionHistory.tsx:56–66`, `SteeringPane.tsx:67–70`, `SeedSetup.tsx:114–115`, `Workbench.tsx:355` | 2.5.8 (24×24) |
| 12 | Contrast (measured) | Light `--color-warning` #B36200 on warning-surface = **3.93:1** → 11px `[unverified]` chips, "MOVE FAILED", "SAFETY WARNING" fail AA normal text. Dark passes (6.59:1). All other pairs pass. | `Chips.tsx:35,47`, `Workbench.tsx:332,623`, `tokens.css:124–125` | 1.4.3 |
| 13 | Focus-ring contrast | Ring = accent #CC785C: 2.85:1 on oat, 2.86:1 warning-surface, **2.70:1 critical-surface** — fails exactly where safety actions live. | `index.css:22–25`, `tokens.css:143` | 1.4.11 |
| 14 | Override prompt | `role="alertdialog"` with none of its contract: no labelledby/describedby/modal/focus/trap/Escape. | `Workbench.tsx:621–630` | APG Alert Dialog |
| 15 | Verb panels | Open with no focus move; Cancel doesn't return focus; TakeOver parse error unlinked; Edit labels are raw JSON-pointer paths. | `Workbench.tsx:392–407,526–609` | 2.4.3, 3.3.1/3.3.2 |
| 16 | State-as-color-only | Selected snapshot row = `bg-surface` only, no `aria-current`; DialToggle label mismatch. | `VersionHistory.tsx:39`, `DialToggle.tsx:7` | 1.4.1, 2.5.3 |

### 4b. Prioritized fixes — exact patterns

- **P1 — Gate-lifecycle live region + focus protocol** (#1, #2, #3). One
  **permanent, visually-hidden `role="status"`** element mounted in `Workbench` at
  first render (regions must pre-exist). Push one-sentence lifecycle messages:
  "Proposing a move…", "Proposal ready — 3 changes to review", "Two alternatives
  ready — pick a card", "Move failed", "Move cancelled", "Accepting…". Keep
  `role="alert"` on SafetyBlock. Do **not** live-region the token stream; announce
  start + completion (optional: sentence-chunk buffer, ~2s debounce, second
  `aria-live="polite"` region). **Focus protocol (four rules):** proposal-ready →
  focus a `tabindex="-1"` heading above the card(s); blocked → focus the SafetyBlock
  container; panel open → focus panel heading/first field; panel cancel or gate
  resolve → return focus to the gate bar.
- **P2 — Alternatives → APG Radio Group** (#6). `role="radiogroup"
  aria-labelledby="proposal-heading"`; each card `role="radio"
  aria-checked={selected} tabindex={selected ? 0 : -1}`, roving tabindex, arrows
  move+check. Kill "Click to select"; keep the terracotta border as the visual
  channel. Pairs with the IA comparison header (what differs per alternative).
- **P3 — Aural diff grammar** (#7). In `DiffLine`: `<del className="line-through
  text-muted no-underline"><span className="sr-only">was: </span>{from}</del>` and
  `<ins className="px-1 bg-success-surface text-ink no-underline">
  <span className="sr-only">now: /added: </span>{value}</ins>`; each line
  `role="group" aria-label="Ingredients — replace"` (cook vocabulary per call #1).
  Reference: GitHub's Files-Changed a11y overhaul.
- **P4 — Gate bar → APG Toolbar + non-destructive lock** (#4, #5).
  `role="toolbar" aria-label="Gate — respond to the proposal"`, roving tabindex
  (one Tab stop, Left/Right arrows), `aria-disabled={locked}` + existing click
  guard instead of `disabled`, lock announced via P1 region. Shortcuts (task 4):
  active only while focus is in the workbench, exposed via `aria-keyshortcuts` +
  visible hint, remappable/disableable (WCAG 2.1.4).
- **P5 — Seed intake → GOV.UK error pattern** (#8, part of #15). Focus the summary
  (`tabindex="-1"` + `.focus()`), errors as `<a href="#servings">` links, fields get
  `aria-invalid="true"` + `aria-describedby` → inline error span. Same treatment for
  TakeOver's JSON parse error.
- **P6 — Landmarks, title, route focus, skip links** (#9, #10). Dish title becomes
  the `<h1>` (heading level is structural, visual size stays 13px); header outside
  `<main>`; panes become named landmarks via `aria-labelledby`; `navigate()` sets
  `document.title = "${dishTitle} — CapyCook"` and focuses the new screen's h1; two
  skip links ("Skip to gate bar", "Skip to steering").
- **P7 — Contrast, inside locked tokens** (#12, #13). (a) Warning chips/labels at
  11–12px: text → `--color-ink` on `--color-warning-surface` + `border-warning`
  (border passes non-text 3:1); reserve `text-warning` for ≥16px/bold — one edit in
  `Chips.tsx` VARIANTS fixes all chips. (b) `--focus-ring` → `--color-accent-text`
  (#A04E30 / #D98E73): ≥3:1 on every surface including safety banners.
- **P8 — Target-size floor** (#11). `min-h-[24px] min-w-[24px]` on version-row
  buttons, suggested chips, Dismiss; Big-9 keeps the 10px visual square but the
  invisible input covers the full chip hit-area (24px circle test passes, zero
  visual change).
- **P9 — Override prompt → real alert dialog** (#14). Native `<dialog showModal>`:
  `aria-labelledby` → "Safety warning" heading, `aria-describedby` → message,
  focus opens on **Back** (least destructive), Escape cancels, focus returns to the
  invoking verb. Styles fine under hairlines.
- **P10 — Small semantics** (#15, #16). Panel focus moves per P1 protocol; Edit
  labels become per-field cook labels; `aria-current` on the selected snapshot row;
  DialToggle accessible name contains its visible label.

**Highest leverage (do first): P1, then P2+P3, then P7** — the loop becomes
narrated, the diff becomes a real reviewable object, and every measured AA failure
clears with two token-family edits + one chip variant.

---

## 5. IA restructure

### 5a. Spine and zones

**The recipe card is the one persistent canvas; everything else stages around it by
state.** Three zones (re-plumbing, not re-skinning):

- **Canvas** (center, always): the dish in standardized-recipe / fiche-technique
  form — title/concept, dashboard line, ingredients in order of use, numbered method
  with time/temp chips, chef's notes (flavor rationale), STATION CARD (constraints).
  Proposals render *as this document with inline change marks*.
- **Development rail** (right, 390px → drawer under `--bp-md`): the steering
  conversation — direction input, streamed rationale, resolved-move log ("Accepted →
  v3 — + lemon finish") — plus the composer (intent chips + free text).
- **Record strip** (top of canvas, one line): trial pills (`TRIAL 1 · TRIAL 2 ·
  TRIAL 3●` …) + constraint chips (allergens always visible; rest behind "+3").
  Replaces both the Constraints card position and the hidden VersionHistory column;
  expands downward on demand.

### 5b. State × surface map

| State | PRIMARY (owns the fold) | SECONDARY (visible, quiet) | COLLAPSED / on-demand |
|---|---|---|---|
| **Seed setup** | Seed text + allergens + servings + skill | "More constraints" disclosure (dietary/equipment/on-hand) | cuisine (locked) |
| **Idle, draft exists** | Recipe canvas; composer CTA in rail | One-line analysis dashboard (expands to full panels); trial strip; **"Tasting notes / I cooked this" on the current pill** | Provenance footer legend, constraint detail, thread history |
| **Proposing** | Canvas dims; streaming rationale card pinned to canvas top (where the change lands) + Cancel | Rail shows same stream compact | everything else |
| **At the pass (1 proposal)** | **Proposal-as-recipe-diff**: canvas shows the would-be draft with inline strike/adds; header = move intent in plain words + 1-line rationale | Gate bar: **ACCEPT (filled) · ASK FOR CHANGES · More ▾**; full rationale | "Technical view" → raw ops, confidence, provenance, unverified flags |
| **At the pass (alternatives)** | Comparison header — one row per alternative stating what differs ("A: lemon finish · B: yogurt-garlic sauce") + selected one as recipe-diff | Radio-group switcher A/B; gate bar scoped to selection | Full diff of unselected |
| **Safety hold (blocked)** | `SAFETY HOLD — CRITICAL LIMIT` pinned to canvas top **with the blocked change grayed beneath**, rule anchored to the offending line; `CORRECTIVE ACTION →` row | Only legal verbs: REGENERATE · REDIRECT | rule id detail, CDC citation |
| **History / snapshot** | Selected trial as read-only canvas + "compare to current" toggle | trial strip stays; Promote / Tasting notes / Branch on the pill | full `ver_` hashes |
| **Post-cook** | Tasting-note composer over the cooked version | rework proposal re-enters the normal pass | — |

Narrow (<`--bp-md`): rail + record strip become bottom tabs — **Recipe | Develop |
History** — gate bar fixed at bottom (the one non-negotiable control). Canvas never
scrolls horizontally.

### 5c. Staged novice → expert flow

**First-time cook.** Seed screen = one question + allergen chips + servings; free-text
constraint fields live behind "More constraints." Workbench opens on an empty canvas
with a single filled CTA, **"Draft this dish"** (no move-type select; `auto` is the
novice entry). Rationale streams in sentences on the card she's looking at. The
proposal arrives as a readable recipe — new lines tinted, plain-language header
("First draft — kept it weeknight-simple"). Her gate is two buttons: **Accept** and
**Ask for changes** (plain-text box = redirect). Accept → `TRIAL 1` pill appears.
After cooking, the current pill's **Tasting notes** CTA takes "too salty, cut the
feta" and one rework proposal returns through the same two-button gate. She completes
the full ATK loop without ever meeting `seed_expand`, `/INGREDIENTS REPLACE`,
`fdc_id`, `conf 0.60`, or JSON.

**Power user.** Same surfaces, density on demand. Intent picker shows plain labels
with slugs as secondary mono; single-key gate shortcuts (`A` accept, `E` edit, `G`
regenerate, `L` alternatives, `R` ask-for-changes/redirect, `T` take over — scoped +
remappable per P4). Flips **Technical view** once (persisted): raw ops, confidence,
citations, provenance return at full density. Alternatives = comparison header,
arrow between A/B, accept B. Branches from TRIAL 2 via the strip; autonomy dial
stacks collapsed "auto-applied" entries in the rail; Take over gets a structured
editor with the raw-JSON tab still present. Zero features removed — only re-ranked.

### 5d. Current-IA audit findings driving this (evidence)

A. Proposal renders below draft *and* constraints (`DraftPane.tsx:91–92`; screenshot
04) — the decision object is third on the page. B. Diff speaks RFC-6902 + provenance
tuples at full strength (`ProposalCard.tsx:33–53`); Take over is a raw 16-row JSON
textarea presented as a peer of Accept (`Workbench.tsx:552–581`). C. Rationale
appears twice (thread + card). D. Versions hidden behind a toggle; "I cooked this"
two clicks deep (`Workbench.tsx:314–319`, `VersionHistory.tsx:56–59`). E. Blocked
state clears the evidence (`Workbench.tsx:107–113`). F. Alternatives are serial
op-dump walls (screenshot 08). G. Six flat verbs conflate decision / revision /
mode-switch. H. Slug vocabulary leaks everywhere (`SteeringPane.tsx:64–81`).
I. No narrow-viewport strategy (`tailwind.config.js:78`; `--bp-*` tokens unused).
J. Up-to-8 stacked `[unverified]` chips invert signal (screenshot 13).

---

## 6. Voice + notation guide

**Register: "chef de cuisine writing a station card."** Declarative present, no
exclamation marks, no marketing adjectives, no "AI"/"assistant"/apologies. The model
is **"the kitchen"**; the user is the chef: the kitchen proposes, the chef decides at
the pass. Failure is rigor: after regenerate/redirect, "Trial retired. The kitchen
will draft another" — never "something went wrong" for an intentional kill. Every
precision datum a beginner might not parse gets a plain-language clause in the same
breath (the existing `why:` sub-lines are the house pattern — extend to technique
chips and safety rules). State uncertainty **once, precisely** — never chip confetti.

### Naming map (string swaps; wire enums untouched; each renamed state gets a first-use gloss)

| Surface | Current | Proposed |
|---|---|---|
| Header status | `AWAITING GATE` | `AT THE PASS` (gloss: "awaiting your decision") |
| Header status | `BLOCKED BY SAFETY GATE` | `ON HOLD — SAFETY` |
| Header status | `IDLE` | `BENCH READY` |
| Safety banner | `SAFETY GATE BLOCKED THIS MOVE` | `SAFETY HOLD — CRITICAL LIMIT` + mono `rule:` chip + `CORRECTIVE ACTION →` row preceding the verbs |
| Versions rail | `VERSIONS` / bare cards | `TRIALS` / `TRIAL 3 · ver_3d04a4f2` (8-char hash; full on snapshot) |
| Feedback prompt | `HOW DID IT COOK? …` | `TASTING NOTES — what worked, what changes?` |
| Feedback CTA | `PROPOSE A REWORK` | keep |
| Promote confirm | `promoted version ver_x` | `ver_x promoted to service` |
| Steer field | `STEER (OPTIONAL)` | `DIRECTION (OPTIONAL)` |
| Alternatives header | `CLICK TO SELECT` | `TASTING — SELECT ONE TO DEVELOP` |
| Constraints block | `CONSTRAINTS` | `STATION CARD` (rows verbatim) |
| Dial | `DIAL: AUTO` | `Auto-apply safe steps: ON` |
| Draft empty state | `Empty draft — propose…` | `The bench is clear. One move sketches the dish — propose it when ready.` |
| Thread empty state | `No moves yet…` | `Development opens with a move. The kitchen is ready below.` |
| Gate verb (level 1) | `REDIRECT` | `ASK FOR CHANGES` (slug `redirect` secondary; More ▾ verbs keep verbatim names — call #8) |

### Notation rules (existing mono face, 12px scale, hairlines, chip component)

- **Quantities:** mono, tabular, right-aligned value column, thin space before unit:
  `30 ml` · `10 g` (already the house signature — protect it).
- **Baker's-style percentages:** optional third mono column, one decimal, anchor
  ingredient = 100% (Modernist Cuisine) — the "computational" tell.
- **Temps/times:** paired units, mono, headline-separable inside steps:
  `204 °C / 400 °F` · `35 min` — never buried mid-sentence (ChefSteps rule).
- **Yield, doubly expressed:** `serves 2 · 280 g / portion` (fiche convention).
- **Dashboard line** (idle canvas + header flourish): one mono row
  `SERVES 2 · 280 g/PORTION · $0.18/SERVING · 123 kcal · ~20 MIN` — all values
  already computed on screen, just scattered. Header carries one signature datum
  beside the title (`TRIAL 3 · $0.18/SERVING`) — the Noma weather-readout move:
  restraint permits exactly one flourish, and it's a precise live number.
- **Cost:** `$0.36 total · $0.18 / serving`; exclusions go in the uncertainty
  ledger, not beside the number.
- **Uncertainty ledger:** one mono line per analysis card, expandable:
  `estimates — nutrition unverified (model claim) · cost approximate, 2 unpriced`
  (ink text on warning-surface + warning border, per a11y P7).
- **Provenance:** smallest mono on the draft canvas; footer legend once per pane:
  `sourced — USDA FoodData Central · FoodOn`; behind Technical view inside diffs
  (call #2).
- **Timestamps:** one fixed format, `07 Jul 2026 · 07:34`.
- **Diff values:** always dish notation (the aligned ingredients table), never raw
  wire tuples — `(fdc_id: 171413 · qty: 30 · unit: ml)` is the one surface that
  currently reads debug-console instead of lab-notebook.

---

## 7. Prioritized task list (one build phase; ordered by leverage)

1. [ia] **ProposedDraftView** — render proposals as the post-move recipe on the canvas with inline change marks + plain-language header; raw ops/confidence/JSON-pointer paths/provenance move behind a persisted "Technical view" toggle (`DraftPane.tsx`, `ProposalCard.tsx`, `Workbench.tsx:379–408`).
2. [a11y] Permanent sr-only `role="status"` lifecycle region + four-rule focus protocol (proposal→heading, hold→alert block, panel open→panel, resolve/cancel→gate bar) in `Workbench.tsx` (~40 lines, zero visual change).
3. [ia] Gate bar two-level: **ACCEPT (filled) · ASK FOR CHANGES (inline text = redirect) · More ▾** (EDIT · REGENERATE · ALTERNATIVES · TAKE OVER); Edit form becomes per-field cook-labeled inputs (`GateBar.tsx`, `Workbench.tsx`).
4. [a11y] Gate bar semantics: APG toolbar + roving tabindex, `aria-disabled` lock (never native `disabled`), scoped/remappable single-key shortcuts with `aria-keyshortcuts` + visible hint.
5. [a11y][ia] Alternatives: APG radio-group cards under a comparison header stating what differs per alternative; kill "Click to select" (`ProposalCard.tsx:64–72`).
6. [ia][feel] Safety hold keeps its evidence: additive API change ships blocked ops in `proposal.blocked`; render the grayed proposal under `SAFETY HOLD — CRITICAL LIMIT` with the rule anchored to the offending line and a `CORRECTIVE ACTION →` row above REGENERATE/REDIRECT; focus the hold (`Workbench.tsx:107–113`, server).
7. [ia][feel] **TrialStrip**: persistent `TRIAL n · ver_8char` pills atop the canvas with auto-derived delta summaries, current marker, branch forks; **Tasting notes ("I cooked this") on the current pill**; `VersionHistory.tsx` becomes its expansion.
8. [a11y] Aural diff grammar: `<del>/<ins>` + sr-only "was:/now:/added:" prefixes + per-line `role="group"` labels in cook vocabulary (`ProposalCard.tsx:40–49` / new diff renderer).
9. [feel][ia] **vocab.ts** glossary applied everywhere humans read: naming map above, plain-language move labels with slugs secondary, version aliasing (v1/v2/v3 per dish, never bare `ver_…` in the thread), first-use glosses.
10. [feel] Fiche-technique canvas: dashboard line, ingredients as aligned qty/name(/±%) table, paired-unit temps/times pulled out of step prose, STATION CARD block, one signature header datum.
11. [feel][a11y] Uncertainty ledger: collapse the `[unverified]`/`[approx]` chip pile to one expandable ink-on-warning-surface line per analysis card.
12. [a11y] Contrast pair: repoint `--focus-ring` → `--color-accent-text` (`tokens.css:143`); warning chip variant → ink text + `border-warning` (`Chips.tsx`) — clears every measured AA failure.
13. [a11y] Structure pass: dish title = `<h1>`, named section landmarks, per-dish `document.title`, route-change focus, two skip links; GOV.UK error pattern on seed form + take-over parse error.
14. [ia][a11y] Narrow-viewport collapse: below `--bp-md` rails become bottom tabs (Recipe | Develop | History) with the gate bar fixed; 24px target floor everywhere (version rows, chips, Dismiss, Big-9 hit-area trick).
15. [a11y] Override prompt → native `<dialog showModal>` alert dialog (labelledby/describedby, focus on Back, Escape cancels, focus returns to invoking verb).

Items 1–6 change what the app *is* at its core moment; 7 changes what it's *about*;
9–11 are cheap string/layout work carrying most of the brand shift; 12 is minutes of
work; 13–15 close the remaining compliance holes. All 15 preserve the locked visual
language.

---

## 8. Sources (deduplicated)

**Accessibility.** WCAG 2.1/2.2 (SC 1.3.1, 1.4.1, 1.4.3, 1.4.11, 2.1.1, 2.1.4,
2.4.1–2.4.3, 2.5.3, 2.5.8, 3.3.1/3.3.2, 4.1.2, 4.1.3) · APG patterns: Toolbar,
Radio Group, Alert Dialog · Sara Soueidan, live-region timing · MDN: `aria-disabled`,
`<del>`/`<ins>` announcement caveats · CSS-Tricks, "Making Disabled Buttons More
Inclusive" · GOV.UK Design System: Error Summary + Error Message · Fable/Gatsby
focus-management user testing; Marcy Sutton, client-side routing research · GitHub
Files-Changed accessibility overhaul.

**Culinary R&D / IA.** meez — getmeez.com (scaling, sub-recipes help article) ·
Galley Solutions (CRP platform overview) · America's Test Kitchen ("failproof"
process, five-recipe test; Kitchn interview with Jack Bishop) · PSU Intro to Food
Production ch. 6 (standardized recipes) · Chefs Resources (recipe templates, prep
sheets) · Cucinovo (fiche technique) · WebstaurantStore, Toast (station cards,
brigade).

**Agentic review surfaces.** GitHub PR reviews docs + 2025-06-26 Files-Changed
changelog · Cursor forum ("per-change inline diff review") + cursor.com/docs/agent/review ·
GitHub Copilot Workspace user manual, githubnext.com · Linear triage docs ·
NN/g, Progressive Disclosure.

**Brand feel.** Noma (noma.dk via Siiimple review) · Noma Projects identity — Gretel
via It's Nice That; Noma Projects journal ("The Test Kitchen Challenge"); Interview
Portal Noma chef interview · Alinea (alinearestaurant.com; Alinea cookbook via
Kitchen Arts & Letters / Amazing Food Made Easy) · Mugaritz (mugaritz.com) · Eleven
Madison Park renovation (Allied Works via Metropolis/Luxe) · Modernist Cuisine
(how-to-scale-a-recipe; Wikipedia) · ChefSteps/Joule (emmettbarton.com case study;
chefsteps.com time-and-temp guide) · The Food Lab / Serious Eats (Tasting Table, NPR
reviews) · The Fat Duck (Wikipedia) · FDA HACCP principles; envigilance.com;
xenia.team (temperature-log discipline).
