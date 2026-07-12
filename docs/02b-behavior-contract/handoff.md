# Handoff — milestone 02b (behavior-contract)

## Next session start here
**USER ruled at the B4 checkpoint (2026-07-12): +2 builder runs granted;
lead harness queue sanctioned.** 41/43 green. FIRST, verify the lead
finding that likely makes the builder runs unnecessary: all 25 remaining
BC-G-10 pairs are light-theme-only with effective opacity 0.45–0.66 on
freshly-mounted nodes (pair list: `b4-briefs/g10-round2-pairs.json`) — the
g/desktop-modes contrast walker samples light DURING the cc-rise entrance
animation (~300ms opacity 0→1); dark, walked after the theme toggle, is
clean. Fix = walker settle-wait (wait animations/opacity to finish before
walking each screen), then the SAME instant-sampling audit for BC-A-12's
`sawDisabled:false, samples:1` (poll likely misses the aria-disabled beat
under instant creates — consider an armMoment-style mutation observer).
Harness queue also holds: recorder wedge behind B-8's intermittent
false-FAILs (everyNthFrame:2 ≈30fps requested vs 5fps persisted — lower
the request rate in lib/record.mjs) and G-6's missing 390px evidence
states (2 of 4 stills never captured — g-viewports journey breaks midway).
EVERY harness edit: commit → `cd web && node tools/oracle/oracle.mjs
self-test --report <main checkout run-073 report> --port 8098` → ok:true →
ledger check-change entry. Then re-run targeted oracle for G-10 + A-12
(previouslyGreen = 36 ids, ledger); spend builder runs ONLY if a real
product gap survives the audits. Then **×2 consecutive FULL runs
(no --only, --guardrails all, judges merged)** → B5.

## Current state
- Worktree `../CapyCook-02b` @ `02b-behavior-contract`, HEAD past `4831ca1`;
  main checkout untouched on measure-run. Loop docs: `b4-ledger.md` (source
  of truth), briefs in `b4-briefs/`, rulings in `log.md`.
- 41/43 census fails green (runs 001–012); red: G-10 (25 pairs, artifact
  hypothesis above), A-12 (one clause, same class). Judges: A-8, B-2, C-11,
  D-7, E-3, G-3, I-2 (founding finding) PASS; B-8/G-6 fail on evidence
  artifacts (queue above). Both ⚖ criteria shipped (C-26, D-12).
- Workflow: `{scriptPath: docs/02b-behavior-contract/
  b4-iteration.workflow.mjs, args}` on Sonnet agents; preflight refuses
  without ok:true selftest at the current harness commit (latest 27/27 @
  03aed61; STALE after any new harness edit — re-run).

## Open concerns
- Exit full runs re-judge all 10 judge criteria + parity twins (C-10@,
  C-13@, C-16@, F-3@) + I-1 — judge variance and evidence artifacts are the
  exit risks; the harness queue addresses the known artifact sources.
- Operator DB must show exactly 6 operator events at exit; run-073 +
  selftest artifacts in the MAIN checkout evidence dir must survive to B5.
- Builder-authored tests are diff-for-review, not verification — B5 review
  point (ditto B2's cmd/server/main_test.go LLMBudgetUSD:10 edit).
