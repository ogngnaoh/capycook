# Handoff — milestone 02b (behavior-contract)

## Next session start here
B2 is functionally complete pending the B3 census close-out. The census (full
oracle run, guardrails=all, parity pass) may be running or complete — check
the newest `docs/02b-behavior-contract/evidence/run-NNN/oracle-report.json`.
Remaining sequence: (1) spawn 10 fresh-context judges over the run's
`judge-manifest.json` (criterion text + stills only, no builder context),
write `judge-verdicts.json`, `oracle.mjs merge-judgments`; (2) re-run
`oracle.mjs self-test --report <census oracle-report.json>` → must exit 0
(ok:true artifact — mutation+plumbing layers already pass 25/26, only the
report-dependent layer remains); (3) post the census PASS/FAIL to the USER
(B3 is informative, non-blocking); (4) ship ritual for B2 (milestone.md, this
file, log.md — same commit). Then B4 (autonomous loop, worktree branch
`02b-behavior-contract`) starts per the spec.

## Current state
- Oracle complete at `web/tools/oracle/` (commits `74ed43e`…`e7a0ab9` on
  measure-run): 109-criterion registry (`list` exits 0, parity = snapshot),
  ~44 scenarios in 12 files, all built by fan-out builders, all critiqued by
  10 fresh-context critics (3 CRITICALs found + fixed), revised areas
  re-verified 2×.
- Self-test: plumbing 15/15 + mutations 10/10 flip. Only the known-broken
  layer awaits the census report. `bin/capycook` is current (make build-all).
- Stub fixtures (Go, committed): peanut / rare chicken / saffron (see the
  fail-closed caveat in stub.go) / moonshot / spring clean (3-op diff) +
  stub-mode budget metering (BC-H-4 UI-proven: budget banner + Try again).
- **NINE unmarked genuine defects logged** in b2-oracle-plan.md "Pre-census
  findings" (A-14, B-1 visibility, B-5 focus, C-16 changed-step, C-17,
  G-12@320, G-13 borders, G-14 ×2 offenders) — each root-caused to file:line.
  All ~27 contract-marked FAILS-TODAY reproduce.
- Guardrails green throughout; operator DB still exactly 6; contract pin
  byte-intact; PREREGISTRATION untouched (baseline = 02b pin, NOT 32afe54 —
  amendments 2/3 predate 02b legitimately).

## Open concerns
- Evidence dirs are gitignored; the FINAL run gets un-ignored at B5 only.
- oracle.mjs still carries its own runScenario copy (lib/run.mjs is the
  self-test's); dedupe AFTER the census, never mid-run.
- Judge pass must stay fresh-context: manifest text + stills only.
- run-NNN numbering is shared across ports; builders' runs interleave — the
  census run is whichever report says `"full": true`.
