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

**Definitions.** *Visible* = rendered in the viewport, not obscured, legible in the
active theme. *Announced* = emitted through an aria-live region. *Silent no-op* = a
user action that produces no visible, focusable, or announced response. *Trial* = a
committed version node on the timeline. Default viewport 1280×800, theme light,
unless the recipe pins otherwise.

**Scope.** The shipped product surface (02a "Line of Development" IA) plus the four
2026-07-11 root-caused gaps. Milestone-03 features (branch-vs-branch compare view,
flavor sandbox, coach mode, grounding-rate display) are explicitly out of scope —
no criterion may demand them.

---

## A. Intake & first pass

**BC-A-1** · assert · Submitting the seed form with an empty seed shows the error
summary ("There is a problem") with a focused, linked message and creates no dish.
Check: fast; submit `#field-seed` empty → error summary visible, focus lands on the
linked error, no `POST /api/dishes` fires.

**BC-A-2** · assert · Servings must be a whole number ≥ 1; violations show a visible
linked message and block submission.
Check: fast; servings "0" and "1.5" → "Enter servings as a whole number, at least 1."
visible each time; no dish created.

**BC-A-3** · assert · After a dish is created, a first pass begins automatically —
the workbench enters a visible proposing state without any further input. **[FAILS
TODAY — workbench opens idle; the cook must guess that intent → "Try it" is the move]**
Check: live-sim; create a dish → within 2s of `/dishes/:id` rendering, the proposing
state (BC-B-1 surface) is visible with no intent typed; the resulting proposal parks
at the gate per BC-C-1.

**BC-A-4** · assert · Firing "Try it" (click or Enter) with an empty or
whitespace-only intent is never a silent no-op: visible validation feedback appears,
the intent field keeps/receives focus, and no move request is sent. **[FAILS TODAY —
`IntentBar.tsx:32` returns with zero feedback]**
Check: fast; on an idle workbench click "Try it" with `#cc-intent` empty → a visible
validation message appears (role="alert" or linked error), `#cc-intent` is focused,
no `POST .../moves` fires.

**BC-A-5** · assert · While a move is in flight, the intent affordances are visibly
unavailable and cannot dispatch a second move.
Check: live-sim; submit an intent, then immediately attempt a second submit → the
affordance is disabled/replaced, exactly one `POST .../moves` total; no unhandled
error banner.

**BC-A-6** · assert · The deterministic "Just the math" chips dispatch their move,
and each chip carries the small "auto" tag exactly when the autonomy dial is ON.
Check: fast; dial ON → all 4 chips show "auto"; dial OFF → no "auto" tags;
"Recompute cost" dispatches a move either way.

**BC-A-7** · assert · Creating a dish navigates to `/dishes/:id` (URL-per-dish), and
that URL is shareable: a fresh load of it renders the same dish.
Check: fast; create → `location.pathname` starts `/dishes/`; reload the URL cold →
same dish title renders.

**BC-A-8** · judge · A first-time cook can get from the seed screen to their first
gate decision guided by the screen alone — at every step the single next action is
unmistakable.
Check: live-sim; capture screenshots at seed screen, post-create, mid-proposing, and
at the gate → judge: is the next action obvious at each frame without documentation?

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

**BC-B-4** · assert · Focus never lands on Stop automatically: while proposing, an
Enter keypress without an explicit user focus choice does not cancel the move.
**[FAILS TODAY — `Workbench.tsx` `focusDecision` parks focus on Stop; a stray Enter
cancels silently]**
Check: live-sim; submit an intent via `#cc-intent` + Enter; 2s later press Enter
again with no intervening focus action → the move is still in flight (no
`move-cancelled`), and `document.activeElement` is not the Stop button.

**BC-B-5** · assert · Cancelling is explicit and always confirmed: activating Stop
yields a visible cancelled state — announcement, return to Ready, no new trial.
Check: live-sim; click Stop mid-generation → "Move cancelled" announced, state pill
returns to "Ready", timeline trial count unchanged.

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

## C. Gate & decisions

**BC-C-1** · assert · A creative proposal always halts at the gate: the draft and
version chain do not change until the cook picks a verb, regardless of the dial.
Check: fast, dial ON; run a creative intent → proposal parks at gate; `/versions`
unchanged until a verb fires.

