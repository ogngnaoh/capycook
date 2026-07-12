# Handoff — milestone 02b (behavior-contract)

## Next session start here
**B4 loop is RUNNING.** Read `b4-ledger.md` first (cluster map, attempts,
check-change log, iteration records) — it is the loop's source of truth. The
loop runs in the persistent worktree `../CapyCook-02b` on branch
`02b-behavior-contract`; one Workflow invocation per batch via
`{scriptPath: docs/02b-behavior-contract/b4-iteration.workflow.mjs, args}`
(args: worktree, contractPin, branchBase=cb43431, previouslyGreen, clusters
[{name, criteria, brief}] — briefs live in `b4-briefs/`). Preflight REFUSES
to run unless `evidence/selftest-report.json` (worktree) is ok:true at a
commit with no later web/tools/oracle changes — after ANY harness edit:
commit it, `cd web && node tools/oracle/oracle.mjs self-test --report
<full-run oracle-report.json> --port 8098`, log it in the ledger's
check-change section, then resume the loop.

## Current state
- Iteration 0: runner dedupe + selftest mkdir fix (both declared); self-test
  27/27 ok:true @ 540a5cb.
- Iteration 1 (builder run 1/12, commit 4256505): cluster 1 → **B-1, B-5,
  C-17, D-2 GREEN** (oracle run-001, worktree numbering); A-5 attempt 1
  failed its focus-timing clause — cause + fix shape adjudicated in
  `b4-briefs/cluster-02.md`. Gate fully green; no regressions.
- In flight: invocation 2 = cluster 2 (A-5 retry, B-4, E-4) + cluster 3
  (H-1/7/8/9) — builder runs 2-3 of 12.
- previouslyGreen: BC-B-1, BC-B-5, BC-C-17, BC-D-2 (cumulative --only set).
- Census baseline run-073 (79/43/1) + ok:true selftest artifact live in the
  MAIN checkout's evidence dir — read-only, must survive to B5.

## Open concerns
- BC-B-8 judge FAIL with evidenceSuspect (run-001): screencast window ended
  pre-proposal-ready — capture artifact, no strike; investigate if repeated.
- BC-C-11 fresh-judge FAIL on "REGENERATE" wording (passed census) → folded
  into cluster 8; verify oracle selectors don't match the verb text first.
- Builder-authored tests are part of the reviewed diff, not verification
  (B5 review point; ditto B2's cmd/server/main_test.go LLMBudgetUSD:10 edit).
- ⚖ in force: BC-C-26 (cluster 12), BC-D-12 (cluster 10, schema/wire OK).
- Stall valve: 3 strikes parks (A-5 at 1); hard cap 12 builder runs (1 used);
  parks/conflicts → evidence report + proposed ruling in log.md, USER rules.
