# B4 cluster 6 brief — first pass + suggestions

Criteria: BC-A-3, BC-A-14 (both assert). Verbatim contract text at the end.
Both live in the Workbench proposal lifecycle.

## Root causes (census run-073 + pre-census investigation)

1. **BC-A-3** — the workbench opens idle after dish creation; nothing
   auto-fires a first pass. The auto-fire must happen ONLY on the SPA
   navigation that immediately follows a successful create — an in-memory
   "just created" signal that a hard reload cannot resurrect. Four boundary
   conditions are contract-checked (see verbatim text): revisit/reload never
   auto-fires; mid-flight reload re-renders proposing (not idle) with the
   lifetime `POST .../moves` count still 1; an undecided proposal re-renders
   at the gate after reload with count still 1; a FAILED auto pass falls back
   to manual — reload renders idle, never a silent auto-retry.
2. **BC-A-14** — "Try next —" chips never render: `setSuggestedNext` lives
   only in the SSE proposal-ready handler gated on `expectedMove.current`
   (`Workbench.tsx:151`); under fast mode the SSE event can arrive before the
   POST response assigns the expected move id, and the resync/GET recovery
   path never populates suggestions. Fix the race and populate from the
   GET/resync path too (the dish detail / latest version carries
   `suggested_next` — verify the API surface). Chips must carry a real
   accessible name matching the move label — never empty, never a raw slug.
   Clicking a chip dispatches its own move (this already funnels through
   `propose()` — A-5's dispatch lock and focus mechanics are green, do not
   disturb them).

## Cautions

- Auto-fire goes through the SAME `propose()` path (lock, focus, stash
  mechanics all green) — do not fork a parallel dispatch path.
- A-3's "within 2s" includes the BC-B-1 proposing surface AND
  `[data-testid="gate-live-region"]` containing "Proposing a move…".
- Respect BC-D-4 resume behavior (pending proposal re-renders after reload) —
  it exists; don't break it while adding the boundaries.
- Do not rename data-testids/ids. No oracle/docs/frozen edits. Full
  `npx vitest run` + `npx tsc --noEmit` green.
- Green set to protect (18 ids): A-4, A-5, A-9, A-13, B-1, B-4, B-5, C-13,
  C-17, C-21, C-27, D-2, E-4, E-5, H-1, H-7, H-8, H-9.

## Contract text (verbatim)

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

**BC-A-14** · assert · A suggested-next ("Try next —") chip actually works:
clicking one dispatches its own move and the workbench enters the proposing
state; the chip carries a real, non-generic accessible name.
Check: fast; accept a proposal whose `suggested_next` is non-empty so the chips
render on the idle intent bar; click one → `POST .../moves` fires with the
corresponding moveType, the proposing surface (BC-B-1) appears, and the chip's
accessible name matches its move label (never empty or a raw slug).
