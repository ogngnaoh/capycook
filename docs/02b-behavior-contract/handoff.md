# Handoff — milestone 02b (behavior-contract)

## Next session start here
**B4 loop is COMPLETE and checkpointed to B5 (USER ruling 2026-07-13).** The
product is thoroughly verified; the ratified ×2-all-green-judges exit criterion
was NOT mechanically met (irreducible fresh-context judge variance on two
motion/transition criteria), so it goes to **B5's USER-approval gate** — the
human verification gate — for adjudication. Do this first next session:
1. **USER reviews the assembled evidence** (this session cannot self-verify — it
   edited the checks/capture): 113/0 asserts across four clean full runs
   (run-027, run-030, run-034, run-036) + `run-036/oracle-report.json` merged
   judges (6/9) + `run-036/judge/*` stills. Every INDIVIDUAL UI state judged
   correct; the 3 judge fails are documented evidence artifacts (see b4-ledger.md
   "Exit runs … → USER checkpoint").
2. **USER decides** one of: (a) accept the evidence, waive the flaky transition
   judges (B-8/I-2) + the D-7 stub-clutter for B5, proceed to GIF re-check +
   merge; OR (b) require a capture/judge rework first — the concrete next fixes
   are: **D-7** = stop `internal/llm/stub.go:267` accumulating " (brightened per
   feedback)" (return a distinct concept per iterate_feedback; stub is NOT
   frozen); **B-8/I-2** = capture the working→gate transition via a rapid DIRECT
   `judgeShot` burst across the resolve window (the CDP screencast wedges/jumps at
   the handoff — a before/after pair does not satisfy the strict judge).
3. If (a): **B5 ship ritual** — GIF re-check (README scenes that changed, ≤15s
   800px 15fps <5MB; 09-eval-run untouched), then merge `02b-behavior-contract` →
   `measure-run` (UNPUSHED; D7 holds), mark B4/B5 shipped, resume 02 S8 publish.

## Current state
- Worktree `../CapyCook-02b` @ `02b-behavior-contract`, HEAD **`efa9c0d`**; main
  checkout untouched on measure-run. Self-test **27/27 ok:true** @ `efa9c0d`
  (10/10 mutation flips). Loop record: `b4-ledger.md` (source of truth), `log.md`.
- **All 43 census reds fixed + 5 exit-run regressions fixed** (BC-J-5 guard, C-8
  stale scenario, C-10@live-sim wait, G-8 product, H-4 product; builder `4080499`
  + lead harness commits). **Judge-capture hardened**: A-8 screenshot fallback,
  G-3 setTheme+judgeShot, G-6 toast wait, B-8 resolved-gate judgeShot.
- **Asserts: 113/0 on four clean full runs.** Judges: 6/9 on run-036 (B-8, I-2,
  D-7 fail on evidence variance — NOT product defects; different criteria fail
  each run). B-8 is the only persistent one (transition-moment capture).
- Guardrails clean: freeze diff vs `32afe54` empty · contract pin `965c8eb`
  byte-intact · PREREGISTRATION untouched · **operator DB exactly 6** · make
  test/vet/tsc/vitest green (BC-J-2).

## Open concerns
- **⚠ Not self-verified.** This session heavily edited the oracle checks/capture;
  the ×2-all-green was never reached. B5's USER approval is the real gate — do
  not treat the assembled evidence as verification.
- **Judge variance is the blocker, not the product.** The transition criteria
  (B-8, I-2) need a fundamentally more reliable capture of the handoff moment
  (screencast wedges); D-7 needs the stub declutter. All are harness/fixture, not
  product. Decide at B5 whether to invest in that rework or accept the evidence.
- Evidence dirs gitignored — run-027/030/034/036 + `selftest-report.json` are the
  B5 evidence; **do not clean** until B5 resolves. Ports swept (8098 free).
- Exit-judges driver lives in the session scratchpad
  (`exit-judges.workflow.mjs`); re-runnable via `{worktree, runDir}`.