**BC-C-2** · assert · The gate offers all six verbs: "Use it" and "Tweak it" up
front, and "Try another way" disclosing regenerate / compare-two-options /
ask-for-changes / edit-it-myself — every verb reachable by mouse and keyboard.
Check: fast; at the gate assert `button[data-verb]` ∈ {accept, edit} visible, open
the disclosure → {regenerate, alternatives, redirect, take_over} present; roving
arrow keys traverse the row.

**BC-C-3** · assert · Accept commits exactly one trial, even under a double-click,
and confirms visibly ("Use it — saved to the timeline").
Check: fast; double-click `button[data-verb="accept"]` → timeline count +1 exactly,
toast visible, no error banner.

**BC-C-4** · assert · The keyboard map is safe: single-key verbs (A/E/G/L/R/T) fire
only in decide mode and never while a text field is focused; Escape never triggers a
destructive action (no accept, no move-cancel).
Check: fast; at gate, focus the redirect input and type "great" → no verb fires;
press Escape twice → back at decide mode, proposal still pending; live-sim; press
Escape while proposing → move still in flight.

**BC-C-5** · assert · "Edit it myself" (take-over) validates: invalid JSON shows a
visible role="alert" error and blocks Save; valid JSON commits the human edit as a
new trial.
Check: fast; open takeover form, enter `{oops` → alert visible, no dispatch; enter
valid draft JSON → new trial appears.

**BC-C-6** · assert · "Ask for changes" cannot fire empty: Send stays disabled until
the steer text is non-empty; a real steer re-proposes.
Check: fast; open redirect form → Send disabled; type steer → Send enabled; send →
new proposal arrives at the gate.

**BC-C-7** · assert · A safety-blocked move renders the hold — role="alert", the
reason, the struck-through would-have-added list — offering exactly two recovery
verbs ("Try a different way", "Ask for a safer change"), and a safer steer clears
the hold with a fresh proposal.
Check: fast; intent that trips the anaerobic garlic-oil rule → `[data-testid=
"safety-hold"]` with reason + exactly 2 `data-verb` buttons; steer "skip the raw
garlic-in-oil step" → hold clears, new proposal parks at gate.

**BC-C-8** · assert · A human edit that trips safety escalates to the 409
warn-and-confirm dialog, focused on the least-destructive option; Escape backs out;
"Use it anyway" applies with `confirmOverride`.
Check: fast; take-over draft containing the garlic-in-oil op → `[data-testid=
"override-prompt"]` (role=alertdialog) with focus on "Go back — I'll change it";
Escape → dialog closes, nothing committed; re-open, confirm → trial commits.

**BC-C-9** · assert · While a gate action is in flight the pending verb shows a busy
state (aria-disabled + spinner) and repeated clicks do not double-fire.
Check: live-sim on the gate action (regenerate); click regenerate twice fast →
exactly one `POST .../gate`, spinner on the verb, control still announced (no
native `disabled`).

**BC-C-10** · assert · "Compare two options" yields exactly two labeled alternative
cards; picking one stages that proposal for a normal gate decision.
Check: fast; fire `data-verb="alternatives"` → two `[data-testid="alt-card"]` (A/B);
click A → gate bar shows for A's diff; accepting commits one trial.

**BC-C-11** · judge · The verbs read as culinary decisions, not API calls — a cook
scanning the gate understands what each does to the dish.
Check: fast; screenshot the gate with disclosure open, both themes → judge label
legibility against the six underlying verbs.

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
gate.

**BC-D-3** · assert · Branch + promote work end-to-end: promoting a past trial moves
the trunk pointer (confirmed visibly), and the next accepted move lands as a
branch-badged trial on the new line.
Check: fast; 2 trials → open Trial 1 → "Promote to trunk" → toast "… promoted to
service", `currentVersionId` now Trial 1's; run + accept a move → new trial shows
the "Branch" badge.

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

## E. Post-cook loop

**BC-E-1** · assert · "I cooked this" opens the tasting form, and "Rework from these
notes" runs iterate_feedback against exactly the cooked version, parking a new
proposal at the gate.
Check: fast; on Trial 2 click "I cooked this" → `#cc-tasting-notes` visible; submit
notes → proposal arrives whose base version (technical view / `GET /versions`) is
Trial 2's.

**BC-E-2** · assert · The cooked trial is marked: "Cooked" badge on its spine card
with the note echoed.
Check: fast; after BC-E-1 → Trial 2's card shows "Cooked" and the note text.

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
automatically"; timeline +1.

