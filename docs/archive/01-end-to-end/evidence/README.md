# Milestone 01 — evidence index (assembled at 6.2, 2026-07-07)

Every phase oracle, re-run at hand-back on branch `e2e` (tag `phase-6-handback`):

| Oracle | Result | Evidence |
|---|---|---|
| Go suite (`go test ./...`) | 16/16 packages ok | re-run 2026-07-07 at 6.2 |
| Web suite (`npx vitest run`) | 24 files, 194 tests pass | re-run 2026-07-07 at 6.2 |
| E2E script, local binary | PASS (create→stream→accept→block→redirect→accept→restart-survive) | `scripts/e2e_check.sh` output; phase1/ · phase2/ |
| E2E script, docker container | PASS (same loop, named volume) | same run, DOCKER MODE: PASS |
| Live DeepSeek + telemetry (Gate B) | verified 2026-07-07; ~$0.005 of $2 cap | phase3/ (langfuse_trace.json, wire fixture) |
| Eval dry-run, 3 arms | claims exported UNLABELED; empty PREREG table renders (N=0, κ n/a) | `make eval-run && make eval-report` → eval/out/ |
| Compose-up-from-clean-checkout | PASS (only .env; app profile alone; healthz/dish/move/proposal) | 6.1 oracle transcript in log.md commit ab3c779 |
| UI convergence set (Gate C) | 56 PNGs, 2 themes, desktop+narrow; converged verdict | phase5/ + self-critique.md |
| Demo GIFs (5.5) | 4 GIFs, 1.8MB total | ../../media/ (embedded in README.md) |

Benchmark seeds: RATIFIED at Gate C (all 13 incl. bench-12) → `eval/fixtures/seeds.json`.
T1 amendment: drafted (`../T1-amendment-draft.md`, SHA refreshed to the seeds
commit) — the USER logs it at milestone-02 start. PREREGISTRATION.md diff: empty.
