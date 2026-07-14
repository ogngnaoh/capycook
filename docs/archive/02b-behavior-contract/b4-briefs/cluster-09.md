# B4 cluster 9 brief — diff repertoire (+ D-7 spine de-risk)

Criteria: BC-C-16 (assert; @live-sim twin rides the same fix) + a small
BC-D-7 (judge) de-risk. Verbatim contract text at the end.

## Root causes (census run-073 + pre-census investigation)

1. **BC-C-16, changed-STEP clause** — `StepRow` (`web/src/components/
   DishCard.tsx:250`) has no changed branch: no struck-through old value, no
   sr-only was/now; `mergeDiff` produces `row.old` and StepRow ignores it (a
   changed step renders as a faint tint only; no unit test covers it).
   Related: the sr-only "now:" label is absent even on changed INGREDIENT
   rows — verify all three row kinds (`ingredient-row` / `step-row` /
   `flavor-row`) against the full add/change/remove markup matrix.
2. **BC-C-16, removed-row clause — stub fixture gap (sanctioned product-side
   work)**: no stub template emits a `remove` op or an in-place step
   `replace`, so the removed-row markup is undrivable. Extend
   `internal/llm/stub.go` with a template whose diff adds one ingredient,
   changes one step, and removes one flavor claim — the check recipe's exact
   shape. READ (do not edit) the oracle scenario that drives BC-C-16 under
   `web/tools/oracle/scenarios/` first: the B2 critics added a "spring clean"
   driving intent — match the fixture to what the scenario dispatches so the
   clause becomes drivable without harness edits.
3. **BC-D-7 de-risk (judge, currently flaky-strict)**: a fresh judge failed
   the spine because the BRANCH badge has no inline self-explanation — the
   COOKED badge is reinforced by a "You cooked it" quote box, BRANCH by
   nothing. Add a small text note on branch trials (e.g. "Branched from
   Trial N") in `TimelineSpine.tsx`, exposed as text in the accessibility
   tree (not color-only). Keep it visually quiet — the spine's design
   language is the cc warm palette over the Acne structural system; match
   the existing "You cooked it" note's styling.

## Cautions

- Go touched (stub template) → `make test` + `make vet`. The stub's OTHER
  templates back green criteria (A-3's seed_expand, alternatives pair,
  budget fixtures) — extend, don't reshape.
- Do not rename `data-testid` row markers (`ingredient-row`, `step-row`,
  `flavor-row`). Tailwind: pixel-exact values need bracket classes.
- Green set to protect (28 ids): see ledger.

## Contract text (verbatim)

**BC-C-16** · assert · A pending proposal previews its exact change inline in
non-technical view: an added ingredient/step/flavor row carries a visible "New"
marker plus an SR-only "added" announcement, a changed row shows old (struck
through) and new values with SR-only was/now labels, and a removed row is struck
through with an SR-only "removed" announcement.
Check: fast; drive a move whose diff adds one ingredient, changes one step, and
removes one flavor claim → at the gate, technical view OFF, the corresponding
`[data-testid="ingredient-row"]` / `step-row` / `flavor-row` carry the
add/change/remove markup and the `sr-only` added/removed/was/now text.

**BC-D-7** · judge · The spine reads as a line of development: trials scannable,
current position obvious, "Cooked"/"Branch" badges self-explanatory.
Check: fast; screenshot a spine with ≥3 trials incl. one cooked + one branch, both
themes → judge.
