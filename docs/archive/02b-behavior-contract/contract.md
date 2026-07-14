# CapyCook Workbench — Behavior Contract (milestone 02b)

**Status: DRAFT — awaiting USER ratification.** Once ratified this file is frozen:
the fix→judge loop may never edit it; the oracle verifies the pinned commit hash
every iteration (BC-J-3). Changes after ratification go through a user ruling
recorded in `log.md` (the stall-valve path), mirroring the PREREGISTRATION §9 ethos.

## How to read a criterion

```
BC-<area>-<n> · assert|judge · <one observable statement>
Check: <scenario → observation → pass condition>
```

- **assert** — deterministic, evaluated in-process by the puppeteer oracle
  (`web/tools/oracle/`, milestone slice B2).
- **judge** — evaluated by a fresh-context agent from captured evidence
  (screenshots/screencasts) + this contract text only; PASS/FAIL + one-line reason.
- **[FAILS TODAY]** — informative marker from the 2026-07-11 root-cause session;
  the B3 census confirms. Unmarked criteria are regression guards over shipped
  behavior. Markers are not normative.

**Profiles.** Every scenario runs `bin/capycook` on :8098 with a fresh temp DB and
`CAPYCOOK_STUB_LLM=1` (zero API spend). Two latency profiles:
- **fast** — no injected latency (default).
- **live-sim** — `CAPYCOOK_STUB_LATENCY_MS=25000`, simulating the observed 15–40s
  live-DeepSeek wait. Area B runs natively in live-sim; area I re-runs listed
  criteria under it.

Two carve-outs: BC-H-6's live-mode half runs with `CAPYCOOK_STUB_LLM` unset and a
dummy `DEEPSEEK_API_KEY`, because the live-status branch is unreachable under the
stub flag; that scenario submits no move, so zero spend still holds. BC-H-4 runs
the **budget profile**: the fast profile plus the budget cap forced to $0
(env/ledger), so generation is refused pre-call.

**Definitions.** *Visible* = rendered in the viewport, not obscured, legible in the
active theme. *Announced* = emitted through an aria-live region. *Silent no-op* = a
user action that produces no visible, focusable, or announced response. *Trial* = a
committed version node on the timeline. Default viewport 1280×800, theme light,
unless the recipe pins otherwise.

**Scope.** The shipped product surface (02a "Line of Development" IA) plus the
2026-07-11 root-caused gaps, encoded as: BC-A-3 (auto first pass), BC-A-4 (empty
intent), BC-A-9 (empty/invalid scale value — same silent no-op pattern as BC-A-4),
BC-B-3 (live rationale), BC-B-4 (focus trap), BC-B-10 (the wait audible to
assistive tech, the non-visual face of BC-B-3), one attribution gap surfaced by the
same session (BC-F-3, durable auto-apply attribution), the gaps surfaced in
review (BC-G-10, the `--color-faint` contrast pairs; BC-H-8, the landing page's
silent list-load failure; BC-C-10's assistive-tech option labels; BC-E-4, the
tasting form's dropped focus; BC-C-20, the partial-alternatives premature gate;
BC-A-13, BC-C-21, and BC-E-5, typed input discarded on a failed submission;
BC-H-1/BC-H-7/BC-H-9, the unannounced dish-load states; BC-A-5's move-start
focus clause and chip dispatch race; BC-C-13's empty-tweak guard; BC-C-22, the unannounced disclosure state;
BC-C-26, the in-app safety disclaimer — a flagged ratification decision;
BC-C-27, the override's "Go back" discarding the typed edit; BC-C-28, the
silent wrong-shape take-over commit; BC-A-12's unguarded Enter path; BC-D-2's silent
"Back to current" return; BC-D-12, the unpersisted move rationale — a flagged
ratification decision), and their experiential composite BC-I-2. Milestone-03 features (branch-vs-branch compare view, flavor
sandbox, coach mode, grounding-rate display) are explicitly out of scope — no
criterion may demand them.

---

## A. Intake & first pass

**BC-A-1** · assert · Submitting the seed form with an empty seed shows the error
summary ("There is a problem") containing a linked message, moves focus to that
summary, and creates no dish.
Check: fast; submit `#field-seed` empty → error summary (`role="alert"`) visible
and focused (the GOV.UK pattern: the summary container takes focus, the link
inside targets the field) containing "Enter a seed — say what you want to
cook.", no `POST /api/dishes` fires.

**BC-A-2** · assert · Servings must be a whole number ≥ 1; violations show a visible
linked message, move focus to the error summary (same GOV.UK pattern as BC-A-1),
and block submission.
Check: fast; servings "0" and "1.5" → "Enter servings as a whole number, at least 1."
visible each time inside the focused `role="alert"` summary; no dish created.

**BC-A-3** · assert · After a dish is created, a first pass begins automatically —
and only then: the workbench enters a visible proposing state without further
input on creation, but revisiting or reloading an existing dish never auto-fires a
move. **[FAILS TODAY — workbench opens idle; the cook must guess that intent →
"Try it" is the move]**
Check: live-sim; create a dish → within 2s of `/dishes/:id` rendering, the proposing
state (BC-B-1 surface) is visible with no intent typed AND
`[data-testid="gate-live-region"]` contains "Proposing a move…" in the same
window (the auto-fired dispatch is new code — BC-B-9's manual-submit scenario
does not cover it); the resulting proposal parks at the gate per BC-C-1. Boundary (fast): decide the first pass, then hard-reload
`/dishes/:id` and navigate away to `/` and back → no `POST .../moves` fires without
user input in either case. Mid-flight boundary (live-sim): hard-reload while the
auto-fired pass is still generating → exactly one `POST .../moves` total for the
dish, and the proposing state (not idle) re-renders after the reload. Third
boundary (fast): after the first pass's proposal has arrived and is awaiting the
decision (undecided), hard-reload → the same pending proposal/gate re-renders
(per BC-D-4) and the dish's lifetime `POST .../moves` count is still exactly
one. Fourth boundary (live-sim): force the auto-fired pass to fail → reload →
the workbench renders idle (never another auto-fired proposing state) and the
lifetime count is still one — a failed auto first pass falls back to manual
"Try it", never a silent auto-retry.

**BC-A-4** · assert · Firing "Try it" (click or Enter) with an empty or
whitespace-only intent is never a silent no-op: visible validation feedback appears,
the intent field keeps/receives focus, and no move request is sent. **[FAILS TODAY —
`IntentBar.tsx:32` returns with zero feedback]**
Check: fast; on an idle workbench click "Try it" with `#cc-intent` empty → a visible
validation message appears (role="alert" or linked error), `#cc-intent` is focused,
no `POST .../moves` fires.

