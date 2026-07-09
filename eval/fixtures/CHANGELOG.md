# Benchmark fixtures — changelog

Every change to the versioned benchmark set is logged here (PREREGISTRATION
§6). No fixtures yet — seeded in slice S0.3.

- **2026-07-07** — `move_script.json` v1 added (plan 4.3): the fixed 5-move
  script + auto-accept policy every benchmark seed runs identically per arm,
  pinned at T1. An instrument, not data — no labels, no seeds, no telemetry.
- **2026-07-07** — labeling kit v1 (plan 4.6): label schema pinned in README
  (claim_id, arm, dish, text, source, label_r1, label_r2 + CSV-only
  double_label marker); CSV export/import via `cmd/eval
  export-labels|import-labels`, validating labels against the five frozen
  PREREG §7a category names; seeded double-label sampler pinned (seed
  20260706, 18% target rate, stratified per arm, min 1 —
  `internal/eval/labels.go`). Instruments and documentation only — this
  directory still holds no seeds, no labels, no data.
- **2026-07-07** — `seeds.json` v1 RATIFIED at Gate C (user: all 13, incl.
  bench-12 basil-pesto + tree-nuts allergen stress seed, explicitly
  confirmed). Copied verbatim from
  `docs/01-end-to-end/proposed-benchmark-seeds.json`; 13 seeds × 5 moves ×
  3 arms ≈ 195 claims; dev-seed disjointness test-enforced
  (`internal/eval/seeds_test.go`). The benchmark set is now locked — changes
  from here require a PREREGISTRATION §9 amendment.
- **2026-07-08** — labeling kit v2 (PREREG §9 Amendment 1): the 15–20% seeded
  double-label sampler (seed 20260706, rate 0.18) is RETIRED — Tier-2
  double-label coverage is now 100% (every Tier-2 row carries
  `double_label=true`; no sampler, no rate). Blind kit v1 added
  (`internal/eval/blind.go`): blinded R1 CSV schema pinned
  (`blind_id,dish,text,source,label_r1` — no arm, no claim_id) + sidecar
  `blind_id`→`claim_id` map, seeded row shuffle `BlindShuffleSeed=20260708`;
  Tier-1 verifier↔author blind-check sample pinned
  (`BlindCheckSeed=20260709`, cap 18, stratified round-robin per arm); CLI:
  `export-labels --blind`/`--map`, `import-labels --blind --map --claims`,
  and new `blind-check` / `blind-check-score` subcommands. Instruments and
  documentation only — this directory still holds no labels, no data.
