# Handoff — milestone 02 (measure-run)

## Next session start here
S5 is a **user-gated spend** slice — plan it before running. The literal first live action:
```
export DEEPSEEK_API_KEY=<key>  CAPYCOOK_LIVE_TEST=1
go run ./cmd/eval run --arm=all --live        # ~$0.6, budget hard-stop at LLM_BUDGET_USD (default 10)
```
Then trace to Langfuse (set LANGFUSE_* in .env), export the blinded R1 sheet
(`go run ./cmd/eval export-labels --blind --claims=<the 3 claims_*.jsonl> --map=...`),
run the judge (`go run ./cmd/eval judge --claims=<merged> --live`), and the
Tier-1 blind-check (`blind-check` / `blind-check-score`). See milestone.md notes (f)/(g).

## Current state
- Branch `measure-run`, **not pushed** (D7 holds all pushes until Results fill).
- S1–S4 shipped and review-clean (plan Tasks 1–22; ledger `.superpowers/sdd/progress.md`).
- PREREGISTRATION §9 carries both entries: Amendment 1 (tiered verification, 2026-07-08) + T1 instrument freeze / FoodPuzzle deferral (2026-07-09), both user-pasted. Instruments pinned at `08903cb`; `git diff 08903cb..HEAD` over the 7 pinned paths is empty.
- Eval kit complete: Tier-1 verifier, runner integration, `label_tier1` slot, blinded R1 kit (opaque ids + map), blind-check sample+score, judge R2 client + `eval judge` CLI (live-gated, budget-metered, idempotent). `make test`/`vet`/`build` all green.
- Stub dry-run: 39 claims/arm, Tier-1 100% (stub artifact — see note (g)).
- Final whole-branch review pending as the last step of this session.

## Active concerns
- **Tier-1 live coverage unknown** (note g) — determines author labeling hours; read the per-arm coverage line at the live run.
- **Verify-before-build at S5**: re-check `deepseek-v4-flash` id + pricing against live api-docs (Amendment 1 committed to this); confirm live provenance tokens are lowercase/whitespace-free or Tier-1 coverage silently drops.
- Adjudication must write the author-final value into `label_r1` before `rates` runs — `FinalLabel()` can't distinguish raw vs adjudicated R1 (Task 13 carried note).
- S5–S8 not yet planned in bite-sized detail (plan at S5 start).