**BC-F-3** · assert · Auto-applied trials stay attributable after the fact: the
trial that landed automatically is distinguishable on the workbench (spine card or
technical view) from a human-accepted trial. **[LIKELY FAILS TODAY — the toast is
the only attribution and it evaporates in ~2.6s]**
Check: fast, dial ON; auto-apply once, accept once, enable technical view → the two
trials are visibly distinguishable (marker text/badge identifying the auto-applied
one).

**BC-F-4** · assert · Dial OFF: the same deterministic move stops at the gate like
any other proposal.
Check: fast, dial OFF; "Recompute cost" → parks at gate; no auto-apply toast.

**BC-F-5** · assert · Dial ON never auto-applies creative moves — they always park
at the gate.
Check: fast, dial ON; creative intent → gate, `/versions` unchanged until verb.

## G. Modes (technical view · themes · motion · narrow)

**BC-G-1** · assert · The technical view toggle (aria-pressed, persisted) reveals
the honest machinery — ops JSON, confidence, provenance ids, ver ids, and `rule_id`
on holds — and hides it all when off.
Check: fast; toggle ON → "Structured diff · JSON-Pointer ops" on the dish card,
ver-id lines on spine cards, `rule_id:` on a hold; toggle OFF → all gone; reload →
setting persists.

**BC-G-2** · assert · Theme cycles system → light → dark, persists across reload,
and pins `[data-theme]` on the root.
Check: fast; cycle to dark → `html[data-theme="dark"]`; reload → still dark; cycle
to system → attribute cleared.

**BC-G-3** · judge · Both themes stay legible across the core states — idle,
proposing, gate, safety hold — with no unreadable contrast or invisible affordance.
Check: capture the 4 states × {light, dark} → judge each pair.

**BC-G-4** · assert · Reduced motion is honored without losing the alive-signal:
animations are stilled, yet the proposing state still visibly progresses (BC-B-3's
text still accumulates).
Check: live-sim with `prefers-reduced-motion: reduce` emulated → computed
animation/transition durations are 0s on the proposing surface AND rationale text
still appears at t ≤ 20s.

**BC-G-5** · assert · Narrow viewports get the one-column layout with the stage
first, the gate sticky at the bottom, and no horizontal overflow at 390px.
Check: viewport 390×844; drive to the gate → single column, `#cc-gate` sticky
bottom, `document.documentElement.scrollWidth <= 390`.

**BC-G-6** · judge · The full loop remains operable at phone width — seed → propose
→ decide without mis-taps or hidden controls.
Check: viewport 390×844; screenshots at seed/proposing/gate → judge operability.

## H. Errors & resilience

**BC-H-1** · assert · Backend unreachable → a legible failure, never a blank screen:
"Could not load this dish …" with a "Back to dishes" escape hatch.
Check: load `/dishes/:id` with the server stopped (static shell served separately or
navigate then kill) → error card visible, no uncaught exception in the console.

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
re-dispatches (fails again, consistently); no `safety-hold` rendered. Harness note:
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
restart with a dummy `DEEPSEEK_API_KEY` (no calls made) → `/api/status` reports
live and the banner is absent.

**BC-H-7** · assert · An unknown dish deep-link fails soft: `/dishes/nope` renders
the could-not-load card, not a crash or infinite spinner.
Check: fast; navigate to a fabricated id → error card ≤ 3s, console free of
uncaught errors.

## I. Live-mode parity (the 25s sweep)

**BC-I-1** · assert · Every generation-touching assert passes identically under
live-sim latency: the parity set is {BC-A-3, BC-A-5, BC-C-1, BC-C-7, BC-C-10,
BC-E-1, BC-F-5, BC-H-2, BC-H-3} (area B already runs natively in live-sim).
Check: re-run the parity set with `CAPYCOOK_STUB_LATENCY_MS=25000` → all pass; the
oracle report lists each as `<id>@live-sim`.

**BC-I-2** · judge · The 25s wait is survivable end-to-end: watching the full
screencast, a cook can tell the system is working, roughly what it is doing, and
how to bail out safely — the loop is worth the wait.
Check: live-sim; one full journey screencast (intent → wait → proposal → accept) →
judge survivability. **[FAILS TODAY — this is the session finding that motivated
02b]**

**BC-I-3** · assert · During a long generation the rest of the workbench stays
honest: timeline browsing still works, unavailable actions look unavailable, and
nothing invites a click that will error.
Check: live-sim; mid-window, click a past trial (should work, read-only) and
attempt an intent submit (should be visibly unavailable per BC-A-5) → no error
banner from either.

## J. Guardrails (evaluated every loop iteration)

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
