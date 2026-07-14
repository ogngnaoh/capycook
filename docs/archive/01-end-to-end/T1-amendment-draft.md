# T1 amendment draft — PREREGISTRATION §9 entry text (instrument freeze)

> **THE USER logs this entry at milestone-02 start; the builder never edits
> `docs/PREREGISTRATION.md` — not its body, not its §9 log.** This file is only
> the prepared TEXT of that entry (spec §1.9 instrument freeze). Nothing here
> changes the frozen methodology; it pins the instruments that implement it.

## Refresh checklist (the user, before logging)

The SHA below has been refreshed to `git rev-parse HEAD`
(`08903cb95d41cfe7257cd0fd3691469409cb4a9b`) at the milestone-02 reframe's
instrument-final commit — replacing the earlier Phase-4 pin, which predated
the reframe's edits. `eval/fixtures/seeds.json` (ratified at Gate C) already
exists at this commit. Before appending the rows to §9:

1. Confirm the SHA is still the instrument-final commit of the milestone-02
   reframe — the last commit touching any pinned path (the reframe
   deliberately edited `internal/llm/prompts/` (provenance vocabulary +
   judge.tmpl), `internal/llm/evidence.go` (unchanged — verify), and
   `internal/eval/runner.go` (Tier-1 pass)); verify
   `git diff <sha>..HEAD -- <the 7 pinned paths>` is empty at gate time and
   that `eval/fixtures/seeds.json` exists at that commit. If a later task
   touches a pinned path before the gate, the SHA must be refreshed again.
2. Fill both Date cells with the actual T1 date (milestone-02 start).
3. Append the two rows below to the §9 table in `docs/PREREGISTRATION.md`
   (replacing the `| — | (none) | — |` placeholder row if it is still there).
   No other edit to that file, ever.

## Entry text (two rows for the §9 amendment-log table)

| Date | Change | Reason |
|---|---|---|
| (T1 date — fill at milestone-02 start) | **T1 instrument freeze.** All eval instruments pinned at commit `08903cb95d41cfe7257cd0fd3691469409cb4a9b` (refresh per draft checklist): prompts `internal/llm/prompts/` · benchmark seeds `eval/fixtures/seeds.json` (ratified at Gate C) · claim-extraction code `internal/eval/runner.go` · safety rules `data/safety/` · arm driver `eval/fixtures/move_script.json` · grounding-toggle component matrix `internal/llm/evidence.go` · verb→frozen-category mapping `internal/eval/mapping.go`. | Freeze the instruments by SHA **before any counted run** (build spec §1.9) so no prompt, seed, extractor, safety rule, driver, toggle, or mapping can drift after data exists. Dev prompt iteration used only `internal/llm/testdata/dev_seeds.json`, disjoint from the benchmark set. |
| (T1 date — fill at milestone-02 start) | **FoodPuzzle-proxy deferral.** The §5 "borrowed proxy" outcome (FoodPuzzle molecular-flavor accuracy) is deferred to P1 and not measured in v0. | FlavorDB-derivation license check and LLM-judge machinery are out of v0 scope (build spec §1.10); the deferral is logged as a dated amendment rather than silently dropped. |

## Rationale (short)

PREREGISTRATION froze the methodology at T0 (2026-07-01), before any code
existed. T1 closes the remaining gap between the frozen text and the running
apparatus: it pins, by commit SHA, the exact artifacts that operationalize the
methodology — what the model is prompted with, what dishes it is measured on,
how claims are extracted, what the safety gate enforces, how each arm is
driven, what each arm is allowed to see (the grounding toggle), and how native
gate verbs fold into the frozen five. After T1 is logged, a counted run is
reproducible from the pinned SHA alone, and any instrument change is visible
in the §9 log instead of being a silent edit.
