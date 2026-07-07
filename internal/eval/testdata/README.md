# internal/eval/testdata — SYNTHETIC fixtures only

Everything in this directory is hand-built synthetic instrument-test data for
the eval harness. Nothing here is (or may ever become) benchmark data, operator
telemetry, or real labels — versioned eval instruments live in `eval/fixtures/`
and are governed by `docs/PREREGISTRATION.md`. Per the phase-4 rails, synthetic
label values are permitted here and ONLY here.

- `events_gate_dynamics.json` — synthetic event log (JSON array of
  `eventlog.Event`) exercising the H2 gate-dynamics fold: two operator
  sessions, a failure-only session, and an excluded harness run. Expected
  numbers are hand-computed in `replay_test.go`.
- `claims_labeled.jsonl` — synthetic labeled-claim file (plan 4.6 schema) with
  hand-picked labels covering all five frozen §7a categories plus an unlabeled
  row. Expected rates are hand-computed in `rates_test.go`.
- `claims_double_labeled.jsonl` — synthetic claim file whose double-labeled
  subset is exactly 20 rows (plus 3 rows missing a label, which the κ subset
  must exclude). The full confusion matrix, marginals, and Cohen's κ are
  hand-computed in `kappa_test.go`.
- `seeds_synthetic.json` — two synthetic dish seeds for the arm-runner tests
  (`runner_test.go`). Not benchmark data: the proposed benchmark seeds are
  drafted in `docs/01-end-to-end/proposed-benchmark-seeds.json` (plan 4.5)
  and reach `eval/fixtures/` only after Gate C ratification.
