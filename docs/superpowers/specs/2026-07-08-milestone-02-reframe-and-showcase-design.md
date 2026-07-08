# Milestone 02 Reframe + Repo Showcase — Design

**Date:** 2026-07-08 · **Status:** spec review complete (2026-07-08); factual + honesty edits folded, ready for planning
**Supersedes:** the "human-led campaign" framing of milestone 02 in `docs/milestones.md` (T1 instrument freeze, operator sessions, labeling campaign **+ second labeler**, κ).

## Goal

Make CapyCook finishable end-to-end by one person — eval and observability included — and make the GitHub repo (README + media + diagrams) the primary reviewer surface, strong enough to headline a resume. No hosted demo, no Codespaces path: reviewers read the repo, then fork and run locally if curious.

## Decisions (all made 2026-07-08, before any eval data exists)

| # | Decision | Choice |
|---|---|---|
| D1 | Milestone 02 fate | **Full reframed 02** — fill the Results table at ~200-claim scale |
| D2 | Labeling strategy | **Tiered verification** (deterministic verifier + blinded author R1 + LLM judge R2) |
| D3 | Judge model | **DeepSeek, different model than the generator** — same-family self-preference caveat logged in the writeup; exact model id verified against live api-docs.deepseek.com before build (CLAUDE.md verify-before-build) |
| D4 | Hosting | **None.** No sandbox, no Codespaces badge. Repo is the surface; local quickstart is the run path |
| D5 | Showcase kit | Architecture diagrams + hero banner/social preview + 4 new GIFs + MP4/WebM clips for the portfolio site |
| D6 | Process exhaust | **Archive + own it** — shipped-milestone exhaust moves to `docs/archive/`; AI-assisted process stays visible and is owned as a strength |
| D7 | Publish timing | **Hold `git push` until milestone 02 + showcase are done** — one public debut with a filled Results table. Tamper-evidence rests on the git commit chain (`git log --follow docs/PREREGISTRATION.md`) |

## Part 1 — Eval reframe (the §9 amendment)

One dated entry in PREREGISTRATION §9, landed before any eval run. It changes the **labeling procedure only**; every category, rate formula, hypothesis, κ band, and analysis rule stays frozen.

**What replaces the second human labeler (§6):**

- **Tier 1 — deterministic verifier.** New code in `internal/eval`: for every claim whose cited source is vendored (`fdc:` nutrition, `foodon:` identity, cost table, FlavorGraph edges), re-derive ground truth in-process and emit the label mechanically (`grounded-correct` vs `grounded-mischaracterized` by recompute-and-compare; `correctly-unverified` by tag check). Unit-tested; unanchorable claims fall through to Tier 2 untouched. **Verifier validation:** the author blind-labels a small sample (~15–20) of Tier-1-anchored claims and we report verifier↔author agreement (flagged at S3 exit) — so Tier-1's mechanical labels are cross-checked against a human, not left as author-code judged only by author-written tests. Rationale: the project's own boundary extended to the eval — *a human never labels what a program can verify.*
- **Tier 2 — double-labeled judgment claims, 100% coverage** (vs the original 18% sliver — the vestigial `DoubleLabelRate=0.18` seeded sampler in `labels.go` gets reconciled to full coverage). R1 = the author, **blinded to the arm label, seeded shuffle** (a bias control the frozen design lacked; blinding is *partial* — arm identity still leaks through content, since a claim carrying an `fdc:`/`foodon:` citation is self-evidently grounded and an uncited assertion self-evidently ungrounded). R2 = an LLM judge on the existing swappable `llm` iface, prompted with the frozen §7a rubric verbatim, structured JSON out, writing `label_r2` (no schema change — the slot exists). **κ + confusion matrix are reported pre-adjudication as the headline reliability number** — the author is one of the two raters, so author-adjudication cannot also serve as the independent tiebreak; adjudication then produces a clearly-labeled *author-final* set with logged rationale, never presented as the reliability figure.
- **Logged caveats:** judge is same-family as the generator (D3); κ now measures author↔judge agreement, not human↔human, and the author is a target-persona *biased pilot*, so this κ is a labeling-reliability check and is **never** presented as external validation; §8 Rule 4's "κ<0.4 ⇒ ambiguous rubric" now carries a second reading (judge incompetence/parroting) while a high κ may mean the judge merely echoes the author's framing — all stated plainly, never dressed up as the original design.

