# Evaluation Pre-Registration — Dish Development Workbench (CapyCook)

> A **frozen** pre-registration of the evaluation for this project, written **before any eval run**. It states the hypotheses, arms, outcomes, and analysis plan up front so results cannot be retrofitted to the data — and so a null reads as a *confirmed prediction*, not a post-hoc excuse.

| | |
|---|---|
| **Status** | **Pre-registered / frozen.** As of the commit that introduces this file, **zero eval data has been collected** and **no eval run has occurred.** |
| **Registered** | 2026-07-01 |
| **Applies to** | DESIGN.md **v0.4** — §9 (evaluation strategy), §15 (roadmap: "v0 — Scaffold + pre-register") |
| **Amendment policy** | The body of this document is **immutable after T0**. Any later change is recorded **only** as a dated entry in the [Amendment log](#9-amendment-log) — never as a silent edit. `git log --follow docs/PREREGISTRATION.md` is the tamper-evident record of what predated the data. |

---

## 1. Purpose & freeze declaration

This document exists to bind our predictions **before** we can see any results. Pre-registration is cheap honesty insurance: it removes the degrees of freedom that let a researcher (even an honest one) reshape a hypothesis around whatever the data happened to show.

Two things in particular are frozen here, because they are the two easiest to blur *after* seeing the numbers:

1. **The direction of every prediction** (§3), so a null on the grounding ablation is scored as the outcome we expected, not a disappointment.
2. **The correctness-vs-flavor attribution rule** (§8, Rule 1), so a win driven by the deterministic USDA/arithmetic path can never be reported as a flavor-grounding win.

The evaluation itself is described in DESIGN.md §9. This document does not restate the design; it *commits* to the parts that must be fixed in advance. Where the two ever disagree, the frozen text here governs the eval.

**Not pre-registered here (out of scope for v0, by design):**
- The **P1 live-literature-retrieval arm** (a 4th arm) — will get its own registration/amendment when built (§4).
- **Substitution / Recipe1MSubs scoring** (P2).
- Any **market, user-study, or human-subjects** claim. There is no external user test in v0 (DESIGN.md v0-scope decision #4, retired). The author is the spec; external judgment is explicitly out of scope for this deliverable.

---

## 2. What is being tested, and why this framing

**The flagship result is the system and the eval methodology — not a grounding number.** The headline metrics are process-level and *sign-robust*: they hold their meaning whichever way the grounding ablation lands. The grounding ablation is a **supporting, openly-hedged** experiment, reported below the process metrics.

This ordering is itself a pre-commitment: we are not allowed to promote the ablation to the headline if it happens to come out well, nor bury it if it comes out null. The hero is fixed as the process metrics now, before we know either result.

---

## 3. Hypotheses (directional, pre-committed)

Stated as **directional predictions**, not null-hypothesis significance tests (see §8 for why). Each is labeled with its role.

### H1 — Provenance & hallucination *(primary; process; benchmark-based)*
On the fixed benchmark set, the system's grounded output carries **high claim-provenance** and **low hallucination**, reported **per arm**.

- **Prediction:** the grounded arm shows a higher provenance rate and a lower hallucination rate than the ungrounded arm.
- **Pre-committed caveat (load-bearing):** we predict that **most of any such gap belongs to the deterministic USDA/entity-resolution path, not the flavor-pairing signal.** The FlavorGraph-only arm exists precisely to separate these (§4). We will not report a deterministic-arithmetic win as a flavor-grounding win. See §8 Rule 1.

### H2 — Gate dynamics *(secondary; operator telemetry)*
The accept / edit / regenerate / reject / redirect distribution across moves, **per move-category**.

- **Reported as single-operator autobiographical-design telemetry** (one human — the author — generates every gate decision), always with an **explicit N** (e.g. "N=140 gate decisions across 12 sessions, single operator") and **never as a bare %**.
- **Soft prediction:** deterministic moves are mostly accepted / auto-advanced; creative/generative moves draw proportionally more edits and redirects. This is a *descriptive characterization of the interaction*, not a quality or user-research claim.

### H3 — Grounding ablation *(supporting; openly hedged)*
Does grounding measurably beat an ungrounded 2026 LLM baseline? Split into two sub-predictions with **opposite expected signs**:

- **H3a (correctness / provenance):** grounding **plausibly helps** — but, per H1's caveat, chiefly via the deterministic path.
- **H3b (creativity / quality):** grounding shows a **modest-or-null** effect. Given that the food-pairing hypothesis is contested (positive for Western cuisines, inverted/irrelevant for East & South Asian — DESIGN.md §8.5) and that v0 is Western-only, **a null here is the scientifically expected outcome and is pre-registered as such.**

---

## 4. Arms

Three arms, all run through the **same orchestrator and harness** — only the grounding toggle differs:

1. **Ungrounded** — a modern 2026 LLM, no retrieval.
2. **FlavorGraph-only** — the contested flavor-pairing signal alone.
3. **Grounded (P0)** — FlavorGraph + USDA/FoodOn deterministic resolution.

**Why three arms, not two.** A two-arm design (grounded vs. ungrounded) cannot distinguish "grounding doesn't help" from "this particular retrieval implementation is weak." The **FlavorGraph-only** arm isolates the flavor-pairing signal from the deterministic path, which is what makes a null **interpretable** and what enforces §8 Rule 1's attribution.

**Out of scope for this registration:** the **P1 live-literature-retrieval arm** (a 4th arm) layers on top of this working three-arm ablation and will be pre-registered separately when built.

---

## 5. Outcomes

| Role | Measure | Reporting format |
|---|---|---|
| **Primary** | Provenance/honesty rate + **mischaracterization rate** + hallucination rate (per-claim, human-labeled, three separate rates — see §7a), **per arm** | Rates with explicit denominators; Cohen's κ + confusion matrix on the double-labeled subset (§6) |
| **Secondary** | Gate dynamics (accept/edit/regenerate/reject/redirect) | Explicit N; **per move-category** breakdown; single-operator label; never a bare % |
| **Supporting** | Ablation quality (technique correctness, provenance completeness, novelty, safety-gate false-pos/false-neg) | Per-arm / per-dish, **single-rater** |
| **Borrowed proxy** | FoodPuzzle molecular-flavor accuracy | Reported **only** as a chemistry-knowledge proxy; explicitly **not** "dishes taste better" |

**LLM-emitted confidence** is recorded and reported **descriptively only**. It is never treated as a validated calibration measure and never used as a gating or scoring input.

---

## 6. Benchmark & sampling

- **Fixed, versioned benchmark set** — a git-tracked fixture with its own changelog (the eval fixture gets the same versioning discipline as the dish draft). *This document pins the procedure and the target numbers; the fixture contents are versioned separately.*
- **Size target:** ~200 labeled claims.
- **Cuisine scope (locked, DESIGN.md v0-scope #2):** demo/benchmark dishes are restricted to the **Western-cuisine subset**, where FlavorGraph's compound-sharing signal has positive empirical support. The cultural bias (inverted for East & South Asian cuisines) is **logged as a finding and committed future work**, not evaluated in v0.
- **Inter-rater reliability spot-check:** a **second labeler** double-labels **15–20%** of the set (~30–40 claims). We report **Cohen's κ + a confusion matrix**.
  - The second labeler is chosen for **task-competence, not persona-representativeness** — enough food literacy to judge whether a cited source supports a claim, plus rubric attention. A friend / labmate / colleague qualifies. This is a **labeling-reliability check, not a user study.**
  - The author (the §16.1 self-interview subject) is **not** reused as the second labeler — that would collapse *inter*-rater agreement back into *intra*-rater.
  - κ bands (DESIGN.md §9.4): **> 0.6 substantial · < 0.4 ambiguous rubric.** At ~30–40 double-labeled claims the confidence interval is **wide** — the writeup will say so rather than over-claim precision.

---

## 7. Labeling rubric (frozen category definitions)

Category definitions are frozen **before** labeling begins; a calibration pass is run before the scored pass; the confusion matrix is reported alongside κ.

### (a) Per-claim provenance / hallucination *(double-labeled subset → Cohen's κ)*
RAGTruth / FaithBench-style nominal categories:

| Category | Meaning | Rolls up into |
|---|---|---|
| `grounded-correct` | Claim backed by a cited source, correctly represented | provenance/honesty rate |
| `grounded-mischaracterized` | Claim cites a real source but misrepresents what it says | **mischaracterization rate** (its own bucket) |
| `correctly-unverified` | Claim honestly surfaced as `[unverified]` | provenance/honesty rate |
| `hallucinated` | Asserted as fact but false or unbacked | hallucination rate |
| `opinion / non-checkable` | Subjective or unfalsifiable | **excluded** (out of denominator) |

**Three rates are reported separately** (over the checkable denominator = all categories except `opinion / non-checkable`):

```
provenance/honesty rate  = (grounded-correct + correctly-unverified) / checkable
mischaracterization rate = grounded-mischaracterized              / checkable
hallucination rate       = hallucinated                          / checkable
```

`grounded-mischaracterized` counts **neither for nor against** — it is surfaced as its own visible failure mode, so a "cited a real source but misrepresented it" case is never hidden inside the honesty number nor conflated with outright fabrication. *This deliberately refines DESIGN.md §9.5, which had lumped it into the "counts for" group; the refinement is the more honest and more informative scoring, chosen at pre-registration.*

### (b) Per-arm / per-dish quality *(single-rater, not double-labeled)*
Technique correctness · provenance completeness · novelty · **safety-gate false-negative / false-positive.** Rated by one rater. The safety-gate error rates are a real measured outcome (the gate **hard-blocks** in v0 — DESIGN.md v0-scope #3).

---

## 8. Analysis plan & "what a null means"

**Statistical stance: descriptive + directional. No null-hypothesis significance testing.** With a single operator generating the gate decisions (H2) and ~30–40 double-labeled claims (H1), a p-value would be false precision. We report rates, explicit Ns, κ, confusion matrices, and per-category breakdowns — and we state uncertainty in words rather than dressing it in a significance test.

**Pre-committed interpretation rules:**

1. **Attribution.** Any correctness/provenance advantage is attributed to the **deterministic path first.** The *ungrounded → FlavorGraph-only* contrast isolates the flavor signal; the *FlavorGraph-only → grounded* contrast isolates the deterministic (USDA/FoodOn) path. A gain that appears only across the second contrast is a **deterministic-arithmetic win, reported as such — never as flavor grounding.**
2. **Creativity null.** A modest-or-null H3b result is reported as a **confirmed prediction** (§3), with the contested-pairing-hypothesis + Western-only-scope reasoning cited, not as a failure.
3. **Gate dynamics.** Reported as **descriptive** single-operator telemetry only — no causal or quality claim, explicit N, per move-category.
4. **Rubric reliability.** If κ on the double-labeled subset is **< 0.4**, we flag the rubric as ambiguous and treat the provenance/hallucination numbers as **unreliable** rather than reporting them as precise.

**Falsifiers / what would surprise us:** if the **FlavorGraph-only** arm beats **ungrounded** on creativity/quality by a clear margin, that is a genuine positive result *for the flavor-pairing signal* — pre-registered here as unexpected-but-welcome, and it would be reported as a headline-worthy finding rather than buried.

---

## 9. Amendment log

_Empty at registration (T0). All post-freeze changes are appended here as dated entries; the body above is never silently edited._

| Date | Change | Reason |
|---|---|---|
| 2026-07-08 | **Amendment 1 — tiered verification replaces the second human labeler** (full text below the table; summary: deterministic Tier-1 verifier authorized to write machine labels to a new label_tier1 slot; LLM judge (deepseek-v4-flash) authorized as R2; Tier-2 double-label coverage 100% (supersedes §6's 15–20%); κ reported pre-adjudication as author↔judge agreement) | Solo-completion constraint; §6's second labeler assumed a volunteer the project does not have |
| 2026-07-09 | **T1 instrument freeze.** All eval instruments pinned at commit `08903cb95d41cfe7257cd0fd3691469409cb4a9b` (refresh per draft checklist): prompts `internal/llm/prompts/` · benchmark seeds `eval/fixtures/seeds.json` (ratified at Gate C) · claim-extraction code `internal/eval/runner.go` · safety rules `data/safety/` · arm driver `eval/fixtures/move_script.json` · grounding-toggle component matrix `internal/llm/evidence.go` · verb→frozen-category mapping `internal/eval/mapping.go`. | Freeze the instruments by SHA **before any counted run** (build spec §1.9) so no prompt, seed, extractor, safety rule, driver, toggle, or mapping can drift after data exists. Dev prompt iteration used only `internal/llm/testdata/dev_seeds.json`, disjoint from the benchmark set. |
| 2026-07-09 | **FoodPuzzle-proxy deferral.** The §5 "borrowed proxy" outcome (FoodPuzzle molecular-flavor accuracy) is deferred to P1 and not measured in v0. | FlavorDB-derivation license check and LLM-judge machinery are out of v0 scope (build spec §1.10); the deferral is logged as a dated amendment rather than silently dropped. |
| 2026-07-09 | **Amendment 2 — bounded move retries in the harness runner** (full text below the table; summary: a safety-blocked move is answered with gate verb=regenerate and a failed move re-proposed, up to 3 fresh generations per move; a move still blocked/failed after that drops its WHOLE seed from the arm, loudly reported with per-arm completed-seed counts; generator client retry bound raised 2→4 within SPEC §7's "fixed bound") | The v1 all-or-nothing abort policy was validated only against the deterministic stub; live deepseek-v4-pro variance (three aborted grounded-arm attempts, observed ~5–11% per-move abort risk × 65 all-or-nothing moves) makes an abort-free arm statistically infeasible. Recorded pre-data: no arm had completed; zero counted claims existed. |
| 2026-07-09 | **T1 instrument re-pin.** All seven instrument paths re-pinned at commit `32afe54fef040fe8fb964fd3c2f04fc9e673b910` (supersedes the `08903cb…` pin): changed — arm driver `eval/fixtures/move_script.json` (v2, retry policy) and claim-extraction code `internal/eval/runner.go` (retry/skip machinery); byte-identical to the prior pin — `internal/llm/prompts/`, `eval/fixtures/seeds.json`, `data/safety/`, `internal/llm/evidence.go`, `internal/eval/mapping.go`. | Amendment 2's mechanism lives in the runner + move script; the pin must postdate those edits and predate the first counted run (build spec §1.9). No prompt, seed, safety rule, toggle, or mapping changed. |

### Amendment 1 — 2026-07-08

**Recorded before any eval run; zero eval data has been collected as of this
entry.** This amendment changes the §6 labeling procedure and, explicitly,
the §5/§7 premise that all labels are produced by human raters. Every
category definition and rate formula (§7a), hypothesis and direction (§3),
and κ band (§6) stays frozen as written; §8's prescribed actions stay frozen
as written; Rule 4's *interpretation* gains an additional reading (below).
This amendment authorizes *who and what* may write a label, nothing about
how a label is scored.

**What changes:**

- **Machine labels authorized (Tier 1).** The verifier re-derives, per claim,
  the evidence its arm supplied for the move that produced it (via the
  T1-pinned `llm.BuildEvidence` matrix) and compares the citation:
  `pairing:<name>` in supplied evidence → `grounded-correct`;
  resolvable-but-not-supplied → `grounded-mischaracterized`; empty source →
  `correctly-unverified` (the workbench renders null-provenance as
  `[unverified]`). This is a citation-resolution check against the supplied
  top-K pairing list — a claim layering compound-level or other detail
  beyond the pairing signal itself can escape it; the verifier↔author
  blind-check sample is the control for this residual risk.
  `fdc:`/`foodon:` citations are anchor-checked only
  (supplied → falls to Tier 2 for content judgment; not-supplied →
  `grounded-mischaracterized`); **cost-table claims are not
  Tier-1-verifiable** (the table is name-keyed, no citable id vocabulary) and
  fall to Tier 2; **any claim whose correctness cannot be decided
  mechanically falls through to Tier 2 unlabeled.** Tier-1 labels live in a
  new `label_tier1` slot — `label_r1`/`label_r2` remain human/judge-only.
- **Verifier validation.** Author blind-labels a seeded sample (~15–20) of
  Tier-1-labeled claims; verifier↔author agreement reported alongside
  results.
- **LLM rater authorized (Tier 2 R2).** Judge = DeepSeek `deepseek-v4-flash`
  (id + pricing verified against live api-docs.deepseek.com, 2026-07-08;
  re-verified at first counted run per the repo's verify-before-build rule)
  (different model than the `deepseek-v4-pro` generator, same family —
  self-preference caveat stands on all Tier-2 numbers); prompted with the
  §7a rubric verbatim, sees claim text + source only (never the arm); writes
  `label_r2` only. *(Distinct from the FoodPuzzle-proxy LLM-judge machinery
  deferred at T1 — that deferral stands.)*
- **R1 blinding.** Author labels a seeded-shuffled sheet with opaque ids, no
  arm column (partial blinding — arm identity can leak through
  citation-bearing content).
- **Coverage & reporting.** Tier-2 double-label = 100% (supersedes §6's
  15–20% subset); κ + confusion matrix reported **pre-adjudication**;
  adjudication yields a separately-labeled author-final set, never the
  reliability figure; κ measures author↔judge agreement (not human↔human,
  never external validation — the author is a biased pilot); §8 Rule 4's
  κ<0.4 reading gains "judge incompetence/parroting" as an alternative
  explanation, and high κ may mean rubric-echoing. Per-arm §7a rates are
  computed over each claim's final label — `label_tier1` where the verifier
  set it, otherwise the adjudicated author-final R1 label; the frozen rate
  formulas are unchanged.

**Everything else frozen:** categories, rate formulas, hypotheses, κ bands,
and §8's prescribed actions unchanged.

**Why:** the original §6 second labeler assumed a competent volunteer; the
project's completion constraint is one person. The replacement extends the
project's own design boundary to the eval — a human never labels what a
program can verify, and human judgment hours go only where neither program
nor rubric-following model suffices. The change is recorded here, dated,
before any data existed to bias it.

### Amendment 2 — 2026-07-09

**Recorded before any counted eval data existed: three grounded-arm attempts
had aborted mid-run (moves 5, 12, and a diagnostic re-roll at move 1); no
arm's claims file was ever written.** This amendment changes the harness
runner's failure handling only. Every category definition and rate formula
(§7a), hypothesis (§3), κ band (§6), analysis rule (§8), the three arms, the
13 ratified seeds, the 5-move script content, prompts, safety rules, and the
Amendment-1 tiered-labeling procedure stay frozen as written.

**What changes:**

- **Bounded move retries (move_script.json v2).** Policy is now
  `on_blocked: retry`, `on_failed: retry`, `retry_limit: 3`. A
  safety-blocked proposal is answered with gate verb `regenerate` — the same
  recovery verb a cook uses in the workbench, recorded in the event log; the
  deterministic safety gate itself is never routed around, and every block
  remains logged telemetry. A failed move (LLM exhaustion) is re-proposed
  from the idle state. The retry counter is shared across both classes, per
  scripted move.
- **Seed skip on exhaustion.** A move still blocked/failed after 3 fresh
  generations drops its ENTIRE seed from that arm (partial seeds are never
  exported); the skip is reported per arm with the move, reason, and a
  completed-seed count (N/13) that accompanies the Results denominators.
  Selection note, stated plainly: claims come only from seeds that completed
  all 5 moves under retries; if skips land asymmetrically across arms, the
  per-arm completed-seed counts expose it and the writeup must discuss it.
- **Generator client retry bound 2→4** (5 attempts, alternating the
  server-enforced strict path with the json_object fallback). SPEC §7 pins
  "retry up to a fixed bound", not a literal count; the judge client keeps
  its reviewed 3-attempt bound and is byte-unchanged.

**What does not change:** claim extraction (only FINAL accepted proposals
produce claims — identical to v1 for any seed that completes); Tier-1
evidence re-derivation; blinding; judge procedure; all rates, hypotheses,
and κ machinery.

**Why this is not results-contingent:** the aborts prevented ANY results
from existing — the amendment was forced by instrument infeasibility, not
by an undesired number. The live failure evidence (timestamps, error
classes, per-attempt logs) is preserved in `docs/02-measure-run/log.md` and
the git history predating this entry.
