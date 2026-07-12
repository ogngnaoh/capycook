# Handoff — milestone 02b (behavior-contract)

## Next session start here
**B4 is PAUSED at the ratified 12-builder-run cap — 41 of 43 census fails
green; checkpoint report + proposed ruling in log.md awaits the USER.** Do
not launch builder runs before the ruling. Ruling options on the table:
(a) grant +2 runs (G-10 round 2 with the oracle's 25-pair failing list in
the brief; A-12 only if the scenario audit confirms a product gap),
(b) park G-10's remainder with a documented exception list, (c) stop and
take the checkpoint to B5 as-is. LEAD work sanctioned regardless of ruling
(harness, self-test re-proof each): fix the recorder wedge behind B-8's
intermittent false-FAILs (lower everyNthFrame — ~30fps requested, 5fps
persisted, flood outruns acks), investigate G-6's missing 390px evidence
states (2 of 4 stills never captured), audit A-12's poll-based
sawDisabled sampling under instant creates.

## Current state
- 41/43 green across runs 001–012 (worktree evidence): all of areas A/B/E/H,
  C complete, D complete, F-3, G-4/12/13/14, I-2 (founding finding), both ⚖
  criteria (C-26, D-12). Remaining red: G-10 (25/98 pairs, strike 1), A-12
  (visibly-disabled clause only, strike 1, possibly harness).
- 12 builder commits (4256505 → 9633d5f) + harness fixes (007123a runner
  watchdog, 23246b4 + 55473e8 + a-intake settles scenario adaptations), all
  declared in the ledger check-change log with self-test re-proof (27/27
  each time, latest @ 03aed61).
- Judges on latest evidence: A-8, B-2, C-11, D-7, E-3, G-3, I-2 PASS; B-8
  and G-6 FAIL on evidence artifacts (lead harness queue above).
- After ruling + harness queue: ×2 consecutive FULL runs (no --only,
  --guardrails all, judges merged) → B5 (USER approval, GIF re-check,
  un-gitignore final evidence, merge → measure-run).

## Open concerns
- The ×2 full runs re-judge all 10 judge criteria with fresh panels and run
  all parity twins — judge variance and evidence artifacts are the exit
  risks; the harness queue above addresses the known artifact sources.
- Operator DB must still show exactly 6 operator events at exit; run-073 +
  selftest artifacts in the MAIN checkout must survive to B5.
- Builder-authored tests are diff-for-review, not verification (B5 point).