**BC-A-5** · assert · While a move is in flight, the intent affordances are visibly
unavailable and cannot dispatch a second move — and when they unmount at dispatch,
keyboard focus lands on a defined, attached, non-Stop target (e.g. the proposing
card's heading), never `document.body` and never Stop (BC-B-4's prohibition
stands). **[focus clause FAILS TODAY — nothing moves focus at move-start; the
intent bar unmounts and focus drops to body. Chip variant LIKELY FAILS TODAY —
no synchronous dispatch lock exists in IntentBar or `propose()`, the same
pattern as BC-A-12's Enter path]**
Check: live-sim; submit an intent via `#cc-intent` + Enter, then immediately
attempt a second submit → the affordance is disabled/replaced, exactly one
`POST .../moves` total, no unhandled error banner; at dispatch,
`document.activeElement` is attached, not `document.body`, and not the Stop
control. Chip variant (fast): double-click each deterministic chip and a
"Try next —" chip in turn while idle → exactly one `POST .../moves` per chip
(IntentBar's chips have no shared lock today, unlike the gate's verbs).

**BC-A-6** · assert · Every deterministic "Just the math" chip dispatches its own
move, and each chip carries the small "auto" tag exactly when the autonomy dial
is ON.
Check: fast; dial ON → all 4 chips show "auto"; dial OFF → no "auto" tags; fire
each chip in turn (Scale it, Convert units, Recompute cost, Recompute
nutrition) → exactly one `POST .../moves` per chip with the correct moveType.

**BC-A-7** · assert · Creating a dish navigates to `/dishes/:id` (URL-per-dish), and
that URL is shareable: a fresh load of it renders the same dish.
Check: fast; create → `location.pathname` starts `/dishes/`; reload the URL cold →
same dish title renders.

**BC-A-8** · judge · A first-time cook can get from the seed screen to their first
gate decision guided by the screen alone — at every step the single next action is
unmistakable.
Check: live-sim; capture screenshots at seed screen, post-create, mid-proposing, and
at the gate → judge: is the next action obvious at each frame without documentation?

**BC-A-9** · assert · Firing "Scale it →" with an invalid value (blank, "0",
negative) is never a silent no-op: visible validation feedback appears, the
field keeps/receives focus, and no move request is sent. (Non-numeric text is
blocked by the native number input itself — not a distinct scenario.) **[FAILS TODAY —
`IntentBar.tsx` `submitScale()` returns silently on invalid values, the same
pattern as BC-A-4's `submitIntent`]**
Check: fast; open the Scale chip's inline form, set `#cc-scale-servings` to each of
"", "0", "-1", fire "Scale it →" → each time a visible validation message appears
that is programmatically associated with the field (`role="alert"` on the message,
or `aria-describedby` from the field), the field is focused, no `POST .../moves`
fires.

**BC-A-10** · assert · Deterministic math lands correct numbers on the dish the
cook will actually shop and cook from: "Scale it → N" updates every ingredient
quantity proportionally plus the servings display, "Recompute cost" visibly
updates the cost figure, and "Recompute nutrition" renders the recomputed
figures — the headline USDA-attributed numbers — matching the server's draft.
Check: fast; record a baseline ingredient quantity and the servings; fire "Scale
it →" with a known target (dial ON: read after auto-apply; dial OFF: after
accept) → each `ingredient-row` quantity equals base × N/servings and the servings
display shows N; fire "Recompute cost" → the dish card's cost figure equals
`GET /api/dishes/:id`'s `draft.analysis.cost`; fire "Recompute nutrition" → the
dish card's calories/sodium cells (and the technical-view macro grid) equal
`GET /api/dishes/:id`'s `draft.analysis.nutrition`; fire "Convert units" → each
converted `ingredient-row`'s unit/quantity matches the server draft, exactly
parallel to the other three.

**BC-A-11** · assert · A server or network failure during dish creation never
fails silently or strands the cook: the error summary renders (role="alert",
focused) with the failure message, and the app does not navigate away from the
seed screen.
Check: pass client-side validation with the backend unreachable for `POST
/api/dishes` → error summary visible and focused with a failure message,
`location.pathname` unchanged.

**BC-A-12** · assert · Dish creation is idempotent under a double submit: a
double-click or double-Enter on the seed form fires exactly one `POST
/api/dishes`, lands on exactly one `/dishes/:id`, and the submit affordance
visibly disables while in flight — never two dishes (and, with BC-A-3, never two
auto-fired generations). **[Enter path LIKELY FAILS TODAY — `SeedSetup.tsx`
`onSubmit` has no synchronous `submitting` guard; two rapid Enter submits can
both dispatch before the disabled state commits]**
Check: fast; fill a valid seed, double-click "Develop this dish" → one POST in
the network log, one dish created, submit button disabled ("Developing…") during
flight without dropping focus to `document.body` (aria-disabled or equivalent —
the GateBar already documents why native `disabled` on a focused button goes
silent for screen readers); separately, press Enter twice in rapid succession
with focus in the seed form (not the button — the Enter path has no synchronous
lock today) → same assertions.

**BC-A-13** · assert · A failed OR cancelled move never discards typed input:
when a move dispatched from the intent bar or scale form fails, or the cook
Stops it mid-generation (often precisely to rephrase), the text is restored, not
cleared. **[FAILS TODAY — `IntentBar.tsx` clears its state unconditionally at
dispatch, before any outcome is known]**
Check: fast; type a distinctive intent, force `POST .../moves` to fail → after
the failure banner, `#cc-intent` still contains that string; repeat for
`#cc-scale-servings`. Cancel variant (live-sim): submit an intent, click Stop →
once Ready, `#cc-intent` contains the in-flight text again.

**BC-A-14** · assert · A suggested-next ("Try next —") chip actually works:
clicking one dispatches its own move and the workbench enters the proposing
state; the chip carries a real, non-generic accessible name.
Check: fast; accept a proposal whose `suggested_next` is non-empty so the chips
render on the idle intent bar; click one → `POST .../moves` fires with the
corresponding moveType, the proposing surface (BC-B-1) appears, and the chip's
accessible name matches its move label (never empty or a raw slug).

## B. Proposing state (runs natively in live-sim)

**BC-B-1** · assert · Within 1s of a move starting, a visible proposing state
appears: working label, progress affordance, and an explicit Stop control.
Check: live-sim; submit an intent → `[data-testid="proposing-card"]` visible ≤ 1s
after the POST, containing the working label and a `Stop` control.

**BC-B-2** · judge · Throughout a 25s generation the interface continuously
communicates ongoing work — a cook watching the full wait would not conclude the app
hung, and can tell roughly what is happening.
Check: live-sim; screencast the full window from submit to proposal-ready → judge
the wait's legibility (alive-signal present the whole time, no dead-looking stretch).

**BC-B-3** · assert · Rationale/reasoning text begins rendering while generation is
still in progress — not only after the move completes. **[FAILS TODAY — tokens are a
post-completion replay, `internal/transport/hub.go`; during generation the client
sees only heartbeats]**
Check: live-sim (25s); submit an intent → first visible rationale text in the
proposing card at t ≤ 20s (i.e., strictly before the stub's completion), and text
continues to accumulate before `proposal-ready` arrives.

**BC-B-4** · assert · Focus never lands on Stop automatically — at any moment of
the proposing window, including every moment `focusDecision` actually fires
(after any move-respawning gate verb — `regenerate`, `redirect`, `alternatives` —
re-enters proposing, and when one of two alternative proposals arrives while the
other still generates) — so an Enter keypress without an explicit user focus
choice never cancels a move. **[FAILS TODAY — `Workbench.tsx` `focusDecision`
parks focus on Stop whenever it fires while state is proposing]**
Check: live-sim, sampled at the trap moments (not at a fixed early instant):
(1) at a gate, fire `regenerate`; once the app re-enters proposing, press Enter
with no intervening focus action → the new move is still in flight (no
`move-cancelled`) and `document.activeElement` is not Stop; (2) fire
`alternatives`; when the first proposal-ready lands while the second is still
generating, press Enter with no intervening focus action → the second move is not
cancelled and focus is not on Stop; (3) submit "Ask for changes" with steer text;
once the respawned move is proposing, press Enter → not cancelled, focus not on
Stop; repeat (3) once from the safety-hold's "Ask for a safer change" entry
point.

**BC-B-5** · assert · Cancelling is explicit and always confirmed: activating Stop
yields a visible cancelled state — announcement, return to Ready, no new trial —
and keyboard focus lands on a defined, attached target, never dropped to
`document.body` when the Stop control unmounts.
Check: live-sim; click Stop mid-generation → "Move cancelled" announced, state pill
returns to "Ready", timeline trial count unchanged, and `document.activeElement`
is attached and not `document.body`.

**BC-B-6** · assert · Cancel discards, never rolls back: after a cancel the draft
and version chain are byte-identical to before the move.
Check: live-sim; snapshot `GET /api/dishes/:id` + `/versions`, run + cancel a move,
re-fetch → deep-equal.

**BC-B-7** · assert · The state pill tracks the loop truthfully: "Thinking…" for the
entire generation window, then "Needs your call" on proposal-ready — never
flickering through Ready mid-flight.
Check: live-sim; poll `[data-testid="state-pill"]` every 500ms from submit to gate →
monotone Thinking…→Needs your call.

**BC-B-8** · judge · The proposal-ready transition is unmistakable: streaming
resolves into the proposal + gate, and "now it's your call" is legible at a glance.
Check: live-sim; screencast the transition ±3s → judge the handoff moment.

**BC-B-9** · assert · The live region announces the loop: "Proposing a move…" on
start and "Proposal ready — N changes to review" on ready.
Check: live-sim; observe `[data-testid="gate-live-region"]` text across the window.

**BC-B-10** · assert · The wait is survivable without eyes: during a long
generation, the live region gives screen-reader users more than a single
start/end flip — its text changes at least once between "Proposing a move…" and
"Proposal ready…". **[FAILS TODAY — the sole live region carries exactly those
two strings and nothing in between; an AT user gets up to 40s of silence]**
Check: live-sim (25s); poll `[data-testid="gate-live-region"]` textContent every
~1s from submit to ready → at least one distinct intermediate value observed
(progress or streamed-rationale summary), not just the two endpoint states — and
not a raw token firehose either: successive distinct updates land 2000–12000ms
apart, never per-token.

**BC-B-11** · assert · Reloading mid-generation for ANY move — not only the
auto-fired first pass — resumes the proposing state, never idle, and fires no
duplicate move.
Check: live-sim; on a dish with ≥1 existing trial, submit a manual intent,
hard-reload while it is still generating → the proposing state (not idle)
re-renders after the reload, and exactly one `POST .../moves` fired for that
move.

## C. Gate & decisions

**BC-C-1** · assert · A creative proposal always halts at the gate: the draft and
version chain do not change until the cook picks a verb, regardless of the dial.
Check: fast; run a creative intent with dial ON, then repeat with dial OFF → in
both runs the proposal parks at the gate and `/versions` is unchanged until a verb
fires (no auto-apply of creative moves in either dial state).

**BC-C-2** · assert · The gate offers all six verbs: "Use it" and "Tweak it" up
front, and "Try another way" disclosing regenerate / compare-two-options /
ask-for-changes / edit-it-myself — every verb reachable by mouse and keyboard.
Check: fast; at the gate assert `button[data-verb]` ∈ {accept, edit} visible, open
the disclosure → {regenerate, alternatives, redirect, take_over} present; roving
arrow keys traverse the row.

**BC-C-3** · assert · Accept commits exactly one trial, even under a double-click,
and confirms both visibly and to assistive tech ("Use it — saved to the timeline").
Check: fast; double-click `button[data-verb="accept"]` → timeline count +1 exactly,
toast visible with text containing "saved to the timeline" AND carrying
`role="status"` (or equivalent aria-live) in the accessibility tree, no error
banner.

**BC-C-4** · assert · The keyboard map is safe: single-key verbs (A/E/G/L/R/T) fire
only in decide mode and never while a text field is focused; Escape never triggers a
destructive action (no accept, no move-cancel).
Check: fast; at gate, focus the redirect input and type "great" → no verb fires;
press Escape twice → back at decide mode with `document.activeElement` on a
defined gate control (not `document.body`), proposal still pending; live-sim;
press Escape while proposing → move still in flight.

**BC-C-5** · assert · "Edit it myself" (take-over) validates: invalid JSON shows a
visible role="alert" error and blocks Save; valid JSON commits the human edit as a
new trial.
Check: fast; open takeover form, enter `{oops` → alert visible, no dispatch; enter
valid draft JSON → new trial appears AND a `role="status"` confirmation fires
(the highest-stakes commit in the loop must not succeed silently for AT users).

**BC-C-28** · assert · A structurally-invalid take-over draft — valid JSON, wrong
shape (a required top-level key missing or type-mismatched) — is rejected before
commit with a visible `role="alert"` error; never a silent partial commit.
**[FAILS TODAY — client does a bare `JSON.parse` type-assertion and the server
decodes with Go zero-value semantics: deleting the `"steps"` key commits a trial
with the steps silently wiped]**
Check: fast; open take-over, delete the entire `steps` key from the pre-filled
JSON (still valid JSON), submit → Save is blocked with a visible error, no trial
commits, `GET /versions` unchanged; repeat with `"ingredients"` set to a string.

**BC-C-6** · assert · "Ask for changes" cannot fire empty: Send stays disabled until
the steer text is non-empty; a real steer re-proposes.
Check: fast; open redirect form → Send disabled; type steer → Send enabled; send →
new proposal arrives at the gate. Repeat the empty-guard half on the safety
hold's own "Ask for a safer change" input (`#safety-hold-steer` has an
independent disabled binding — parallel code path, not the gate's form).

**BC-C-7** · assert · A safety-blocked move renders the hold — role="alert", the
reason, the struck-through would-have-added list — offering exactly two recovery
verbs ("Try a different way", "Ask for a safer change"), and a safer steer clears
the hold with a fresh proposal.
Check: fast; intent that trips the anaerobic garlic-oil rule → `[data-testid=
"safety-hold"]` with reason, exactly 2 `data-verb` buttons, AND at least one
struck-through would-have-added op line matching the blocked op (whenever the
triggering proposal carried ops), preceded by an accessible section label
("What it would have added" or equivalent) exposed as text in the accessibility
tree — CSS strikethrough alone conveys nothing to AT; when the hold first
renders,
`document.activeElement` is the hold container or its heading (not
`document.body`); steer "skip the raw garlic-in-oil step" → hold clears, new
proposal parks at gate.

**BC-C-8** · assert · A human edit that trips safety escalates to the 409
warn-and-confirm dialog, focused on the least-destructive option; Escape backs out;
"Use it anyway" applies with `confirmOverride`.
Check: fast; take-over draft containing the garlic-in-oil op → `[data-testid=
"override-prompt"]` (role=alertdialog) with focus on "Go back — I'll change it";
Escape → dialog closes, nothing committed, and `document.activeElement` is
attached and not `document.body` (same after the "Go back" path); re-open,
confirm → trial commits.

**BC-C-9** · assert · While a gate action is in flight the pending verb shows a busy
state (aria-disabled + spinner) and repeated clicks do not double-fire.
Check: live-sim on the gate action (regenerate); click regenerate twice fast →
exactly one `POST .../gate`, spinner on the verb, control still announced (no
native `disabled`).

**BC-C-10** · assert · "Compare two options" yields exactly two labeled alternative
cards — labeled for assistive tech too, not only visually; picking one stages that
proposal for a normal gate decision. **[A/B naming LIKELY FAILS TODAY — the badge
glyph is `aria-hidden` and the accessible name carries only the content blurb]**
Check: fast; fire `data-verb="alternatives"` → two `[data-testid="alt-card"]`
whose computed accessible names (accessibility-tree name, not the `aria-hidden`
glyph) each include their Option A / Option B identifier; click A → gate bar shows
for A's diff; accepting commits one trial.

**BC-C-11** · judge · The verbs read as culinary decisions, not API calls — a cook
scanning the gate understands what each does to the dish.
Check: fast; screenshot the gate with disclosure open, both themes → judge label
legibility against the six underlying verbs.

**BC-C-12** · assert · A pending proposal's own honesty renders outside technical
view: citation chips show when the proposal carries citations, its unverified
claims are disclosed inline, and the "How sure —" strip always states Nutrition =
USDA-verified and Cost = approximate (never the reverse).
Check: fast; at a gate whose pending proposal carries citations and ≥1 entry in
`proposal.unverified` → `[data-testid="proposal-header"]` shows the citation chips
and the unverified disclosure; `[data-testid="trust-nutrition"]` contains "USDA"
and `[data-testid="trust-cost"]` contains "approximate" — all with technical view
OFF. (The `trust-flavor` tally is a separate, draft-sourced surface: BC-C-14.)

**BC-C-14** · assert · The flavor-trust tally reflects the committed draft, not the
pending proposal: after accepting a move that leaves ≥1 unverified flavor claim in
the draft, `trust-flavor` shows that count; while the draft carries none, the tally
is absent.
Check: fast; before any accept → `[data-testid="trust-flavor"]` absent/zero; accept
a proposal introducing an unverified `flavor_rationale` entry → `trust-flavor`
shows the count matching the draft's unverified entries, technical view OFF.

**BC-C-15** · assert · Safety holds fire for all three deterministic rules, not
only anaerobic preservation: a move that would introduce a seed-form-selected
allergen, and a move proposing an under-temperature high-risk protein, each render
the safety hold with a rule-specific reason.
Check: fast; create a dish with an allergen constraint checked; drive a move that
introduces that allergen → `safety-hold` renders with the allergen reason;
separately drive a move proposing an undercooked high-risk protein →
`safety-hold` renders with the min-temp reason. (If the stub cannot yet trigger
these two rules, extending the stub's fixture repertoire is in-scope loop work —
`internal/llm/stub.go` is not a frozen path; skipping is forbidden by BC-J-7.)

**BC-C-26** · assert · The safety gate's limits are surfaced IN the app, not only
in the repo: a disclaimer stating the gate is a backstop, not a guarantee, is
reachable from the workbench (persistent footer/affordance or on the safety
hold). **[LIKELY FAILS TODAY — no disclaimer text exists in web/src; DESIGN §8.7
lists a "surfaced" disclaimer as P0. ⚖ RATIFICATION DECISION: strike this
criterion if you rule the README suffices — the drafters flag the choice as
yours, not theirs.]**
Check: fast; on the idle workbench and on a safety hold → a visible or
one-interaction-reachable disclaimer containing backstop/not-a-guarantee
language is present.

**BC-C-16** · assert · A pending proposal previews its exact change inline in
non-technical view: an added ingredient/step/flavor row carries a visible "New"
marker plus an SR-only "added" announcement, a changed row shows old (struck
through) and new values with SR-only was/now labels, and a removed row is struck
through with an SR-only "removed" announcement.
Check: fast; drive a move whose diff adds one ingredient, changes one step, and
removes one flavor claim → at the gate, technical view OFF, the corresponding
`[data-testid="ingredient-row"]` / `step-row` / `flavor-row` carry the
add/change/remove markup and the `sr-only` added/removed/was/now text.

**BC-C-17** · assert · After a gate verb resolves with no next proposal awaiting,
keyboard focus lands on a defined, visible target (the stage heading) — never left
on a removed element or dropped to `document.body`.
Check: fast; at a gate, activate "Use it" → after the confirmation,
`document.activeElement` is `#stage-heading` (not `document.body`, not a detached
node); repeat after a completed "Tweak it" edit and after "Back to current"
restores the live view (BC-D-2).

**BC-C-18** · assert · Opening a gate sub-form ("Tweak it", "Ask for changes",
"Edit it myself") moves keyboard focus directly into the form's first
input/textarea — no extra Tab required.
Check: fast; at the gate, activate each of `edit`, `redirect`, `take_over` in
turn → immediately after the form renders, `document.activeElement` is that
form's first `input`/`textarea`.

**BC-C-19** · assert · The single-key shortcuts are disableable and remappable
(WCAG 2.1.4 — the compliance mechanism for app-wide character shortcuts): with
shortcuts disabled none of the six letters dispatches and no shortcut hints
render; with a remapped key, the new key — and only it — fires the verb, and the
visible hint reflects the remap.
Check: fast; seed `capycook-gate-shortcuts` = `{"enabled":false}` before load →
at a gate, pressing A/E/G/L/R/T dispatches nothing and no `aria-keyshortcuts`/
hint glyphs render; re-seed with accept remapped to "x" → "x" fires accept, "a"
does not, and the accept button's hint shows X.

**BC-C-20** · assert · "Compare two options" can never be gate-decided on a
partial result: while only the first of the two alternatives has arrived, no
committing gate verb is reachable — the surface withholds the gate toolbar (or
visibly marks "1 of 2 — second option still generating") until both alt-cards
exist. **[FAILS TODAY — during the second option's replay window a complete gate
bar renders for option A alone with focus on Accept; committing drops option B
silently]**
Check: live-sim (the fast profile's back-to-back replay gives no reliable
partial-result window); fire `data-verb="alternatives"`; poll the DOM at the
first moment a proposal-ready lands for this move → either no
`button[data-verb="accept"]` is present/focusable, or only
`[data-testid="alternatives-picker"]` (never a single-proposal gate bar) shows;
once both `[data-testid="alt-card"]` exist, picking one stages a normal decision
per BC-C-10.

**BC-C-21** · assert · A failed gate submission never discards typed input: on a
redirect / take-over / tweak failure, the form stays open (or reopens pre-filled)
with the exact steer text / JSON / edits the cook entered. **[FAILS TODAY —
`GateBar.tsx` returns to decide mode and re-seeds forms fresh regardless of
outcome]**
Check: fast; type a distinctive steer string, force `POST .../gate` to fail (kill
the backend or BC-H-5's second-tab race) → after the failure banner, the redirect
field still contains that exact string; repeat for the take-over JSON and a tweak
value.

**BC-C-22** · assert · The "Try another way" disclosure tells assistive tech what
it did: the toggle carries `aria-expanded` — false closed, true once the four
verbs are revealed. **[LIKELY FAILS TODAY — `aria-expanded` appears nowhere in
the shipped components]**
Check: fast; at the gate in decide mode, the toggle's `aria-expanded` is "false";
activate it → four `data-verb` buttons present AND `aria-expanded` is "true".

**BC-C-23** · assert · A pending proposal whose ops touch fields outside the
previewable rows (analysis/constraints) never changes anything silently: the
"Some changes could not be previewed" disclosure renders, and accepting still
applies the change.
Check: fast, dial OFF; drive a move whose diff includes an op on
`constraints.servings` or `draft.analysis` (e.g. "Scale it →") → at the gate,
technical view OFF, `[data-testid="dish-card-unpreviewable"]` is visible; accept
→ `GET /api/dishes/:id` confirms the field actually changed.

**BC-C-24** · assert · "Compare two options" arriving is announced and focus is
placed: when the second alternative mounts, the live region carries the
alternatives-specific announcement ("… alternatives ready — pick one to develop")
with the right count, and `document.activeElement` is a defined, attached target
within (or announcing) the picker — never `document.body`, never Stop.
Check: live-sim; fire `alternatives`; at the moment the second
`[data-testid="alt-card"]` mounts → `[data-testid="gate-live-region"]` contains
"alternatives ready" with the count, and `document.activeElement` is attached,
not `document.body`, not Stop.

**BC-C-27** · assert · The safety-override's "Go back — I'll change it" preserves
the exact edit that tripped it: choosing it returns the gate to take-over mode
with the textarea pre-filled with the cook's own typed JSON — never a reset to
decide mode or a fresh dump of the pre-edit draft. **[FAILS TODAY —
`GateBar.tsx` `dispatch` flips to decide the moment the 409 resolves, and
re-opening re-seeds from the original draft; the cook's edit is silently gone]**
Check: fast; submit a take-over draft containing the garlic-in-oil op; at the
override prompt click "Go back — I'll change it" → the take-over textarea is
visible again and its value is byte-identical to what was typed before submit.

**BC-C-25** · assert · Confidence is informational, never a gating filter: a
low-confidence proposal reaches the gate exactly like any other — no verb
hidden, disabled, or auto-skipped because of the confidence value. (A cook must
never have options silently withheld; screenshots cannot reveal an absent
proposal, so this is asserted directly.)
Check: fast; extend the stub fixture to emit a creative proposal with
confidence ≤ 0.2 → the proposal renders at the gate with the full verb set
(Use it / Tweak it / Try another way), identical to a normal-confidence
proposal.

**BC-C-13** · assert · "Tweak it" edits the proposal's own content: the form opens
pre-seeded with the proposal's current values, an edited value commits exactly one
new trial reflecting it, and the form can never dispatch a content-free edit.
**[empty-guard clause FAILS TODAY — `GateBar.tsx` `submitTweak` dispatches
unconditionally, no empty-value guard]**
Check: fast; at a gate, click `data-verb="edit"` → `[data-testid="tweak-form"]`
shows one input per op, pre-seeded; change one value, submit → gate closes, spine
gains exactly one trial whose diff (technical view / `GET /versions`) carries the
edited value, and a `role="status"` confirmation fires (parity with BC-C-3's
accept toast); re-open on a fresh proposal, clear every field → submit is blocked
with visible feedback (disabled Save or validation message), no `POST .../gate`
fires.

## D. Versions & timeline

**BC-D-1** · assert · Every accept appends exactly one "Trial N" node and the
spine summary count updates to match.
Check: fast; accept 3 proposals → buttons "Trial 1..3", summary "3 trials on the
line".

**BC-D-2** · assert · Viewing a past trial is explicitly read-only: banner
("Viewing a past trial — read-only"), a "Back to current" control, and no active
gate bar on the snapshot; a pending decision remains visible on the spine.
Check: fast; with a pending proposal, click Trial 1 → banner + no `#cc-gate` verbs
for the snapshot; pending node still on the spine; "Back to current" restores the
gate. Both directions are announced: the live region updates on entering the
snapshot ("Viewing Trial N, read-only.") AND updates again with a distinct
non-empty value on "Back to current" — never a silent swap back to the live,
decidable state. **[return announcement LIKELY FAILS TODAY — "Back to current"
calls no announce()]**

**BC-D-3** · assert · Branch + promote work end-to-end: promoting a past trial moves
the trunk pointer (confirmed visibly), and the next accepted move lands as a
branch-badged trial on the new line.
Check: fast; 2 trials → open Trial 1 → "Promote to trunk" → toast "… promoted to
service" visible and `role="status"` in the accessibility tree, `currentVersionId`
now Trial 1's; run + accept a move → new trial shows the "Branch" badge.

**BC-D-4** · assert · Reload restores the exact decision state: refreshing
mid-awaiting-gate re-renders the pending proposal and gate; refreshing during a
safety hold re-renders the hold (from stored ops, never the discarded proposal).
Check: fast; at awaiting-gate, hard reload → proposal + gate re-render; drive to a
hold, hard reload → `safety-hold` re-renders with the same reason.

**BC-D-5** · assert · Committed work survives a server restart: after killing and
restarting `bin/capycook` on the same DB, reloading `/dishes/:id` restores the
draft, the full trial chain, and current-version marker.
Check: fast; 2 trials → restart server, reload → identical timeline and draft
(in-flight/pending state may be lost; committed state may not).

**BC-D-6** · assert · Browser Back/Forward re-syncs the view (dishes list ↔ dish)
without stale state.
Check: fast; dish → back → dishes list renders; forward → dish re-renders at
current state.

**BC-D-7** · judge · The spine reads as a line of development: trials scannable,
current position obvious, "Cooked"/"Branch" badges self-explanatory.
Check: fast; screenshot a spine with ≥3 trials incl. one cooked + one branch, both
themes → judge.

**BC-D-8** · assert · The recent-dishes list on `/` reflects reality: a freshly
created dish appears in it, and clicking an entry opens exactly that dish.
Check: fast; create a dish, navigate back to `/` → the new dish's title is in the
list; click it → `/dishes/:id` for that same id renders with that title.

**BC-D-9** · assert · The dish stage shows the draft the cook would actually cook:
after an accepted move, the ingredient/step/flavor rows (technical view OFF)
reflect the new draft's values, not the prior version's.
Check: fast; accept a proposal whose diff adds or changes a named ingredient and a
step → the matching `[data-testid="ingredient-row"]` / `[data-testid="step-row"]`
text on the dish stage contains the new values; the pre-accept values no longer
render as current.

**BC-D-10** · assert · The idle dish-stage's honesty detail panel and constraints
summary stay truthful: unpriced ingredients are listed (or "All ingredients
priced." when none), `nutrition.unverified` entries are listed when present, and
every constraints field the seed form set (avoid, dietary, equipment, on hand,
servings, skill) is echoed in the "Cooking for" row — never a silent blank.
Check: fast; create a dish with ≥1 allergen, ≥1 dietary entry, ≥1 equipment
item, and ≥1 on-hand item, whose draft carries an unpriced ingredient → on the
idle dish-stage (technical view OFF), the cost/nutrition detail panel lists the
missing ingredient and unverified entries, and the "Cooking for" row echoes all
six fields — avoid, dietary, equipment, on-hand, servings, and skill — matching
the seed form's values.

**BC-D-11** · assert · Client-side navigation announces itself to keyboard/AT
users the shipped way: after an in-app route change (dishes list → dish, or
back), focus lands on the destination screen's `<h1>`; a cold load never
autofocuses the heading.
Check: fast; from `/` click a recent-dish entry → `document.activeElement` is
the dish `<h1>` once the route resolves AND `document.title` contains the dish's
title (WCAG 2.4.2, deliberately engineered per-dish); navigate back to `/` via
the header → focus on the list screen's `<h1>` and `document.title` reverts to
"CapyCook"; cold-load `/dishes/:id` directly → the heading is NOT autofocused.

**BC-D-12** · assert · A past trial's "why" is recoverable, not just its diff:
with technical view ON, an accepted trial's card or snapshot exposes the prose
rationale that accompanied the proposal at accept time. **[FAILS TODAY — the
move-level rationale is discarded on accept: no store column, no event payload
field, no wire type carries it. ⚖ RATIFICATION DECISION: this demands a
schema/wire change (in-scope for the loop — nothing frozen is touched), per
DESIGN §7 principle 5 and §8.3's "decision/rationale log" P0 commitment; strike
it if you rule the persisted per-claim `flavor_rationale` suffices for 02b.]**
Check: fast; accept a proposal carrying a distinctive rationale string; enable
technical view; open that trial → the rationale text (or an expander revealing
it) is present in the accessibility tree.

**BC-D-13** · assert · Exactly one spine trial carries `aria-current="true"` at
any time — the trunk-head trial — and it moves with each accept, so AT users can
always tell which trial is current (BC-D-7's judge sees only the visual half).
Check: fast; accept 2 proposals in turn; after each,
`querySelectorAll('[aria-current="true"]').length === 1` and it targets the
latest trial's button; after a promote (BC-D-3), it targets the promoted trial.

## E. Post-cook loop

**BC-E-1** · assert · "I cooked this" opens the tasting form, and "Rework from these
notes" runs iterate_feedback against exactly the cooked version, parking a new
proposal at the gate.
Check: fast; on Trial 2 click "I cooked this" → `#cc-tasting-notes` visible; submit
notes → proposal arrives whose base version (technical view / `GET /versions`) is
Trial 2's. Blank-notes boundary: leave the field empty, submit → the dispatched
feedback is the "Cooked it." fallback (assert via the request body or the
resulting rationale), the base version is still the cooked trial's, and BC-E-2's
badge echoes "Cooked it.".

**BC-E-2** · assert · The cooked trial is marked: "Cooked" badge on its spine card
with the note echoed.
Check: fast; after BC-E-1 → Trial 2's card shows "Cooked" and the note text.

**BC-E-4** · assert · The tasting form manages focus like the gate forms do:
opening "I cooked this" moves focus into `#cc-tasting-notes`; Cancel returns focus
to a defined, attached target (the "I cooked this" trigger), never
`document.body`. **[LIKELY FAILS TODAY — CookFlow's cancel unmounts the focused
textarea with no focus restoration]**
Check: fast; click "I cooked this" → `document.activeElement` is
`#cc-tasting-notes`; click Cancel → `document.activeElement` is the "I cooked
this" trigger (attached, not `document.body`).

**BC-E-5** · assert · A failed rework submission never discards typed tasting
notes: when "Rework from these notes" fails, the form stays open with the exact
notes text still present. **[FAILS TODAY — `CookFlow.tsx` `submit()` clears and
closes unconditionally, the same fire-and-forget pattern as BC-A-13/BC-C-21]**
Check: fast; open "I cooked this", type distinctive notes, force the rework
`POST .../moves` to fail → after the failure banner, `#cc-tasting-notes` is
still open and contains that exact text.

**BC-E-3** · judge · The cook → taste → rework loop is legible as closing the loop —
the cook can tell their feedback drove the new proposal.
Check: fast; screenshots of tasting form, and the resulting proposal's rationale →
judge whether the connection is visible.

## F. Autonomy dial

**BC-F-1** · assert · The dial is a labeled switch ("Auto-apply safe steps",
role="switch", aria-checked) whose state persists on the dish across reloads.
Check: fast; toggle OFF → reload → still OFF (PATCH persisted).

**BC-F-2** · assert · Dial ON: a deterministic move auto-applies with no gate stop —
a new trial lands directly and the action is confirmed visibly ("… applied
automatically (safe step)").
Check: fast, dial ON; "Recompute cost" → no gate; toast contains "applied
automatically" and carries `role="status"` in the accessibility tree; timeline +1.

**BC-F-3** · assert · Auto-applied trials stay attributable after the fact: the
trial that landed automatically is distinguishable on the workbench (spine card or
technical view) from a human-accepted trial. **[LIKELY FAILS TODAY — the toast is
the only attribution and it evaporates in ~2.6s]**
Check: fast, dial ON; auto-apply once, accept once, enable technical view → the two
trials are visibly distinguishable (marker text/badge identifying the auto-applied
one), and the marker is exposed as text in the accessibility tree (not color-only).

**BC-F-4** · assert · Dial OFF: the same deterministic move stops at the gate like
any other proposal.
Check: fast, dial OFF; "Recompute cost" → parks at gate; no auto-apply toast.
(Creative moves never auto-apply in either dial state — covered by BC-C-1.)

## G. Modes & a11y chrome (technical view · themes · motion · narrow · keyboard reach)

**BC-G-1** · assert · The technical view toggle (aria-pressed, persisted) reveals
the honest machinery — ops JSON, confidence, provenance ids, ver ids, and `rule_id`
on holds — and hides it all when off.
Check: fast; toggle ON → "Structured diff · JSON-Pointer ops" on the dish card,
ver-id lines on spine cards, `rule_id:` on a hold, the `conf` percentage on
`proposal-header`, and ≥1 `fdc:`/`foodon:` chip on an `ingredient-row`; toggle OFF
→ all gone; reload → setting persists.

**BC-G-2** · assert · Theme cycles system → light → dark, persists across reload,
and pins `[data-theme]` on the root.
Check: fast; cycle to dark → `html[data-theme="dark"]`; reload → still dark; cycle
to system → attribute cleared.

**BC-G-3** · judge · Both themes stay legible across the core states — seed
intake, idle (intent bar + CookFlow), proposing, gate, safety hold — with no
unreadable contrast or invisible affordance.
Check: capture the 5 states × {light, dark} → judge each pair.

**BC-G-4** · assert · Reduced motion is honored without losing the alive-signal:
animations are stilled, yet the proposing state still visibly progresses (BC-B-3's
text still accumulates).
Check: live-sim with `prefers-reduced-motion: reduce` emulated → computed
animation/transition durations are 0s on the proposing surface AND rationale text
still appears at t ≤ 20s.

**BC-G-5** · assert · Narrow viewports get the one-column layout with the stage
first, the gate sticky at the bottom, and no horizontal overflow at 390px.
Check: viewport 390×844; drive to the gate → single column, `#cc-gate` sticky
bottom, `document.documentElement.scrollWidth <= 390`; drive to the
alternatives-picker at the same viewport → still no horizontal overflow; accept
a proposal and check the idle dish-stage + CookFlow view (the phone-in-kitchen
reference screen) → still no horizontal overflow; drive a safety-blocked move
and open the override-prompt (human-edit path) → no horizontal overflow on
either recovery surface; drive to the proposing state (live-sim) mid-stream →
still no horizontal overflow while text streams.

**BC-G-6** · judge · At phone width every step of the loop is visually reachable —
no hidden, clipped, or overlapping controls at seed → propose → decide — and the
idle reference view reads well in a kitchen. (Tap-target adequacy is owned by
BC-G-8's numeric sweep, not judged from stills.)
Check: viewport 390×844; screenshots at seed/proposing/gate plus the idle
dish-stage + CookFlow view after an accept → judge visual reachability and
reference legibility.

**BC-G-7** · assert · Skip links are the keyboard user's fast path: two links —
to the dish stage and to the live decision surface — are the first two focusable
elements, and each moves focus to its target.
Check: fast, at a gate; press Tab from a fresh load → first two focused elements
are the skip links ("Skip to the dish", "Skip to the decision"); activating each
lands focus at `#stage-heading` / the gate respectively.

**BC-G-8** · assert · Interactive controls stay tappable: every control on the core
surfaces (intent bar, gate, dial, spine trial buttons) has a hit area of at least
24×24 CSS px (WCAG 2.5.8).
Check: fast, at a gate with the disclosure open; measure `getBoundingClientRect()`
over `button, [role="switch"], a` within the intent bar, gate bar, header
(including the theme/technical-view toggles and dial), and spine → all ≥ 24×24;
sweep the seed screen too (`#field-seed`, allergen chips,
selects, servings, submit) and the recent-dishes list entries on `/` (create ≥1
dish first so the list is non-empty); drive to a safety hold, an override dialog, the
alternatives-picker, the proposing card's Stop control (live-sim), the CookFlow
trigger + opened tasting form, and a `move-failed-banner`'s Try again/Dismiss and
measure those controls too (mistaps cost most on the wait, recovery, and
pick-between-outcomes paths); repeat the FULL sweep (gate, dial, spine, safety
hold, override dialog, alternatives-picker, CookFlow, move-failed banner) at
viewport 390×844, where compression makes shrinkage most likely.

**BC-G-9** · assert · Keyboard focus is always visible: every control reachable via
Tab shows a focus indicator distinguishable from its resting state (WCAG 2.4.7), in
both themes.
Check: fast; Tab through the seed screen's controls, the recent-dishes list
entries on `/`, the skip links, intent bar,
gate toolbar, dial, spine trial buttons, the theme/technical-view toggles, the
alternatives-picker's cards, the Stop control (live-sim), the CookFlow trigger +
tasting form, the safety-hold's two recovery verbs, the override-prompt's two
buttons, and the move-failed/reconnect banner buttons in light then dark theme →
at each stop the computed style shows a non-zero outline/box-shadow distinct from
the unfocused state.

**BC-G-10** · assert · Body text meets WCAG AA contrast numerically: the
text/background token pairs actually used on the core screens (ink, muted, and
faint text over page, panel, and surface backgrounds) measure ≥ 4.5:1 for
normal-size text and ≥ 3:1 for large text (≥24px, or ≥18.66px bold), in both
themes. **[LIKELY FAILS TODAY — the `--color-faint` pairs measure ~2.7–4.0:1 in
both themes at 10–12px sizes on the spine, trust strip, and proposal header]**
Check: fast; on the seed-intake screen (`/`, including the recent-dishes list),
the idle dish-stage (with intent bar and CookFlow rendered), the gate, and the
safety-hold screens, in each theme, walk the rendered text nodes of: the seed
form (labels, allergen chips, hints, error summary), the recent-dishes entries,
the intent bar ("Try next —" chips, "Just the math —" row), the CookFlow
prompt/version caption, the spine, trust strip, proposal header, dish card, gate,
safety-hold reason, override-prompt, and the move-failed/reconnect banners
(including `--color-critical` pairs — the highest-stakes text of all) → compute
relative-luminance contrast of `getComputedStyle` color vs. effective background →
every pair clears its threshold for its rendered size. (BC-G-3's judge pass still
covers gross legibility; this is the numeric floor.)

**BC-G-11** · assert · The focus indicator itself is perceivable, not merely
present: at every Tab stop swept by BC-G-9, the focus outline/box-shadow color
measures ≥ 3:1 relative-luminance contrast against its adjacent background (WCAG
1.4.11 non-text contrast), in both themes.
Check: reuse BC-G-9's Tab sweep; at each stop, compute the contrast of the
resolved focus-ring color vs. the background it sits on → all ≥ 3:1, light and
dark.

**BC-G-12** · assert · Content reflows at the WCAG 1.4.10 threshold without loss:
at a 320 CSS px viewport (the 400%-zoom equivalent of the 1280px design), the
core journey renders with no horizontal scrolling and no clipped or overlapping
content.
Check: viewport 320×800; drive to the seed screen, the idle dish-stage (intent
bar + CookFlow rendered), the proposing state mid-stream (live-sim), the gate,
the alternatives-picker, a safety hold, and the override-prompt →
`document.documentElement.scrollWidth <= 320` on each screen, and no interactive
control is clipped outside the viewport.

**BC-G-13** · assert · Essential non-text component boundaries meet WCAG 1.4.11
beyond the focus ring: the autonomy dial's track/thumb are distinguishable in
BOTH states, invalid-field borders are perceivable, and the safety-hold's border
is perceivable — each ≥ 3:1 against its adjacent background, in both themes.
Check: fast; measure the resolved colors of the dial's track/thumb with
aria-checked true and false, an invalid seed field's border (BC-A-1 state), and
the safety-hold container border vs. their adjacent backgrounds → all ≥ 3:1,
light and dark. (A low-vision cook must be able to SEE the dial's state, not just
hear it.)

**BC-G-14** · assert · Sticky chrome never obscures the keyboard focus target
(WCAG 2.4.11): tabbing to any focusable control never lands it hidden under the
sticky header or the sticky gate bar, including on compressed viewports.
Check: reuse BC-G-9's Tab sweep at 390×844 and 320×800; at each stop compare the
focused element's `getBoundingClientRect()` against the header's and gate bar's
rects → no majority overlap hides the focused element.

**BC-G-15** · assert · Text-spacing overrides don't break the layout (WCAG
1.4.12): with line-height 1.5×, paragraph spacing 2×, letter spacing 0.12em, and
word spacing 0.16em injected, the core screens lose no content or functionality.
Check: fast; inject the 1.4.12 style overrides; on the seed screen, gate, and
safety hold → no clipped text (element `scrollHeight`/`scrollWidth` within
container bounds where overflow is hidden), no overlapping interactive controls,
gate verbs still clickable.

## H. Errors & resilience

**BC-H-1** · assert · Backend unreachable → a legible, ANNOUNCED failure, never a
blank screen: "Could not load this dish …" renders with `role="alert"`, keyboard
focus lands on the error region or its "Back to dishes" control, and there is an
escape hatch. **[LIKELY FAILS TODAY — the error is a plain `<p>` and the
route-focus effect is gated on a loaded dish, so neither role nor focus fires on
this path]**
Check: load `/dishes/:id` with the server stopped (static shell served separately or
navigate then kill) → error card visible with `role="alert"` in the accessibility
tree, `document.activeElement` is the error region or "Back to dishes", no
uncaught exception in the console.

**BC-H-2** · assert · An SSE drop shows "Reconnecting — your draft is safe."
(role="status") and clears after reconnect with state re-synced via GET.
Check: fast; kill + restart the server under an open workbench → banner appears,
then clears; dish state re-renders.

**BC-H-3** · assert · A drop during generation cannot strand the cook: after
reconnect the outcome (or re-synced pending proposal) appears without a new user
action.
Check: live-sim; submit a move, sever the SSE connection mid-window, restore → the
proposal/gate (or terminal state) renders after reconnect + resync.

**BC-H-4** · assert · A failed move (including budget exhaustion) surfaces the
role="alert" move-failed banner with the reason and a working "Try again" —
never a safety hold, never silence.
Check: budget profile (cap forced to $0 via env/ledger so generation is refused
pre-call) → banner "Move failed … try again." with the reason; "Try again"
re-dispatches (fails again, consistently); no `safety-hold` rendered; after the
failure transition, `document.activeElement` is attached and not `document.body`
(the proposing surface unmounts on failure). Harness note:
B2 must prove this path reachable in stub mode; if the stub bypasses the budget
gate, the builder makes the refusal path injectable — this criterion may not be
silently skipped (BC-J-7).

**BC-H-5** · assert · 4xx conflicts surface with the server's message: gating a
stale/decided proposal shows the critical role="alert" banner with the JSON
`error` text and a Dismiss.
Check: fast; accept a proposal, then re-fire gate for the same proposalId via the
UI-equivalent request path (second tab on the same dish) → banner with server
message, dismissible.

**BC-H-6** · assert · The stub banner tells the truth in both directions: stub mode
shows "stub mode — demo data, no model key · budget …"; live mode shows no stub
banner.
Check: stub profile → `[data-testid="stub-banner"]` present with budget figures;
restart with `CAPYCOOK_STUB_LLM` unset and a dummy `DEEPSEEK_API_KEY` (the Profiles
carve-out; no move submitted, zero spend) → `/api/status` reports live and the
banner is absent.

**BC-H-7** · assert · An unknown dish deep-link fails soft and audibly:
`/dishes/nope` renders the could-not-load card (role="alert", focus per BC-H-1's
pattern), not a crash or infinite spinner. **[LIKELY FAILS TODAY — same unmarked
plain-`<p>` code path as BC-H-1]**
Check: fast; navigate to a fabricated id → error card ≤ 3s with `role="alert"`
and focus on the error region or its escape hatch, console free of uncaught
errors.

**BC-H-8** · assert · The landing page degrades gracefully and audibly: when the
dish list fails to load on `/`, the failure message is announced to assistive
tech (`role="status"` or aria-live), and the seed form remains fully usable.
**[LIKELY FAILS TODAY — the failure message is a plain `<p>` with no live-region
role]**
Check: `/` with the backend unreachable for the list fetch → the failure message
renders with a live-region role in the accessibility tree; the seed form still
accepts input (submission requires the backend and is out of this scenario's
scope).

**BC-H-9** · assert · The initial dish-load wait is legible to assistive tech:
the "Loading the dish…" placeholder is exposed via `role="status"` (or an
equivalent live region), so an AT user is not left in silence between navigation
and the dish (or error card) rendering. **[LIKELY FAILS TODAY — the placeholder
is a bare `<div>`]**
Check: fast; navigate to `/dishes/:id` and sample the DOM before the GET
resolves → the loading text's container carries `role="status"` in the
accessibility tree.

## I. Live-mode parity (the 25s sweep)

**BC-I-1** · assert · Every generation-touching fast-profile assert passes
identically under live-sim latency. Membership rule (mechanical, so new criteria
cannot silently fall outside the sweep): every fast-profile assert whose check
(a) asserts on the arrival/delivery seam of a freshly GENERATED proposal or hold
(its production, first render at the gate, or the diff it presents), or (b)
commits or races a decision on a proposal generated in the same check.
Exemptions, stated so the rule and the set cannot drift: checks whose assertions
run only after the generated state has fully settled (pure post-settle focus,
reload, or persistence checks — e.g. BC-C-17, BC-C-18, BC-D-4), and checks
satisfiable by deterministic moves (latency-immune: the latency knob delays only
the stub LLM — e.g. BC-A-10, BC-D-1). Today the rule resolves to {BC-C-1, BC-C-3,
BC-C-6, BC-C-7, BC-C-10, BC-C-12, BC-C-13, BC-C-14, BC-C-15, BC-C-16, BC-C-25,
BC-D-9, BC-E-1, BC-F-3 (its "accept once" requires a generated proposal —
clause b)}. (BC-C-8/BC-C-27/BC-C-28 are the human-edit override path — no
generation involved — and are excluded like other non-generation checks.) (Area B plus
BC-A-3, BC-A-5, BC-B-11, BC-C-9, BC-C-20, BC-C-24, BC-G-4, and BC-H-3 already
run natively in live-sim; BC-H-2 involves no generation and is excluded — its
during-generation sibling BC-H-3 covers that seam.)
Check: re-run the parity set with `CAPYCOOK_STUB_LATENCY_MS=25000` → all pass; the
oracle report lists each as `<id>@live-sim` and derives the set from the rule, not
this snapshot.

**BC-I-2** · judge · The 25s wait is survivable end-to-end: watching the full
screencast, a cook can tell the system is working, roughly what it is doing, and
how to bail out safely — the loop is worth the wait.
Check: live-sim; one full journey screencast (intent → wait → proposal → accept) →
judge survivability. (Deliberate near-overlap with BC-B-2, disclosed: BC-I-2
adds the accept-transition and bail-out-comprehension angles over BC-B-2's
wait-only window.) **[FAILS TODAY — this is the session finding that motivated
02b]**

**BC-I-3** · assert · During a long generation the rest of the workbench stays
honest: timeline browsing still works, unavailable actions look unavailable, and
nothing invites a click that will error.
Check: live-sim; mid-window, click a past trial (should work, read-only) and
attempt an intent submit (should be visibly unavailable per BC-A-5) → no error
banner from either.

## J. Guardrails (evaluated every loop iteration, except BC-J-6 which runs once at B5)

**BC-J-1** · assert · The frozen instruments are byte-untouched: `git diff
32afe54..HEAD -- internal/llm/prompts eval/fixtures/seeds.json
internal/eval/runner.go data/safety eval/fixtures/move_script.json
internal/llm/evidence.go internal/eval/mapping.go` is empty. Any violation aborts
the loop.

**BC-J-2** · assert · All pre-existing suites stay green: `make test`, `make vet`,
`cd web && npx tsc -b && npx vitest run`.

**BC-J-3** · assert · The contract pin holds: `contract.md` at HEAD is byte-identical
to the ratified pinned commit recorded in `milestone.md`.

**BC-J-4** · assert · `docs/PREREGISTRATION.md` is byte-untouched for the whole
milestone.

**BC-J-5** · assert · Oracle runs never touch the operator DB: `data/capycook.db`
still holds exactly the baseline `run_kind=operator` event count (6 as of
2026-07-11) unless the user themselves ran sessions.

**BC-J-6** · judge · README media stays truthful at exit: any of the 9 GIFs whose
scene visibly changed is re-captured (≤15s, 800px, 15fps, <5MB); `09-eval-run.gif`
is never re-captured. Evaluated once at B5, not per iteration.

**BC-J-7** · assert · No dead criteria: every BC id in this contract appears in
`oracle-report.json` with an explicit pass/fail/parked entry and an evidence path —
nothing silently skipped.

---

## Appendix (informative) — selector vocabulary & keyboard map

Mined 2026-07-11 from the shipped UI and the proven headless drivers
(`web/tools/shots.mjs`, `web/tools/demo.mjs`). Informative: recipes bind to
behavior, not to these exact hooks; the loop may evolve selectors as long as the
oracle is updated in the same iteration.

**data-testid:** `app-root`, `seed-setup`, `gate-bar` (`#cc-gate`),
`gate-live-region`, `gate-spinner`, `proposing-card`, `proposing-spinner`,
`proposing-caret`, `safety-hold`, `override-prompt`, `alternatives-picker`,
`alt-card`, `alt-blurb`, `alt-change-line`, `proposal-header`, `dish-card`,
`ingredient-row`, `step-row`, `flavor-row`, `tweak-form`, `redirect-form`,
`takeover-form`, `trust-nutrition`, `trust-cost`, `trust-flavor`, `state-pill`,
`stub-banner`, `reconnect-banner`, `move-failed-banner`, `toast`.

**data-verb** (preferred gate/hold hook): `accept`, `edit`, `regenerate`,
`alternatives`, `redirect`, `take_over`.

**ids:** `#field-seed`, `#field-servings`, `#cc-intent`, `#cc-scale-servings`,
`#cc-tasting-notes`, `#gate-redirect-input`, `#safety-hold-steer`, `#stage-heading`.

**aria:** `aside[aria-label="Development timeline"]`; `[role="toolbar"]
[aria-label="Decide on this change"]`; `[role="alertdialog"]` (override);
`[role="switch"]` (dial); `[aria-pressed]` (technical view, allergen chips);
`[aria-current="true"]` (current trial); `[aria-keyshortcuts]` (gate verbs).

**Text anchors** (prefix-match only — verb buttons carry a trailing shortcut
glyph): `^Develop this dish`, `^Try it`, `^Try another way`, `^Stop$`,
`^I cooked this`, `^Rework from these notes`, `^Back to current$`,
`^Promote to trunk$`, `^Technical view`, `^Auto-apply safe steps$`.

**localStorage:** `capycook-theme` (light|dark|absent=system),
`capycook-technical-view` (0|1), `capycook-gate-shortcuts` ({enabled, map}).

**Keyboard map:** decide-mode-only, case-folded, suppressed while a text field is
focused or with Ctrl/Meta/Alt: `A`=accept · `E`=edit · `G`=regenerate ·
`L`=alternatives · `R`=redirect · `T`=take_over. `Escape` always live: blurs a
focused field, else falls back to decide mode, cancels the override dialog.
Arrow keys rove the verb toolbar (wrap; Home/End). `Enter` submits in `#cc-intent`,
`#cc-scale-servings`, and the seed form. ⚠ Today `Enter` also lands on Stop while
proposing (BC-B-4's trap).
