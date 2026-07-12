# Handoff — milestone 02b (behavior-contract)

## Next session start here
**B4 loop is RUNNING — 11 of 43 census fails green after 3 of 12 builder
runs, zero regressions.** Read `b4-ledger.md` first (cluster map, attempts,
check-change log, iteration records) — it is the loop's source of truth.
Invoke one batch at a time:
`Workflow({scriptPath: docs/02b-behavior-contract/b4-iteration.workflow.mjs,
args})` — args: worktree=/Users/hoangngo/Documents/personal-projects/
CapyCook-02b, contractPin=965c8eb…, branchBase=cb43431, previouslyGreen (11
ids, see ledger), clusters [{name, criteria, brief}] — briefs in `b4-briefs/`
(clusters 04+05 written, next up). Preflight REFUSES to run unless the
worktree's `evidence/selftest-report.json` is ok:true with no later
web/tools/oracle commits — after ANY harness edit: commit, `cd web && node
tools/oracle/oracle.mjs self-test --report <full-run report> --port 8098`,
ledger check-change entry, then loop.

## Current state
- Green (11): A-5, B-1, B-4, B-5, C-17, D-2, E-4, H-1, H-7, H-8, H-9.
  Iterations 1–3 = commits 4256505, cd422df, 8093a4f; oracle runs 001–002
  (worktree numbering); gates green throughout.
- Harness check-changes so far (all declared + self-tested): runner dedupe,
  selftest mkdir (540a5cb), recorder freshness watchdog (007123a — fixed the
  screencast stall that mis-failed BC-B-8 twice; those FAILs carry no
  strikes). Self-test after 007123a: in flight at handoff-write time —
  verify ok:true before any oracle run.
- Next: invocation 3 = cluster 4 empty-guard (A-4, A-9, C-13) + cluster 5
  typed-input preservation (A-13, C-21, C-27, E-5) — builder runs 4-5/12.
- Remaining after that: clusters 6–12 per ledger (~24 criteria + parity
  twins + I-1/I-2), then ×2 full runs (--guardrails all) for exit.

## Open concerns
- BC-B-8 must be re-verified green on post-watchdog evidence in a future run
  (expected to pass — renderer log shows the handoff happens on time).
- BC-C-11 REGENERATE wording FAIL is consistent across 3 fresh judges →
  cluster 8; check oracle selectors before renaming the verb.
- BC-E-3 judge FAIL has solid evidence (rationale identical pre/post rework)
  → cluster 10 work is real, not judge noise.
- Builder-authored tests are diff-for-review, not verification (B5 point).
- ⚖ in force: BC-C-26 (cluster 12), BC-D-12 (cluster 10, schema/wire OK).
- Stall valve: 3 strikes parks (none at 2+); cap 12 builder runs (3 used).
