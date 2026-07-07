# Handoff — Milestone 01 (end-to-end build)

## Next session start here
**Gate A review** (plan task 2.8 stop): present `data/safety/*`,
`data/cost/prices.csv`, `data/ingredients.csv` + the per-asset PROVENANCE.md
files to the user; apply redirects, then tag `phase-2-data-services` and
continue at task 3.1 in `docs/superpowers/plans/2026-07-06-end-to-end-build.md`.

## Current state
- Branch `e2e`; Phase 2 complete through 2.8 (untagged — orchestrator tags after
  review). All suites green; e2e script passes local + docker
  (evidence/phase2/e2e_{local,docker}.txt).
- Real edges wired in cmd/server: USDA nutrition, cost table, FSIS/CDC safety gate
  (allergen composed), FlavorGraph + Resolve grounding. Accept/take_over/edit
  snapshots carry resolver-filled fdc/foodon ids + real analysis; deterministic
  recomputes cite real provenance (fdc ids, cost-table as-of). LLM is still the
  Phase-1 stub (no live calls before Gate B).
- Container ships the data CSVs at /srv/data (`DATA_DIR`), outside the /data volume.

## Active concerns
- Gate A honesty: cost tier-B rows are builder estimates (tagged per row); FoodOn
  closure + safety lexicon rows each carry citations — user spot-review pending.
- Phase 3 verify-before-build: re-check DeepSeek docs (model id, /beta strict,
  json_object, pricing) before any 3.x work; structural drift stops at Gate B.
