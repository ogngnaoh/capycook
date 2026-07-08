# Milestone 01 — End-to-End Build

**Goal:** Build the complete CapyCook v0→v2 system in one phased, autonomously-run
unit on verification rails: skeleton → data + deterministic services + safety gate →
real DeepSeek → eval harness → styled UI + demo materials — ending at "everything the
human measurement campaign needs, ready to execute," never the measurement itself.

Governing spec: `docs/superpowers/specs/2026-07-06-end-to-end-build-design.md`.
Behavior/invariants: `DESIGN.md` v0.4. Frozen methodology: `docs/PREREGISTRATION.md`
(READ-ONLY, body and §9 log).

## Scope

- Six phases on branch `e2e`, TDD per subsystem, commit per subsystem, tag per phase.
- Four human gates: (A) safety rules + vendored data, (B) real-API enablement,
  (C) visuals/demo + benchmark-seed ratification, (D) master merge.
- DeepSeek spend cap $10 (`LLM_BUDGET_USD`), code-enforced; no live calls before Gate B.

## Non-goals

Spec §9: no hosted deployment, no human labeling/operator telemetry/counted eval runs
(milestone 02), no FoodPuzzle proxy (deferred at T1), no live retrieval / branch-compare
UI / sandbox / explainer (milestone 03), no auth/multi-user, no KitcheNette, no NHSTs.

## Slices (the six phases)

Working doc for all phases: `docs/superpowers/plans/2026-07-06-end-to-end-build.md`
(live per-task checklist — the resumption state).

| # | Phase | Status |
|---|---|---|
| 1 | Skeleton (absorbed skeleton spec §3–§6 + spec §4 contracts) | shipped |
| 2 | Data + deterministic services + safety gate → **Gate A** | shipped (Gate A cleared 2026-07-07) |
| 3 | Real DeepSeek + telemetry → **Gate B** | shipped (Gate B cleared 2026-07-07) |
| 4 | Eval harness (stop-line: unlabeled, labeling-ready outputs) | shipped |
| 5 | Styled UI + demo materials → **Gate C** | shipped (Gate C cleared 2026-07-07: redirect converged, seeds ratified; tag phase-5-ui) |
| 6 | Fork kit + hand-back → **Gate D** (no auto-merge) | in-progress |

## Integration notes

- Pinned domain contracts (Draft/Proposal/LLM/Grounding/Services/EventLog types, HTTP
  API, SSE protocol, env keys) live in the working doc's "Pinned contracts" section —
  single source for every task; they implement spec §4.
- Existing touchpoints: `cmd/server/main.go` (wiring), `internal/config`,
  `web/embed.go` (SPA serving), `web/src/components/{ProposalCard,GateBar,Workbench,DraftPane,SteeringPane}`
  (kept + extended). Old stub endpoints `GET /api/proposal` / `POST /api/gate` +
  `cmd/server/api.go` are deleted in Phase 1 task 1.8.
- Synthetic eval fixtures live only in `internal/eval/testdata/`; `eval/fixtures/`
  receives benchmark seeds only after Gate C ratification.

## Exit criteria

- Every phase oracle in spec §3 green (suites, e2e script local + container,
  eval dry-run table, compose-up-from-clean-checkout).
- Evidence assembled under `docs/01-end-to-end/evidence/`; deviations/deferrals
  reported; T1 amendment text drafted (not logged); handoff.md overwritten.
- Gate D: user reviews outcome and merges `e2e` → master. Never auto-merged.
