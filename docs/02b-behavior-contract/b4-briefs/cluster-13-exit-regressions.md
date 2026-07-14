# B4 cluster 13 brief — exit-run product regressions

Criteria: **BC-G-8**, **BC-H-4** (both assert). Both were GREEN at census
(run-073) and regressed during the B4 loop — surfaced by the SCOPE-FIRST
informative full run (run-023). Verbatim contract text at the end — the oracle
re-checks exactly those pass conditions.

Two independent, small product fixes. Both live in `web/src/`.

## Root causes (run-023 + code @ `590c55b`)

### BC-G-8 — gate disclosure header is 20px tall (< 24×24 WCAG 2.5.8)
`web/src/components/GateBar.tsx:390` — the **expanded-state** "Try another way"
disclosure header (rendered when `mode === 'another'`, the ▴ collapse toggle):

```jsx
<button type="button" aria-disabled={locked} aria-expanded="true"
  onClick={backToDecide}
  className="self-start text-[12px] text-muted transition hover:text-ink">
  {GATE_ANOTHER_LABEL}<span aria-hidden="true"> ▴</span>
</button>
```

`text-[12px]` with no min-height renders ~104×20px. run-023 measured exactly one
control < 24px on `g/desktop-modes` (surface `gate-header`) AND on `g/narrow-390`
— it fails at every viewport because the height is viewport-independent. The
collapsed-state header at `:370` uses `bigGhostBtn(...)` and is already fine; the
banner's own Try again/Dismiss are `min-h-[32px]` — this expanded toggle is the
only offender.

**Fix:** give it a ≥24px hit area. Tailwind theme scales are REPLACED here, so
`min-h-6` is a silent no-op — use a bracket class: add `min-h-[24px] inline-flex
items-center` (keep `self-start`) to the className. Width (104px) already clears
24px; only height is short.

### BC-H-4 — focus drops to document.body after a failed move
`web/src/components/Workbench.tsx` — `onMoveFailed` (`:266–276`) tears the
proposing state down (`setDetail` proposing→idle, `setOptimisticProposing(false)`)
but **never redirects focus**. B4's focus-at-dispatch mechanism
(`dispatchFocusPending` ref + the `useLayoutEffect` at `:385`) puts focus on the
proposing card's heading at dispatch; that ref is consumed once at dispatch, so
when the move later FAILS the layout effect early-returns (`:386`) and the focused
proposing-card heading unmounts → `document.activeElement` falls to
`document.body`. run-023 `h/budget`: `focus not dropped to document.body` FAIL
(observed `{tag:"body", isBody:true}`). The move-failed banner
(`:788`, `data-testid="move-failed-banner"`, role="alert") has a "Try again" and
"Dismiss" button but no focusable heading.

Note the asymmetry (don't be misled): `onMoveCancelled` (`:257`) also omits a
focus redirect, yet BC-B-5 passes — because a *cancel* is a Stop **click** and
`cancelMove()` (the click path) calls `focusDecision()`. A move failure is an
async SSE event with no click, so `onMoveFailed` must move focus itself.

**Fix:** in `onMoveFailed`, after the failure transition, land focus on a
defined, attached, non-`body`, non-Stop target. Cleanest options (builder
judgment):
- focus the move-failed banner — add `tabIndex={-1}` to the banner div (`:788`)
  and focus it when it mounts (small effect keyed on `moveFailed`), OR focus its
  "Try again" button (the recovery action); OR
- reuse the existing mechanism: set `dispatchFocusPending.current = true` inside
  `onMoveFailed` before the `setDetail`, so the layout effect re-fires and
  `focusDecisionNow()` lands on `#stage-heading` (no gate bar / proposing card
  present on failure → it falls through to the stage heading, `:359`).

The contract's hard requirement is only: attached, not `document.body`, not Stop.

## Suggested shape (builder judgment prevails on details, not outcomes)

- BC-G-8: one bracket-class change on `GateBar.tsx:390`.
- BC-H-4: focus redirect in `onMoveFailed`. Prefer focusing the banner or its
  Try again (best recovery UX); the stage-heading fallback is acceptable.
- Run the relevant unit tests: `cd web && npx vitest run src/components/Workbench.test.tsx`
  (it already covers move-failed banner, Try again, and BC-A-13 restore; jsdom
  cannot see native focus/paint — the oracle covers that side, but keep the
  existing tests green and add one asserting focus is not `document.body` after
  `move-failed` if it fits the existing style).

## Cautions

- **Frozen paths** (abort on touch): the 7 instrument paths, `PREREGISTRATION.md`,
  `contract.md`. Do not edit `web/tools/oracle/**` or anything under `docs/` (the
  lead owns the harness + docs).
- Do NOT rename `data-testid` / `#stage-heading` / `#cc-gate` ids or the
  `data-verb` attributes — the oracle's selector vocabulary depends on them. If a
  fix genuinely needs a selector change, STOP and flag it as a deviation.
- Do not regress neighbors: BC-G-5/G-9/G-11 (other G-sweep clauses share the
  screens), BC-B-5 (cancel focus), BC-A-13 (failed move preserves typed input —
  `onMoveFailed` already calls `restoreIntent`; keep it), BC-C-22 (the disclosure
  toggle's `aria-expanded` — keep it). Never focus the Stop control.
- Tailwind theme scales are REPLACED, not extended — pixel-exact values need
  bracket classes (`min-h-[24px]`, not `min-h-6`).

## Contract text (verbatim)

**BC-G-8** · assert · Interactive controls stay tappable: every control on the core
surfaces (intent bar, gate, dial, spine trial buttons) has a hit area of at least
24×24 CSS px (WCAG 2.5.8).
Check: fast, at a gate with the disclosure open; measure `getBoundingClientRect()`
over `button, [role="switch"], a` within the intent bar, gate bar, header
(including the theme/technical-view toggles and dial), and spine → all ≥ 24×24;
sweep the seed screen too (`#field-seed`, allergen chips, selects, servings,
submit) and the recent-dishes list entries on `/`; drive to a safety hold, an
override dialog, the alternatives-picker, the proposing card's Stop control
(live-sim), the CookFlow trigger + opened tasting form, and a `move-failed-banner`'s
Try again/Dismiss and measure those controls too; repeat the FULL sweep at viewport
390×844.

**BC-H-4** · assert · A failed move (including budget exhaustion) surfaces the
role="alert" move-failed banner with the reason and a working "Try again" —
never a safety hold, never silence.
Check: budget profile (cap forced to $0 via env/ledger so generation is refused
pre-call) → banner "Move failed … try again." with the reason; "Try again"
re-dispatches (fails again, consistently); no `safety-hold` rendered; after the
failure transition, `document.activeElement` is attached and not `document.body`.
