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
| S2 | Prereg §9 amendment (authorizes machine + LLM raters by name) + materialize `docs/02-measure-run/` + update `docs/milestones.md` | in-progress | `docs/superpowers/plans/2026-07-08-milestone-02-measure-run.md` |
| S3 | Tier-1 deterministic verifier (TDD) + author blind-check validation sample | planned | `docs/superpowers/plans/2026-07-08-milestone-02-measure-run.md` |
| S4 | Blinded label sheet + judge R2 client + revise `labels.go` human-only stop-line | planned | `docs/superpowers/plans/2026-07-08-milestone-02-measure-run.md` |
| S5 | Live 3-arm run + Langfuse traces | planned | (planned at S4 exit) |
| S6 | Blinded R1 labeling, pre-adjudication κ + confusion matrix, adjudication → author-final set, rates → Results + findings + eval-pipeline diagram + H2 fold | planned | (planned at S4 exit) |
| S7 | Media wave: 4 new GIFs, eval terminal capture, hero banner, social preview, SVG exports, portfolio MP4s | planned | (planned at S4 exit) |
| S8 | Publish: push + GitHub settings pass + portfolio linkage | planned | (planned at S4 exit) |

## Integration notes

- (a) Both §9 entries are USER-pasted — the builder never edits `docs/PREREGISTRATION.md`.
- (b) The T1 instrument pin must postdate the S3/S4 instrument edits (prompts, `evidence.tmpl`, `runner.go`) and predate S5.
- (c) Tier-1 ground truth = `llm.BuildEvidence` re-derivation.
- (d) `claim_id` embeds the arm → blinded exports use opaque ids.
- (e) Verified 2026-07-08: judge `deepseek-v4-flash`; JSON-mode caveats; legacy-alias deprecation 2026-07-24.

## Exit criteria

- PREREGISTRATION §9 carries the reframe amendment + the T1 instrument-pin entries (two gates); body untouched; CI frozen-doc guard still green.
- `go test ./...` green including the new verifier; judge writes only `label_r2`; blinding verified by test; verifier↔author blind-check agreement reported at S3 exit.
- Results table filled per §7a with explicit denominators; pre-adjudication κ + confusion matrix reported (any adjudicated author-final set clearly labeled as such, not as the reliability figure); findings paragraph present; H3b null (if it lands) framed as confirmed prediction.
- README: surgery items done, 8 GIFs + 3 diagrams render on GitHub, hero + badges live, no stale claims.
- Repo public with settings pass complete; portfolio site has MP4s + repo link.
- Zero recurring hosting cost; no API key in any public artifact.
