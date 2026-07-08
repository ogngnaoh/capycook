# Amendment 1 draft — PREREGISTRATION §9 entry text (labeling reframe)

> **THE USER logs this entry; the builder never edits
> `docs/PREREGISTRATION.md`.** Recorded before any eval run — zero eval data
> exists. This file is only the prepared TEXT of the §9 entry; nothing here
> changes the frozen methodology (§3 hypotheses, §7a categories/rate formulas,
> §6 κ bands, §8 analysis rules all stay as written) — it authorizes, by name,
> who and what is allowed to produce a label.

## Paste checklist (the user, before logging)

1. Append the row below to the §9 table in `docs/PREREGISTRATION.md`
   (replacing the `| — | (none) | — |` placeholder row if it is still there).
2. Append the full entry (`### Amendment 1 — 2026-07-08`) below the table,
   inside §9.
3. No other edit to that file, ever — the body above §9 is frozen.
4. Confirm this is still true at paste time: **zero eval data has been
   collected.** If a counted run has already happened, this amendment is
   late and the fact must be logged, not silently backdated.

## Entry text (one row for the §9 amendment-log table)

| Date | Change | Reason |
|---|---|---|
| 2026-07-08 | **Amendment 1 — tiered verification replaces the second human labeler** (full text below the table; summary: deterministic Tier-1 verifier authorized to write machine labels to a new label_tier1 slot; LLM judge (deepseek-v4-flash) authorized as R2; Tier-2 double-label coverage 100% (supersedes §6's 15–20%); κ reported pre-adjudication as author↔judge agreement) | Solo-completion constraint; §6's second labeler assumed a volunteer the project does not have |

## Appended entry (below the table, inside §9)

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
