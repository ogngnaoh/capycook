# B4 cluster 2 brief — focus second wave (+ BC-A-5 retry)

Criteria: BC-A-5 (attempt 2), BC-B-4, BC-E-4 (all assert). Verbatim contract
text at the end.

## BC-A-5 retry — why attempt 1 missed (adjudicated from oracle run-001)

Attempt 1 (commit 4256505) fixed 4/5 cluster-1 criteria; A-5's dispatch-lock
and no-error-banner clauses now pass. The FOCUS clause still fails:

- The oracle arms `armMoment({ kind: 'disappear', selector: '#cc-intent' })` —
  a MutationObserver that records `document.activeElement` in the microtask
  right after the DOM batch that REMOVES `#cc-intent` (see
  `web/tools/oracle/scenarios/a-intake.mjs` a/inflight-lock, ~:648-673 — read
  it, do not edit it).
- Attempt 1 called `focusDecision()` after a follow-up GET resolved — network
  latency after the unmount instant. Observed: focus on `<body>` at the moment.

Fix so focus is in place by the end of the task that commits the unmount:

- Recommended: in `ProposingCard`, a `useLayoutEffect` on mount that focuses
  the `data-testid="proposing-heading"` element. React runs layout effects
  synchronously in the same commit that unmounts the intent bar and mounts the
  card — before any MutationObserver microtask fires.
- GATE the auto-focus to local dispatch only (e.g., a prop or ref flag set in
  `propose()` — the `moveInFlight` ref from attempt 1 is available): a
  deep-link/reload into an already-proposing dish must NOT steal focus on cold
  load (see App.tsx's routeNonce pattern, audit #9 comment).
- Verify the intent bar unmount and card mount happen in the same state
  commit; if there is an intermediate render where the bar is gone and the
  card not yet mounted, close that window too.
- Keep or remove attempt 1's post-GET `focusDecision()` call as you judge —
  it is harmless as a backstop but no substitute.

## BC-B-4 — likely already fixed; verify at the trap moments

4256505 retargeted `focusDecision`'s proposing branch from the Stop button to
the proposing heading — B-4's root cause. The oracle samples at four trap
moments (regenerate re-entry; alternatives first-arrival; ask-for-changes
respawn; safety-hold "Ask for a safer change"). Trace each path and confirm
focus can never land on Stop there; fix any path that bypasses the retargeted
branch. If code inspection + tests show all four are covered by the retarget,
say so explicitly in your report — do not make no-op edits.

## BC-E-4 — CookFlow cancel focus restoration

`web/src/components/CookFlow.tsx`: opening "I cooked this" must move focus
into `#cc-tasting-notes` (verify — may already hold), and Cancel must return
focus to the "I cooked this" trigger — today the focused textarea unmounts
and focus drops to `document.body`. Follow the focus-restore patterns from
4256505 / the gate forms.

## Cautions

- Do not rename `data-testid` attributes, `#cc-intent`, `#cc-tasting-notes`,
  or `#stage-heading`. Do not touch web/tools/oracle/**, docs/, frozen paths.
- Do not regress cluster 1: B-1, B-5, C-17, D-2 are green and re-checked in
  the same oracle run as your work.
- Run `cd web && npx vitest run` (full) + `npx tsc --noEmit`.

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
"Try next —" chip in turn while idle → exactly one `POST .../moves` per chip.

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

**BC-E-4** · assert · The tasting form manages focus like the gate forms do:
opening "I cooked this" moves focus into `#cc-tasting-notes`; Cancel returns focus
to a defined, attached target (the "I cooked this" trigger), never
`document.body`. **[LIKELY FAILS TODAY — CookFlow's cancel unmounts the focused
textarea with no focus restoration]**
Check: fast; click "I cooked this" → `document.activeElement` is
`#cc-tasting-notes`; click Cancel → `document.activeElement` is the "I cooked
this" trigger (attached, not `document.body`).
