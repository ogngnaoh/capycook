# Handoff — milestone 02b (behavior-contract)

## Next session start here
**B4 CHECKPOINT reached — USER review gate before the exit.** The USER-sanctioned
harness queue is done: both remaining census reds are GREEN as harness artifacts
(the post-ruling hypothesis held), so **NO builder runs were spent** (both granted
runs remain unused). Five lead harness commits on `02b-behavior-contract`
(`3b48b1a` G-10, `6255a66`+`be2a84b` A-12, `823939a` B-8, `982bcfa` G-6), each
committed then self-tested `ok:true` 27/27 — see `b4-ledger.md` check-change log.
**Before the ×2 full exit runs, the USER must decide two things surfaced this
session** (both in `log.md` 2026-07-12 checkpoint entry): (1) authorize a product
fix for **BC-G-8** — the GateBar "Try another way" disclosure toggle is 104×20px,
<24px WCAG 2.5.8 at 390px; a real B4 regression the g/narrow-390 abort had masked
(census had it green). (2) Whether to run **one informative full oracle pass**
first — B4's targeted `--only` runs never re-checked census-PASSING criteria, so
B4 product changes silently regressed some (G-5/G-6/G-8 confirmed); a full run is
the first place ALL criteria are re-checked and MORE masked regressions may
surface. Only after BC-G-8 (and any others) are fixed should the ×2 consecutive
FULL all-green runs (asserts + fresh judges + parity twins + I-1) run → B5.
Also fix **BC-J-5** first: the worktree `data/capycook.db` is a 0-byte file (no
events table) → the guardrail errors; point it at the real operator DB.

## Current state
- Worktree `../CapyCook-02b` @ `02b-behavior-contract`, HEAD `be2a84b`; main
  checkout untouched on measure-run. Self-test `ok:true` @ `be2a84b` (27/27,
  10/10 mutation flips). Loop docs: `b4-ledger.md` (source of truth), `log.md`.
- **43/43 census reds now addressed**: 41 fixed in the loop + G-10 + A-12 at the
  checkpoint. Authoritative combined artifact **run-022** (@ `be2a84b`): BC-G-10
  GREEN + BC-A-12 GREEN + the 36-id previouslyGreen net all pass — 36/39 pass,
  0 fail, 3 pending-judgment (I-2, E-3, G-6 — judges need the fresh-context
  panel at exit; not evaluable in a manual run). No assert-side regression.
- Harness artifact sources fixed for the exit: B-8 recorder frame-rate
  (`everyNthFrame` 2→12), G-6 g/narrow-390 reach-idle + clean still framing.
- Both ⚖ criteria remain shipped (C-26, D-12). Contract pin `965c8eb`
  byte-intact; PREREGISTRATION untouched; freeze diff vs 32afe54 empty.

## Open concerns
- **BC-G-8 is a genuine product gap** (20px disclosure toggle) — needs a builder
  run/product fix before the exit can be all-green. NOT fixed this session.
- **Masked-regression risk**: the loop never re-checked previously-green
  criteria; only a full run enumerates them. Expect the first full run to be
  informative, not all-green.
- This session **edited the oracle (the checks)** — the eventual all-green is NOT
  self-verified here; B5's USER approval is the real verification gate.
- Evidence dirs gitignored: runs 013–0(final) are checkpoint working artifacts;
  main-checkout run-073 + selftest-report must survive to B5. Operator DB at exit
  must show exactly 6 events (worktree DB is empty — use the real one).
