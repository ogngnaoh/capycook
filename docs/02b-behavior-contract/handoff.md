# Handoff — milestone 02b (behavior-contract)

## Next session start here
**B4 loop RUNNING on Sonnet workflow agents — 23 of 43 census fails green,
7 of 12 builder runs used, no product regressions ever (two apparent ones
were stale scenarios, fixed in 23246b4).** Read `b4-ledger.md` first (source
of truth). Next: **invocation 5** = A-14 retry (brief
`b4-briefs/cluster-06b-a14-retry.md`, optimistic proposing at dispatch —
run 8) + cluster 7 streaming rationale (brief `cluster-07.md` — run 9, the
founding finding: hub.go post-completion replay → live tokens during
generation + B-10 live-region intermediates). Wait for the self-test
artifact (re-running at handoff-write time after 23246b4's scenario edits)
to be ok:true at HEAD's harness commit before invoking. Invoke via
`Workflow({scriptPath: docs/02b-behavior-contract/b4-iteration.workflow.mjs,
args})` — previouslyGreen = 23 ids (ledger).

## Current state
- Green (23): A-3, A-4, A-5, A-9, A-13, B-1, B-4, B-5, C-10, C-13, C-17,
  C-20, C-21, C-22, C-27, C-28, D-2, E-4, E-5, H-1/7/8/9. Open: A-14
  (attempt 1 — one clause), clusters 7, 9, 10, 11, 12. Commits: 4256505,
  cd422df, 8093a4f, 89a5046, 24e6576, c0835af, 06e4c00 (+ harness 007123a,
  23246b4). Oracle runs 001–007.
- C-11 (judge, drift risk not census fail) PASSES post-REGENERATE-rename;
  B-8 holding PASS since the recorder watchdog. B-2 failed once (run-006)
  then passed — watch.
- Budget: runs 8-12 must cover A-14 retry + clusters 7, 9, 10, 11+12
  (11+12 planned as ONE combined builder run) — zero-retry margin; any
  retry → checkpoint report to USER at cap (by design).

## Open concerns
- A-8 judge: evidence artifacts fixed, but run-007's judge also flagged the
  seed CTA at the viewport fold — if A-8 fails again on clean evidence,
  that's real product work (fold into cluster 12).
- BC-E-3 (judge) needs the rework rationale to visibly reference tasting
  feedback — cluster 10, stub template work included.
- Builder-authored tests are diff-for-review, not verification (B5 point).
- ⚖ in force: BC-C-26 (cluster 12), BC-D-12 (cluster 10, schema/wire OK).
- Operator DB must still show exactly 6 operator events at exit; evidence
  runs live only in the worktree (main checkout untouched).
