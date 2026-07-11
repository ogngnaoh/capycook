# Handoff — milestone 02b (behavior-contract)

## Next session start here
**Craft and run B4 as a Workflow** — the USER explicitly opted in
(2026-07-11: "craft a workflow there") to running the autonomous fix→judge
loop via the Workflow tool, one invocation per iteration (not one mega-script),
with the session lead between invocations. Author the per-iteration script:
(1) builder agent, worktree-isolated (`isolation: 'worktree'`, branch
`02b-behavior-contract` off measure-run), fixes ONE failing cluster;
(2) guardrail gate (freeze diff vs 32afe54 on the 7 frozen paths, contract
pin, PREREGISTRATION, `make test`/`vet`/`tsc`/`vitest`) — abort on violation;
(3) targeted oracle re-run (`node tools/oracle/oracle.mjs run --only <ids>
--port 8098`, run from web/); (4) fresh-context judge panel via
`agent(judgeBrief, {schema: {verdict, reason}})` per affected judge criterion
— schema-validated returns, no mailbox collection (B2's judge phase wasted
many turns on that). Between invocations the LEAD does: cluster selection,
deviation adjudication, oracle updates when a fix legitimately changes
selectors (same-iteration, then re-run `oracle.mjs self-test --report <full
run>` — B4 must refuse runs without an ok:true artifact for the current
harness commit), attempt/parking ledger (3 strikes parks; hard cap 12
iterations), and rewriting THIS file every iteration. Full runs (no --only)
only for the ×2 all-green exit. First clusters, highest leverage per census:
(a) attention-at-dispatch trio — BC-A-5 focus, BC-B-1 off-viewport mount,
BC-B-5 cancel focus (likely one fix); (b) Workbench.tsx:535 pair — BC-C-17 +
BC-D-2; (c) role/live-region quartet — BC-H-1/7/8/9.

## Current state
- B2 + B3 SHIPPED on measure-run (through `f074e83`). Oracle:
  `web/tools/oracle/` — 109 criteria, ~44 scenarios, self-test 27/27 with
  10/10 mutation flips; `oracle.mjs list` verifies registry↔contract +
  parity=snapshot. bin/capycook current (make build-all).
- Census run-073 (full, guardrails + suites green, judges merged): **79 pass /
  43 fail / 1 parked** over 123 rows; every fail explained — 27
  contract-marked + 10 unmarked genuine defects (file:line root causes in
  `b2-oracle-plan.md` "Pre-census findings") + G-4-via-B-3, I-1 meta, 4
  parity twins. Judges 7 PASS / 2 FAIL (I-2 founding finding, E-3 new).
- Contract pin `965c8eb` byte-intact; PREREGISTRATION untouched (baseline =
  02b pin, NOT 32afe54); operator DB exactly 6 events; all oracle ports swept.

## Open concerns
- Evidence dirs gitignored — run-073 + `evidence/selftest-report.json` must
  survive to B5 (final all-green run gets un-ignored then). Don't clean.
- oracle.mjs duplicates lib/run.mjs's runScenario — safe first-iteration
  housekeeping, never mid-run.
- B5 review-flagged: cmd/server/main_test.go LLMBudgetUSD:10 fixture edit;
  harness tests written by the harness's own author-effort.
- ⚖-in-force loop work: BC-C-26 in-app disclaimer; BC-D-12 persisted move
  rationale (schema/wire change allowed, frozen paths never).
- Stall valve: criteria conflicts or 3-strike parks → stop, evidence report +
  proposed ruling to USER in log.md; loop resumes after ruling.