**Unchanged and already built:** scripted 3-arm runner through the real orchestrator (`internal/eval/runner.go`), κ/confusion matrix, rates math, H2 replay fold, label-sheet builder. The 13-seed / ~195-claim benchmark set is **already ratified and locked** (Gate C, 2026-07-07 — `eval/fixtures/CHANGELOG.md`): frozen input to this milestone, and any seed change would itself require a §9 amendment.

**Premise the amendment must own explicitly:** `labels.go` today enforces *"labels only ever come from human raters (PREREG §7)"* (the "phase-4 stop-line") and §5 says *"human-labeled."* Tier-1 (machine-produced labels) and R2 (an LLM rater) both overturn that premise. The §9 entry therefore authorizes deterministic machine labels **and** an LLM rater **by name** — not as a quiet "swap labeler #2" — and S3/S4 revise the `labels.go` stop-line comments + the `labels_test.go` assertion to match. This is the load-bearing scope the "labeling procedure only" framing understates.

## Part 2 — Running the campaign (solo)

1. Seeds are **already ratified and locked** (Gate C, 2026-07-07) — no ratification gate remains; the run uses the frozen 13-seed set as-is.
2. Scripted runner executes all three arms with **live DeepSeek** (one-time spend, estimated at plan time after the api-docs verify). Runs traced OTel→Langfuse.
3. Author does the blinded R1 pass over Tier-2 claims (~a few evenings); judge R2 pass; adjudication.
4. **H2 telemetry:** real operator sessions in the event log — the author using the workbench for real dishes during the milestone weeks. Explicit N, per the frozen prereg; aim for enough sessions that N isn't embarrassingly thin next to §3's N=140 example (rough floor ~8 sessions), reported honestly whatever it lands at.
5. Results: three per-arm rates with explicit denominators, κ + confusion matrix, gate-dynamics table with explicit N, one honest findings paragraph (an H3b null reported as the confirmed prediction it is), a Langfuse trace screenshot in the README.

## Part 3 — README surgery + repo hygiene (pre-publish, from the 2026-07-08 fresh review)

- Demote the status blockquote to one crisp line under the intro; kill the insider prose.
- Restructure the empty Results placeholder (no all-dash table while unpublished; it fills before push anyway per D7). Give gate dynamics its own table stub — its columns don't match the three rates.
- Fix stale claims: compose kit / Langfuse profile "arrives in Phase 6" → shipped; link `DEPLOY.md`; reconcile Node 20 vs CI's Node 22; check Makefile's stale "UNRATIFIED seeds" comment when seeds ratify.
- Add: CI badge (+ Go/license badges), one-line stack statement, a short `internal/` package map so reviewers know where to sample code.
- **`.gitignore`: add `data/*.db` as literally the first commit** of the milestone (privacy/pre-push bug; the db is currently untracked but any `git add -A` before the fix would stage it).
- Archive reorg (D6): shipped-milestone exhaust → `docs/archive/`; fix the dangling `docs/02-measure-run/` pointer by materializing the folder.

## Part 4 — Showcase kit

- **Diagrams (Mermaid in README, SVG exports in `docs/media/` for the portfolio site):**
  1. Move/gate **state-machine** diagram (the core IP).
  2. **System/data-flow**: seed → deterministic grounding/safety gate → LLM proposal → human gate → versioned draft, with the OTel→Langfuse tail.
  3. **Eval pipeline**: claims → Tier-1 verifier / Tier-2 blinded R1 + judge R2 → rates + κ (lands with Results).
  Mermaid dark-mode theming handled via init directive; SVGs carry `prefers-color-scheme`.
