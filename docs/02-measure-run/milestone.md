# Milestone 02 — measure-run

**Goal:** Fill the Results table solo at ~195-claim scale via tiered verification (Tier-1 deterministic verifier · blinded author R1 · DeepSeek judge R2), and make the repo the reviewer surface. Spec: `docs/superpowers/specs/2026-07-08-milestone-02-reframe-and-showcase-design.md`.

## Scope / Non-goals

**Scope:**
- Eval reframe: PREREGISTRATION §9 amendment (labeling procedure only — categories, rate formulas, hypotheses, κ bands stay frozen).
- Solo tiered verification: Tier-1 deterministic verifier + Tier-2 blinded author R1 + DeepSeek judge R2, 100% Tier-2 coverage.
- Live 3-arm campaign run (13 ratified seeds, ~195 claims) + H2 operator-session telemetry (rough floor ~8 sessions).
- Repo-showcase kit: README surgery, diagrams, GIFs, hero banner, social preview.
- Publish gate: push to GitHub + settings pass, portfolio linkage.

**Non-goals** (spec's Out of scope): hosted demo of any kind · Codespaces/devcontainer · second human labeler · P1 live-retrieval arm (own registration later) · milestone 03 (depth).

## Slices

| # | Slice | Status | Plan pointer |
|---|---|---|---|
| S1 | README surgery + hygiene + archive reorg + state-machine & data-flow Mermaid diagrams | shipped | `docs/superpowers/plans/2026-07-08-milestone-02-measure-run.md` |
| S2 | Prereg §9 amendment (authorizes machine + LLM raters by name) + materialize `docs/02-measure-run/` + update `docs/milestones.md` | shipped | `docs/superpowers/plans/2026-07-08-milestone-02-measure-run.md` |
| S3 | Tier-1 deterministic verifier (TDD) + author blind-check validation sample | shipped | `docs/superpowers/plans/2026-07-08-milestone-02-measure-run.md` |
| S4 | Blinded label sheet + judge R2 client + revise `labels.go` human-only stop-line | shipped | `docs/superpowers/plans/2026-07-08-milestone-02-measure-run.md` |
| S5 | Live 3-arm run + Langfuse traces | next | (plan at S5 start) |
| S6 | Blinded R1 labeling, pre-adjudication κ + confusion matrix, adjudication → author-final set, rates → Results + findings + eval-pipeline diagram + H2 fold | planned | (planned at S4 exit) |
| S7 | Media wave: 4 new GIFs, eval terminal capture, hero banner, social preview, SVG exports, portfolio MP4s | planned | (planned at S4 exit) |
| S8 | Publish: push + GitHub settings pass + portfolio linkage | planned | (planned at S4 exit) |

## Integration notes

- (a) Both §9 entries are USER-pasted — the builder never edits `docs/PREREGISTRATION.md`.
- (b) The T1 instrument pin must postdate the S3/S4 instrument edits (prompts, `evidence.tmpl`, `runner.go`) and predate S5.
- (c) Tier-1 ground truth = `llm.BuildEvidence` re-derivation.
- (d) `claim_id` embeds the arm → blinded exports use opaque ids.
- (e) Verified 2026-07-08: judge `deepseek-v4-flash`; JSON-mode caveats; legacy-alias deprecation 2026-07-24.
- (f) **S5 cost estimate** (one-time, under the default `LLM_BUDGET_USD=10` cap, shared meter governs both): generation = 13 seeds × 5 moves × 3 arms = 195 `GenerateMove` calls on `deepseek-v4-pro`; at ~4k in / ~1.5k out each ≈ 0.78M in / 0.29M out ≈ **~$0.6**. Judge = at most (Tier-2 claim count) calls on `deepseek-v4-flash` at ~1.2k in / 150 out; worst case (all claims Tier-2) ≈ **<$0.05**. Total **< $1**. Assumptions (token averages) are estimates; the budget hard-stop is the real ceiling.
- (g) **Tier-1 coverage is unknown until S5.** Stub dry-run over the ratified seeds labels 100% at Tier-1 (0 fall-through) because the stub emits only `pairing:`/empty-source claims — all Tier-1-decidable — and heavy (text,source) dedup yields 39 claims/arm (117 total) vs the ~195 move-slot estimate. Live DeepSeek will emit `fdc:`/`foodon:`/free-text claims that fall to Tier 2, and produce less-deduped, more numerous claims; the live Tier-1 coverage number (printed per-arm at run exit) sets the author's R1 labeling load — watch it at S5 (spec Open item 3).

## Exit criteria

- PREREGISTRATION §9 carries the reframe amendment + the T1 instrument-pin entries (two gates); body untouched; CI frozen-doc guard still green.
- `go test ./...` green including the new verifier; judge writes only `label_r2`; blinding verified by test; verifier↔author blind-check agreement reported at S3 exit.
- Results table filled per §7a with explicit denominators; pre-adjudication κ + confusion matrix reported (any adjudicated author-final set clearly labeled as such, not as the reliability figure); findings paragraph present; H3b null (if it lands) framed as confirmed prediction.
- README: surgery items done, 8 GIFs + 3 diagrams render on GitHub, hero + badges live, no stale claims.
- Repo public with settings pass complete; portfolio site has MP4s + repo link.
- Zero recurring hosting cost; no API key in any public artifact.
