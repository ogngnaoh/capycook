# Handoff — milestone 02b (behavior-contract) — SHIPPED 2026-07-13

## Next session start here
**02b is COMPLETE and merged to `measure-run` (local, UNPUSHED — D7 holds).
Resume milestone 02 → S8 publish** (`docs/02-measure-run/`). Two things gate S8,
in order:
1. **GIF re-check (deferred from B5, do FIRST at S8).** B4 changed 3 README
   scenes: **01-develop-loop** (auto-first-pass + streaming rationale),
   **04-post-cook-rework** (BC-E-3 feedback echo now shows in the rework
   rationale), **07-midstream-cancel** (streaming working state). The demo rig
   `web/tools/demo.mjs` was NOT updated during B4 — **scene 01's `seedToTrial1`
   manually types an intent and dispatches after "Develop this dish", but
   BC-A-3 auto-first-pass now auto-proposes on create, so that flow breaks**
   (the intent bar isn't present at the gate). Fix scene 01's create flow
   (create → accept the auto-proposal → Trial 1; drop the manual dispatch),
   verify 04/07 still run, re-encode to spec (≤15s · 800px · 15fps · <5MB),
   and eyeball framing for the D-7 stub "(brightened per feedback)" clutter and
   the 0-kcal first-proposal flash. `09-eval-run` (separate `eval-run.tape`)
   stays untouched. Scenes 02/05/06/08 are only subtle color-token/badge shifts;
   03 unchanged — re-capture only if you want pixel-current.
2. **S8 proper** (per `docs/02-measure-run/handoff.md`): optional H2 operator
   sessions to the ~8 floor (USER calls it), then `go run ./cmd/eval replay` →
   README H2 table, then the exit-criteria audit → **USER gate**: merge
   `measure-run` → master (no-ff) + **push** (D7's one public debut) → tag
   `v0.2-measure-run` → `gh repo edit` + settings + portfolio linkage.

## Current state
- **02b merged into `measure-run`** (no-ff merge commit; branch ref
  `02b-behavior-contract` @ its B5-ship commit; worktree `../CapyCook-02b`
  still exists). `measure-run` is **unpushed**.
- B1–B5 all shipped. B4: all 43 census reds + 5 exit-run regressions fixed;
  113/0 asserts across four clean full runs (run-027/030/034/036). B5: USER
  accepted the evidence after an independent fresh-session runtime verification
  (PASS), waiving the 3 judge-evidence artifacts (BC-B-8/I-2 capture variance,
  D-7 stub clutter — none a product defect). Full loop record: `b4-ledger.md`;
  narrative: `log.md`.
- Guardrails at merge: freeze diff vs `32afe54` empty · contract pin `965c8eb`
  byte-intact · PREREGISTRATION untouched since `cb43431` · **operator DB still
  6/1307** · go vet/test green · tsc clean · vitest 273/273.

## Open concerns
- **Worktree-drift / evidence preservation.** The raw B5 evidence
  (`evidence/run-027|030|034|036/`, `selftest-report.json`) is **gitignored** and
  lives ONLY in the `../CapyCook-02b` worktree — it did NOT travel with the merge.
  Do not remove the worktree until you've decided whether to preserve that
  evidence (commit un-ignored, or copy out). The committed `b4-ledger.md` +
  `log.md` already carry the decisive summary.
- **GIF rig fix is real work**, not a re-record — see start-here item 1. Budget
  for a `demo.mjs` patch + per-scene verification before S8.
- **02b folder not archived.** Convention archives shipped-milestone folders to
  `docs/archive/`; deferred here because S8 + the GIF work still reference this
  handoff and the in-place evidence. Archive at the milestone-02 ship (and move
  the gitignored evidence deliberately — `git mv` won't).
- The B4 tests/harness were written by the B4 sessions' own author-effort
  (review-flagged, e.g. `cmd/server/main_test.go` LLMBudgetUSD fixture,
  `hub_test.go`, `orchestrator_test.go`). Green suites are merge hygiene; the
  real verification of record is the independent runtime drive (see `log.md`
  2026-07-13) + the USER's B5 approval — not the self-written tests.
