# B4 cluster 1 brief — focus-at-dispatch + return

Criteria: BC-A-5, BC-B-1, BC-B-5, BC-C-17, BC-D-2 (all assert). Verbatim
contract text at the end — the oracle checks exactly those pass conditions.

## Root causes (census run-073 + pre-census investigation, code @ cb43431)

All in `web/src/components/Workbench.tsx` unless noted.

1. **`focusDecision` (~:234) targets the Stop button while proposing (~:238)** —
   `[data-testid="proposing-card"] button` IS Stop. The contract prohibits focus
   ever landing on Stop (BC-A-5, BC-B-4's standing prohibition). Meanwhile at
   dispatch nothing moves focus at all: the intent bar unmounts and
   `document.activeElement` drops to `document.body` (BC-A-5 focus clause).
2. **The proposing card can mount entirely above the viewport** — measured top
   −126..bottom −28 at 1280×800 in the `b/one-window` journey; nothing scrolls
   it into view (BC-B-1 "visible" clause).
3. **`cancelMove` (~:320–330) never restores focus** — unlike `runGate` (~:287)
   which calls `focusDecision()`. Stop unmounts → focus drops to body (BC-B-5).
4. **"Back to current" (`setSnapshot(null)`, ~:535) neither refocuses nor
   announces** — focus drops to body (BC-C-17 back-to-current clause) and the
   live region stays silent (BC-D-2 return announcement). Note `announce`
   (~:105) and the existing `document.getElementById('stage-heading')?.focus()`
   pattern (~:372, ~:382) — follow those patterns.
5. **No synchronous dispatch lock in IntentBar chips / `propose` (~:246)** —
   double-clicking a chip fires two `POST .../moves` (BC-A-5 chip variant;
   same class as BC-A-12's Enter path, but A-12 is a different cluster — fix
   the moves path here, don't touch dish creation).

## Suggested shape (builder judgment prevails on details, not on outcomes)

- Give the proposing card (`web/src/components/ProposingCard.tsx:12`) a
  focusable heading (`tabIndex={-1}`), e.g. on its working-label element.
- Point `focusDecision`'s proposing branch at that heading, never Stop, and
  ensure focusing scrolls it into view (default `.focus()` scrolling, or
  `scrollIntoView` — B-1 needs the card visible in the viewport ≤1s).
- Call `focusDecision()` at move dispatch (when the intent bar unmounts) and in
  `cancelMove` after cancel resolves (post-cancel there is no proposing card,
  so it lands on `#stage-heading` — that satisfies B-5's "defined, attached").
- BC-B-5 also asserts: "Move cancelled" announced + state pill back to "Ready"
  + trial count unchanged — verify these hold; fix if the announcement is
  missing.
- "Back to current" handler: `announce()` a distinct non-empty message (e.g.
  "Back to the current version.") AND focus `#stage-heading`.
- Add an in-flight ref lock around move dispatch (`propose` and the chip
  handlers in `web/src/components/IntentBar.tsx`) so a second synchronous
  activation cannot fire a second POST.

## Cautions

- BC-B-4 (regenerate re-entry) and BC-E-4 are cluster 2 — do not chase them,
  but do not regress them either: never focus Stop.
- Existing vitest suites cover Workbench/IntentBar behavior — run
  `cd web && npx vitest run` locally; jsdom cannot catch native scroll/paint,
  the oracle covers that side.
- Do not rename `data-testid` attributes or `#stage-heading` /
  `#cc-intent` ids — the oracle's selector vocabulary depends on them; if a
  fix genuinely requires a selector change, STOP on that criterion and flag it
  as a deviation instead.

## Contract text (verbatim)

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

**BC-B-1** · assert · Within 1s of a move starting, a visible proposing state
appears: working label, progress affordance, and an explicit Stop control.
Check: live-sim; submit an intent → `[data-testid="proposing-card"]` visible ≤ 1s
after the POST, containing the working label and a `Stop` control.

**BC-B-5** · assert · Cancelling is explicit and always confirmed: activating Stop
yields a visible cancelled state — announcement, return to Ready, no new trial —
and keyboard focus lands on a defined, attached target, never dropped to
`document.body` when the Stop control unmounts.
Check: live-sim; click Stop mid-generation → "Move cancelled" announced, state pill
returns to "Ready", timeline trial count unchanged, and `document.activeElement`
is attached and not `document.body`.

**BC-C-17** · assert · After a gate verb resolves with no next proposal awaiting,
keyboard focus lands on a defined, visible target (the stage heading) — never left
on a removed element or dropped to `document.body`.
Check: fast; at a gate, activate "Use it" → after the confirmation,
`document.activeElement` is `#stage-heading` (not `document.body`, not a detached
node); repeat after a completed "Tweak it" edit and after "Back to current"
restores the live view (BC-D-2).

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
