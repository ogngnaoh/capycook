# Milestone 00 (scaffold) — Handoff

_Overwrite each session. Last updated: 2026-07-01._

## Load at session start
- `DESIGN.md` (v0.4), `docs/SPEC.md`, `docs/PREREGISTRATION.md` (frozen).
- `docs/00-scaffold/milestone.md` + this handoff.

## Completed this session
- **Slice S0.1 shipped** — compiling Go skeleton matching SPEC §6: `cmd/server`
  (`/healthz` + graceful shutdown), `internal/config` (env loader, TDD), eleven
  `internal/*` doc.go stubs, Makefile, Dockerfile skeleton (`docker build` +
  container `/healthz` verified), placeholder `web/`·`data/`·`eval/fixtures/`,
  project `CLAUDE.md`, and the milestone/slice doc structure. Design + plan under
  `docs/superpowers/`. Built on branch `s0.1-scaffold`.

## Slice status across milestone
- S0.1 repo-scaffold → **shipped**
- S0.2 eval-harness-shell (store · eventlog · eval shell · telemetry) → planned
- S0.3 data-vendoring (FlavorGraph · USDA/FoodOn · fixtures) → planned

## Current state
- `make build/run/test` green; `GET /healthz` → 200 (native + container). No domain
  logic, no DeepSeek/Langfuse calls yet. Go 1.26.4 via Homebrew (`/opt/homebrew/bin`).

## Next session start here (literal first action)
1. **Slice S0.2** — implement `store` (modernc sqlite behind interface), the
   append-only `eventlog`, the `eval` shell (3-arm empty baseline + replay), and
   `telemetry` (OTel→OTLP→Langfuse). Exit: 3-arm harness runs an empty baseline;
   tracing emits one replayable event (DESIGN §15 v0 exit criterion).
2. **⚠ Before any DeepSeek code (milestone 01):** re-verify API specifics against
   live `api-docs.deepseek.com` (SPEC §4c).

## Active concerns
- PREREGISTRATION is frozen — amendments via its §9 log only.
- Second labeler still needed for Cohen's κ (PREREGISTRATION §6).
- Scope discipline: R1/R2 stay P1+; v0 = one deep loop + eval harness.
- Slice S0.1 built on branch `s0.1-scaffold` — merge to `master` at ship (see
  finishing-a-development-branch step).
