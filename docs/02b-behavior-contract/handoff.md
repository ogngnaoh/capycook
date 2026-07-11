# Handoff — milestone 02b (behavior-contract)

## Next session start here
B2 is mid-flight; the plan+record is `b2-oracle-plan.md` (checklist there is
current). Stages 0–2 SHIPPED on measure-run: oracle spine (`web/tools/oracle/`,
`oracle.mjs list` verifies 109 ids + parity derivation), area-A pattern-setter
(verified vs live app, run-002), Go extensions (stub fixtures peanut/rare
chicken/saffron/moonshot + stub-mode budget meter — BC-H-4 reachable, curl-
proven; one review-flagged test edit in cmd/server/main_test.go). Stage 3 is
RUNNING: ten parallel builder subagents, one scenario file each (ports
8110–8119), brief + reports in the session scratchpad (stage3-*-report.md).
When they land: integrate (registry additions for any new scenario ids, dedupe
oracle.mjs's runScenario into lib/run.mjs), commit per area, then Stage 4
fresh-context critics, then Stage 5 (`oracle.mjs self-test` — node layers
already pass; mutation layer needs the scenario files), then B3 census.

## Current state
- Contract RATIFIED + pinned `965c8eb` (byte-verified this session). Freeze
  diff empty. Operator DB baseline 6 ✓. `.gitignore` now excludes
  `docs/02b-behavior-contract/evidence/`.
- Area A census preview: the 6 marked FAILS-TODAY criteria fail as predicted;
  **BC-A-14 fails unmarked** (genuine defect — suggested-next chips never
  render when proposal-ready races the POST response; Workbench.tsx:151 only
  sets suggestions in the SSE handler). Recorded in b2-oracle-plan.md.
- BC-J-4's baseline is the 02b pin (NOT 32afe54 — user-pasted §9 amendments
  2/3 landed between; guardrails.mjs documents this).
- Branch measure-run, commits through `1ee610a`. bin/capycook freshly built
  with current UI (make build-all).

## Open concerns
- Ten builder subagents may still be running — check scratchpad reports before
  assuming completion; their scenario files are UNCOMMITTED until integrated.
  Never `git add web/tools/oracle` wholesale while builders run.
- Judge pass (10 criteria) happens at B3 via fresh-context subagents reading
  `judge-manifest.json` (verbatim contract text + stills only).
- Full census wall-clock ≈ 30–40 min (I-1 parity dominates); census runs with
  `--guardrails all`.
- Oracle must never touch `data/capycook.db` (tmpdir guard enforces).
