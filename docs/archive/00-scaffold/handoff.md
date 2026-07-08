# Milestone 00 (scaffold) — Handoff

_Overwrite each session. Last updated: 2026-07-06._

## Next session start here (literal first action)
1. Execute the **end-to-end build goal prompt**:
   `docs/superpowers/specs/2026-07-06-end-to-end-build-design.md` §10, on branch
   `e2e` (never master). That spec supersedes the old S0.2/S0.3 next-steps that
   previously lived here.
2. Human prep before Gate B: `DEEPSEEK_API_KEY` + `LANGFUSE_*` keys ready for `.env`
   ($10 spend cap, code-enforced).

## Current state
- Milestone 00 **shipped (rescoped 2026-07-06)**: S0.1 repo-scaffold + S0.4 walking
  skeleton shipped; S0.2/S0.3 re-homed into milestone 01 (see `docs/milestones.md`).
- master: graybox workbench served by the Go binary (native + container);
  `make build/run/test` green; no domain logic; stub `GET /api/proposal` +
  `POST /api/gate` still present (deleted in milestone 01 phase 1).
- Implementation plan (working doc for the build): see `docs/superpowers/plans/`
  (2026-07-06 end-to-end build plan).

## Active concerns
- `PREREGISTRATION.md` is frozen — body AND amendment log are read-only for the
  builder; any conflict stops the build and hands back.
- Never fabricate labels/telemetry; the eval stop-line is unlabeled, labeling-ready
  outputs (spec §3 hard rails).
- Second labeler still needed for Cohen's κ (milestone 02, human-led).
