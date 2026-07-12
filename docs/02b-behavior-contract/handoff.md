# Handoff — milestone 02b (behavior-contract)

## Next session start here
**B4 loop RUNNING on Sonnet workflow agents — 18 of 43 census fails green,
5 of 12 builder runs used, zero regressions ever.** Read `b4-ledger.md`
first (source of truth). In flight / next: **invocation 4** = cluster 6
first-pass+suggestions (A-3, A-14) + cluster 8 gate semantics (C-10, C-20,
C-22, C-28 + C-11 wording) — builder runs 6-7. Invoke via
`Workflow({scriptPath: docs/02b-behavior-contract/b4-iteration.workflow.mjs,
args})`; args: worktree=/Users/hoangngo/Documents/personal-projects/
CapyCook-02b, contractPin=965c8eb…, branchBase=cb43431, previouslyGreen (18
ids, ledger), clusters with briefs from `b4-briefs/` (06 + 08 written).
Preflight refuses unless worktree `evidence/selftest-report.json` is ok:true
with no later web/tools/oracle commits (ok:true @ 007123a — still valid).

## Current state
- Green (18): A-4, A-5, A-9, A-13, B-1, B-4, B-5, C-13, C-17, C-21, C-27,
  D-2, E-4, E-5, H-1/7/8/9 + (B-8 restored to passing, see below). Commits:
  4256505, cd422df, 8093a4f, 89a5046, 24e6576 (verified by 3b audit +
  run-005). Oracle runs 001–005; gates green throughout.
- **B-8 PASSED run-005 on fresh evidence** — run-004's post-watchdog FAIL
  was residual capture flake. Stays folded in cluster 7 (streaming removes
  the end-of-generation flood that triggers the flake); must hold ×2 at exit.
- C-11 REGENERATE wording: 4 consecutive fresh-judge FAILs → folded into
  cluster 8; label rename is selector-safe (oracle uses data-verb attrs).
  Faint-gray label contrast belongs to cluster 11, not 8.
- Remaining clusters: 6 + 8 (invocation 4) · 7 streaming (B-3, G-4, B-10,
  I-2, B-8) — big Go+web, add recorder freshness logging when prepping it
  (harness edit → self-test re-run) · 9 diff repertoire + stub extension ·
  10 D-12 ⚖ + F-3 + E-3 · 11 contrast tokens · 12 viewport + C-26 ⚖.
  Then ×2 full runs (--guardrails all) for exit.

## Open concerns
- Builder runs 6-12 must cover 7 clusters — zero-retry budget to stay under
  the cap; a retry pushes past 12 → checkpoint report to USER (by design).
- BC-E-3 judge FAIL evidence solid → cluster 10 real work (stub rework
  template must visibly link tasting feedback → WHY IT WORKS rationale).
- Builder-authored tests are diff-for-review, not verification (B5 point).
- ⚖ in force: BC-C-26 (cluster 12), BC-D-12 (cluster 10, schema/wire OK).
- Stall valve: 3 strikes parks (none ≥2 open); operator DB must still show
  exactly 6 operator events at exit.
