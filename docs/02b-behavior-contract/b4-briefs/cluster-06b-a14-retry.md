# B4 brief — BC-A-14 retry (attempt 2): optimistic proposing at dispatch

Criterion: BC-A-14 (assert). Contract text at the end.

## What attempt 1 got right and where it missed (oracle run-006, a/idle-intent)

Attempt 1 (`c0835af`) fixed the chips themselves — all of these PASSED:
chip renders on the idle intent bar ("Technique step"), accessible name is
the move label (not a slug), click dispatches exactly one POST with
moveType=technique_step. The ONLY failing clause:

> proposing surface appeared (BC-B-1 surface) — observed: never

The scenario arms a MutationObserver on `[data-testid="proposing-card"]`
BEFORE the chip click; the card never mounted, even transiently. Root cause:
under the fast (zero-latency) stub, the move completes server-side before the
follow-up GET returns, so `detail.state` jumps idle → awaiting_gate in one
commit and ProposingCard never renders. The contract requires the workbench
to visibly ENTER the proposing state on dispatch, regardless of backend speed.

## Suggested shape

- Enter proposing OPTIMISTICALLY at dispatch inside `propose()`
  (Workbench.tsx): mount the proposing surface synchronously when the move
  is dispatched, then reconcile with the follow-up GET/SSE truth (instant
  completion → the card unmounts on the awaiting_gate commit; a brief
  proposing beat under fast mode is correct UX, a 25s persistence under
  live-sim is unchanged).
- This composes with the GREEN A-5 mechanics: `dispatchFocusPending` +
  the layout effect will focus the proposing heading on the same commit —
  that is exactly the intended behavior; verify the A-5 jsdom tests still
  pass unchanged.
- Failure/cancel paths must clear the optimistic state (move-failed banner,
  A-13's restore, A-3's fourth boundary all assert non-proposing outcomes —
  all green, protect them).
- Auto-fired first passes (A-3) go through propose() too — the optimistic
  mount applies there identically (A-3's mid-flight/failed boundaries are
  re-checked in the same run).

## Cautions

- Do not rename data-testids/ids. No oracle/docs/frozen edits.
- Full `npx vitest run` + `npx tsc --noEmit`; add a test pinning "chip click
  mounts the proposing surface synchronously under instant completion".
- Green set to protect (23 ids): see ledger.

## Contract text (verbatim)

**BC-A-14** · assert · A suggested-next ("Try next —") chip actually works:
clicking one dispatches its own move and the workbench enters the proposing
state; the chip carries a real, non-generic accessible name.
Check: fast; accept a proposal whose `suggested_next` is non-empty so the chips
render on the idle intent bar; click one → `POST .../moves` fires with the
corresponding moveType, the proposing surface (BC-B-1) appears, and the chip's
accessible name matches its move label (never empty or a raw slug).
