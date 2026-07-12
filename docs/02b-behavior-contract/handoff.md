# Handoff — milestone 02b (behavior-contract)

## Next session start here
**B4 loop — 32 of 43 census fails green, 11 of 12 builder runs used, zero
product regressions across 11 oracle runs.** Read `b4-ledger.md` first.
Next: **invocation 7** = clusters 11+12 COMBINED as the LAST budgeted
builder run (run 12; brief `b4-briefs/cluster-11-12.md`): G-10 token
contrast (design bar — warm register, not gray), G-13 border 3:1, G-12
320px reflow, G-14 sticky-chrome focus, C-26 ⚖ disclaimer, A-12 create
dedup, A-8 seed-CTA fold. Wait for the self-test artifact (re-running after
a-intake's 2400ms still-settle bump) to be ok:true before invoking.
previouslyGreen = 32 ids (ledger). After run 12: **×2 consecutive FULL runs
(no --only, --guardrails all, judges merged)** for the exit; expect the
first full run to surface stale-scenario stragglers (class has bitten 3×) —
adjudicate, fix harness, self-test, repeat. Then B5: USER approval gate,
GIF re-check, un-gitignore the final run's evidence, merge → measure-run.

## Current state
- Green (32 of 43): everything except A-12, C-26, G-10, G-12, G-13, G-14
  (invocation 7) + twins/I-1 (parity at full runs). All judges healthy on
  latest evidence: I-2 (founding finding), B-8, B-2, C-11, D-7, E-3, G-3
  PASS; A-8 blocked only by the seed-still artifact (settle bumped) + the
  CTA-fold product fix (in invocation 7's brief).
- Loop mechanics: per-invocation Workflow on Sonnet agents
  ({scriptPath: b4-iteration.workflow.mjs, args}); preflight refuses
  without ok:true selftest at the current harness commit; briefs in
  b4-briefs/; evidence in worktree runs 001-011.
- D-12 shipped an ADDITIVE migration (legacy-DB regression test) + Origin
  field; streaming shipped MoveRequest.OnDraft (real-DeepSeek can implement
  the same hook in phase 3).
- Budget: run 12 is the LAST before the cap → any still-failing criterion
  after it triggers the checkpoint report to USER (by design; strikes:
  nothing ≥2 open).

## Open concerns
- The ×2 full runs re-judge ALL 10 judge criteria with fresh panels — judge
  variance is the main exit risk (D-7 and C-11 each failed one stricter
  panel before their de-risks); evidence-freshness artifacts are the second
  (watchdog + settle fixes in place).
- G-10 token changes ripple across every judged screenshot — if a judge
  balks at the new tones at exit, that's a design-register adjudication for
  the lead, possibly the USER.
- Builder-authored tests are diff-for-review, not verification (B5 point;
  also B2's cmd/server/main_test.go LLMBudgetUSD:10 edit).
- Operator DB must still show exactly 6 operator events at exit; run-073 +
  selftest artifacts in the MAIN checkout must survive to B5.
