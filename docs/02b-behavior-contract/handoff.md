# Handoff — milestone 02b (behavior-contract)

## Next session start here
B4: the autonomous fix→judge loop. Worktree branch `02b-behavior-contract` off
`measure-run`; docs/log/handoff updates land on measure-run, never die in the
worktree. Inputs: census `evidence/run-073/oracle-report.json` (79/43/1,
judges merged) + the 10 root-caused genuine defects and ~27 marked fails in
`b2-oracle-plan.md` "Pre-census findings" (every one has file:line). Loop
protocol (spec + milestone.md): builder fixes the highest-value failing
cluster → guardrails (freeze diff vs 32afe54, pin, PREREGISTRATION, suites)
→ oracle re-run (`--only` for the inner loop, FULL runs for the ×2 all-green
exit) → fresh judges per iteration; 3-strike parking per criterion, hard cap
12 iterations, progress persisted here EVERY iteration. B4 must refuse to
trust runs unless `evidence/selftest-report.json` is ok:true for the current
harness commit — re-run `oracle.mjs self-test --report <full run>` after any
harness edit (builders who change selectors must update the oracle in the
same iteration). High-leverage first clusters: the attention-at-dispatch trio
(A-5 focus, B-1 off-viewport mount, B-5 cancel focus — likely one fix), the
Workbench.tsx:535 pair (C-17 + D-2), the role/live-region quartet (H-1/7/8/9).

## Current state
- B2 + B3 SHIPPED on measure-run (commits `74ed43e`…`924e651`+ship). Oracle:
  `web/tools/oracle/` — 109 criteria, ~44 scenarios, self-test 27/27
  (10 mutation flips), `list` verifies registry↔contract + parity=snapshot.
- Census run-073 (full, guardrails all green, suites pass): 79 pass / 43 fail
  / 1 parked (BC-J-6 B5-only). Every fail explained: 27 contract-marked, 10
  unmarked genuine (9 assert + judged E-3), G-4 via B-3, I-1 meta + 4 parity
  twins of failing criteria. Judges: 7 PASS / 2 FAIL (I-2 the founding
  finding; E-3 new).
- Contract pin byte-intact; PREREGISTRATION untouched (baseline = 02b pin);
  operator DB exactly 6 events; bin/capycook current.

## Open concerns
- Evidence dirs gitignored — the FINAL all-green run gets un-ignored at B5;
  run-073 + selftest artifact must survive until then (don't clean evidence/).
- oracle.mjs still duplicates lib/run.mjs's runScenario — dedupe is safe
  housekeeping for B4's first iteration, never mid-run.
- Review-flagged at B5: cmd/server/main_test.go LLMBudgetUSD:10 fixture edit;
  all Stage-2/-3 tests written by the same effort that wrote the code.
- BC-C-26/BC-D-12 (⚖ ratified in force) are loop work: in-app disclaimer +
  persisted move rationale (schema/wire change allowed, frozen paths never).
