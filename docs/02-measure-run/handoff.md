# Handoff — milestone 02 (measure-run)

## Next session start here
Three ordered steps — do them in order; step 2 is an irreversible spend, so finish step 1 first.

**1. Re-review the shipped slices (S1–S4) before spending.** The final whole-branch
review already returned SHIP (verdict + evidence in `log.md`, 2026-07-09); re-orient by
confirming the branch is clean at that state and skimming the S1–S4 diff
(`git diff $(git merge-base master HEAD)..HEAD -- internal/eval internal/llm cmd/eval docs/PREREGISTRATION.md`).
Sanity-gate before spend: `make test`/`vet` green; `git diff 08903cb..HEAD` over the 7
pinned instrument paths still empty (instruments frozen). If any of that fails, stop.

**2. Run S5 (live 3-arm eval — user-gated spend, ~$0.6 under the $10 cap):**
```
export DEEPSEEK_API_KEY=<key>  CAPYCOOK_LIVE_TEST=1
go run ./cmd/eval run --arm=all --live
```
FIRST BATCH, before the full spend: check grounded-arm `foodon:` provenance formatting
(bare vs prefixed — log.md watch note) and read the per-arm Tier-1 coverage line.
Then: trace to Langfuse (set LANGFUSE_* in .env) → export blinded R1 sheet
(`export-labels --blind --claims=<3 claims_*.jsonl> --map=...`) → judge R2
(`judge --claims=<merged> --live`) → Tier-1 blind-check (`blind-check` / `blind-check-score`).
See milestone.md notes (f)/(g).

**3. Plan S6–S8 (not yet bite-sized).** Use superpowers:writing-plans over the spec's
S6–S8 (labeling/adjudication/κ/Results + eval-pipeline diagram + H2 fold · media wave ·
publish gate). Do this after S5 lands real numbers, since S6's Results depend on them.

## Current state
- Branch `measure-run`, **not pushed** (D7 holds all pushes until Results fill). Tree clean.
- S1–S4 shipped, review-clean, final whole-branch review **SHIP** (plan Tasks 1–24; ledger `.superpowers/sdd/progress.md`).
- PREREGISTRATION §9 carries both entries: Amendment 1 (tiered verification, 2026-07-08) + T1 instrument freeze / FoodPuzzle deferral (2026-07-09), both user-pasted; §1–§8 byte-unchanged. Instruments pinned at `08903cb` (7 paths diff-empty to HEAD).
- Eval kit complete: Tier-1 verifier, runner integration, `label_tier1` slot, blinded R1 kit (opaque ids + map), blind-check sample+score, judge R2 client + `eval judge` CLI (live-gated, budget-metered, idempotent). `make test`/`vet`/`build` green.
- Stub dry-run: 39 claims/arm, Tier-1 100% (stub artifact — see note (g)).

## Active concerns
- **Tier-1 live coverage unknown** (note g) — determines author labeling hours; read the per-arm coverage line at the live run.
- **Verify-before-build at S5**: re-check `deepseek-v4-flash` id + pricing against live api-docs (Amendment 1 committed to this); confirm live provenance tokens are lowercase/whitespace-free or Tier-1 coverage silently drops.
- Adjudication (S6) must write the author-final value into `label_r1` before `rates` runs — `FinalLabel()` can't distinguish raw vs adjudicated R1 (Task 13 carried note).