- **New GIFs (all four, existing four stay):** ① branch → compare → promote (flagship claim, currently zero visual proof) · ② autonomy dial (deterministic moves fast-forward, creative moves still gate) · ③ mid-stream cancel · ④ technical view + dark mode. Specs: ≤15 s, 640–800 px wide, 15 fps, well under 5 MB, committed to `docs/media/` (durable/fork-safe; overriding the issue-upload suggestion). Captured with the existing `web/tools` headless rig. Plus a terminal capture of the eval harness run for the Results section.
- **Hero banner** at README top + **GitHub social preview** (1280×640 PNG, composed from the 02a evidence shots).
- **MP4/WebM clips** of all demos for the portfolio site (GIFs stay for GitHub). Verify at execution whether GitHub READMEs still accept drag-drop video attachments; if yes, optionally embed one.
- **README order** (per research): hero + badges → demo GIFs → diagrams → how-it-works → methodology → results → quickstart → positioning → safety → docs.

## Part 5 — Publish gate (last slice)

Push `master` → GitHub settings pass: repo description, topics, social-preview upload, pin the repo, verify repo-name casing vs clone URL. Portfolio site links in.

## Slice plan (execution order)

| # | Slice | Size |
|---|---|---|
| S1 | README surgery + hygiene + archive reorg + state-machine & data-flow Mermaid diagrams | M |
| S2 | Prereg §9 amendment (authorizes machine + LLM raters by name) + materialize `docs/02-measure-run/` (milestone.md, handoff.md) + update `docs/milestones.md` | S |
| S3 | Tier-1 deterministic verifier (TDD) + author blind-check validation sample (report verifier↔author agreement) | M |
| S4 | Blinded label sheet + judge R2 client (model id verified against live docs first); revise `labels.go` human-only stop-line + reconcile 18% sampler with 100% Tier-2 coverage | M |
| S5 | Live 3-arm run + Langfuse traces (seeds already ratified/locked — no gate) | S + spend |
| S6 | Blinded R1 labeling, **pre-adjudication** κ + confusion matrix, adjudication → author-final set, rates → Results section + findings + eval-pipeline diagram + H2 fold from operator sessions | M (author hours) |
| S7 | Media wave: 4 new GIFs, eval terminal capture, hero banner, social preview, SVG exports, portfolio MP4s | M |
| S8 | Publish: push + GitHub settings pass + portfolio linkage | S |

H2 operator sessions run in the background throughout S3–S6 (real usage, not a slice).

## Exit criteria

- PREREGISTRATION §9 carries the reframe amendment + the T1 instrument-pin entries (two user gates — the T1 pin machinery was discovered at planning); body untouched; CI frozen-doc guard still green.
- `go test ./...` green including the new verifier; judge writes only `label_r2`; blinding verified by test; verifier↔author blind-check agreement reported at S3 exit.
- Results table filled per §7a with explicit denominators; **pre-adjudication** κ + confusion matrix reported (any adjudicated author-final set clearly labeled as such, not as the reliability figure); findings paragraph present; H3b null (if it lands) framed as confirmed prediction.
- README: surgery items done, 8 GIFs + 3 diagrams render on GitHub, hero + badges live, no stale claims.
- Repo public with settings pass complete; portfolio site has MP4s + repo link.
- Zero recurring hosting cost; no API key in any public artifact.

## Out of scope

Hosted demo of any kind · Codespaces/devcontainer · second human labeler · P1 live-retrieval arm (own registration later) · milestone 03 (depth).

## Open items to verify at execution

- Judge model id + pricing against live api-docs.deepseek.com (SPEC §4c gotcha).
- GitHub README video-attachment support (agent reports conflicting info).
- Whether Tier-1 coverage matches expectation (if the verifier anchors far fewer claims than expected, author labeling hours grow — flag at S3 exit).
