# Milestone 02 — measure-run

**Goal:** Fill the Results table solo at ~195-claim scale via tiered verification (Tier-1 deterministic verifier · blinded author R1 · DeepSeek judge R2), and make the repo the reviewer surface. Spec: `docs/superpowers/specs/2026-07-08-milestone-02-reframe-and-showcase-design.md`.

## Scope / Non-goals

**Scope:**
- Eval reframe: PREREGISTRATION §9 amendment (labeling procedure only — categories, rate formulas, hypotheses, κ bands stay frozen).
- Solo tiered verification: Tier-1 deterministic verifier + Tier-2 blinded author R1 + DeepSeek judge R2, 100% Tier-2 coverage.
- Live 3-arm campaign run (13 ratified seeds, ~195 claims) + honest H2 operator telemetry: final N=2 decisions across one session; the USER approved collecting no more sessions.
- Repo-showcase kit: README surgery, diagrams, GIFs, hero banner, social preview.
- Release gate: a polished, current, reviewer-ready public GitHub repository plus packaged current media.

**Non-goals** (spec's Out of scope): hosted demo of any kind · Codespaces/devcontainer · second human labeler · P1 live-retrieval arm (own registration later) · milestone 03 (depth).

## Slices

| # | Slice | Status | Plan pointer |
|---|---|---|---|
| S1 | README surgery + hygiene + archive reorg + state-machine & data-flow Mermaid diagrams | shipped | `docs/superpowers/plans/2026-07-08-milestone-02-measure-run.md` |
| S2 | Prereg §9 amendment (authorizes machine + LLM raters by name) + materialize `docs/02-measure-run/` + update `docs/milestones.md` | shipped | `docs/superpowers/plans/2026-07-08-milestone-02-measure-run.md` |
| S3 | Tier-1 deterministic verifier (TDD) + author blind-check validation sample | shipped | `docs/superpowers/plans/2026-07-08-milestone-02-measure-run.md` |
| S4 | Blinded label sheet + judge R2 client + revise `labels.go` human-only stop-line | shipped | `docs/superpowers/plans/2026-07-08-milestone-02-measure-run.md` |
| S5 | Live 3-arm run + Langfuse traces | shipped | (session plan 2026-07-09; evidence in log.md) |
| S6 | Results + findings + eval-pipeline diagram + blind-check control (H2 fold resequenced pre-publish; R1/κ/adjudication vacuous — note (h)) | shipped | `docs/superpowers/plans/2026-07-10-milestone-02-s6-s8.md` |
| S7 | Media wave: 4 new GIFs, eval terminal capture, hero banner, social preview, SVG exports, packaged MP4s | shipped | `docs/superpowers/plans/2026-07-10-milestone-02-s6-s8.md` |
| S8 | Release: reviewer-ready GitHub repository + packaged current media | active — Gate A pending | `docs/superpowers/plans/2026-07-14-milestone-02-s8-showcase-release.md` |

## Integration notes

- (a) Both §9 entries are USER-pasted — the builder never edits `docs/PREREGISTRATION.md`.
- (b) The T1 instrument pin must postdate the S3/S4 instrument edits (prompts, `evidence.tmpl`, `runner.go`) and predate S5.
- (c) Tier-1 ground truth = `llm.BuildEvidence` re-derivation.
- (d) `claim_id` embeds the arm → blinded exports use opaque ids.
- (e) Verified 2026-07-08: judge `deepseek-v4-flash`; JSON-mode caveats; legacy-alias deprecation 2026-07-24.
- (f) **S5 cost estimate** (one-time, under the default `LLM_BUDGET_USD=10` cap, shared meter governs both): generation = 13 seeds × 5 moves × 3 arms = 195 `GenerateMove` calls on `deepseek-v4-pro`; at ~4k in / ~1.5k out each ≈ 0.78M in / 0.29M out ≈ **~$0.6**. Judge = at most (Tier-2 claim count) calls on `deepseek-v4-flash` at ~1.2k in / 150 out; worst case (all claims Tier-2) ≈ **<$0.05**. Total **< $1**. Assumptions (token averages) are estimates; the budget hard-stop is the real ceiling.
- (h) **S5 landed (2026-07-10): zero Tier-2 claims.** Tier-1 covered 100% in all three arms (562 claims; provenance only ever empty or `pairing:`). S6 inherits: blinded R1 pass and judge R2 are VACUOUS (machine-confirmed); κ/confusion matrix has no rows — report that plainly per §8, never fabricate; author labeling = only the 18-row Tier-1 blind-check control (exported, map sealed); bench-12 skipped symmetrically in all arms (`allergen-unresolved`, Amendment 2 skip reporting) — Results denominators are 12/13 seeds per arm; citation uptake low (10/209, 10/203, 0/150) — findings paragraph must own it. Instruments now pinned at `32afe54` (Amendment 2).
- (i) **Milestone 03 inherits bench-12** — un-runnable in every arm (the deterministic allergen resolver cannot resolve "short pasta"; `allergen-unresolved` on all 4 attempts × 3 arms, symmetric): extend allergen-resolver coverage or re-author the seed via a new ratification gate.
- (j) **§9 Amendment 3 (2026-07-10, S6):** the blind-check control's rater is an author-delegated LLM (fresh-context Claude agent), labels adopted by the author; agreement 15/18 (83%) is model-validates-machine, never human validation — every future mention of the figure names the rater.
- (k) **S7 media deviations (2026-07-10, user-ratified at session start):** GIFs 01–04 re-recorded (the Jul-7 originals predate the 02a redesign; the rig's selectors no longer existed); GIF 05 reframed to "branch + promote" (`05-branch-promote.gif`) — branch-vs-branch compare stays milestone-03 scope; `CAPYCOOK_STUB_LATENCY_MS` added (context-aware, off by default, server-only — `cmd/eval` constructs `Stub{}` bare) to make the cancel scene filmable. Diagram SVGs are packaged-media/social exports, deliberately NOT referenced by README (GitHub renders the live Mermaid blocks). Media constraints held: 9 GIFs, 800px, 5.7–11.9s, ≤0.36 MB.
- (l) **H2 collection is final at N=2 (2026-07-14).** Replay found two `seed_expand` decisions across one single-operator session, both native cancels and therefore two rejects in the frozen-five roll-up. The USER approved collecting no more sessions; this remains descriptive autobiographical-design telemetry, not user research.
- (g) **Historical pre-S5 expectation — superseded in full by landed-result note (h); none of these forecasts is current work.** Before S5, Tier-1 coverage was unknown. The stub dry-run over the ratified seeds labeled 100% at Tier-1 (0 fall-through) because the stub emitted only `pairing:`/empty-source claims — all Tier-1-decidable — and heavy (text,source) dedup yielded 39 claims/arm (117 total) vs the ~195 move-slot estimate. The forecast was that live DeepSeek would emit `fdc:`/`foodon:`/free-text claims that fell to Tier 2 and produce less-deduped, more numerous claims, with the live Tier-1 coverage number setting the author's R1 labeling load at S5 (spec Open item 3). Note (h) records the actual landed outcome.

## Exit criteria

- PREREGISTRATION §9 carries the reframe amendment + the T1 instrument-pin entries (two gates); body untouched; CI frozen-doc guard still green.
- `go test ./...` green including the new verifier; judge writes only `label_r2`; blinding verified by test; verifier↔LLM-delegate blind-check agreement (15/18, 83%) reported at S6 as model-validates-machine, never human validation.
- Results table filled per §7a with explicit denominators; pre-adjudication κ + confusion matrix reported (any adjudicated author-final set clearly labeled as such, not as the reliability figure); findings paragraph present; H3b null (if it lands) framed as confirmed prediction.
- README: surgery items done, 9 total showcase GIFs (eight product + one eval) + 3 diagrams render on GitHub, hero + badges live, no stale claims.
- A polished, current, reviewer-ready public GitHub repository passes settings and render checks; current media is packaged with the release.
- Zero recurring hosting cost; no API key in any public artifact.
