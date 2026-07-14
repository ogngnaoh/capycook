> **HISTORICAL — LANDED.** This paste draft is retained for provenance only.
> Its amendment is already recorded in `docs/PREREGISTRATION.md`; do not paste
> it again.

# §9 draft — Amendment 3 (author-delegated LLM rater for the blind-check control)

**USER-PASTE ONLY — the builder never edits `docs/PREREGISTRATION.md`.**
Paste the table row into the §9 table and the full-text section below the
existing Amendment 2 text. Before pasting, verify the map is still sealed:
`stat -f '%Sm' eval/out/blind_check_map.csv` → `Jul 10 00:02:50 2026`
(builder-verified 2026-07-10, before any scoring).

---

## Table row (paste into the §9 table)

```
| 2026-07-10 | **Amendment 3 — author-delegated LLM rater for the Tier-1 blind-check control** (full text below the table; summary: Amendment 1's "author blind-labels" verifier-validation pass may be executed by a fresh-context LLM agent acting as the author's delegate, labels adopted by the author; rater of record for the 2026-07-10 control: Claude (Fable 5), isolated worktree, blinded sheet + frozen §7a rubric only; agreement reported as verifier↔LLM-delegate, never as human validation) | Solo-completion constraint: the author delegated the last human-labeling pass rather than perform it. Recorded before the scorer ran so the control's rater identity is stated honestly instead of presenting delegated labels as the author's hand-labeling; see the outcome-knowledge note in the full text. |
```

## Full-text section (paste below the Amendment 2 text)

```
### Amendment 3 — 2026-07-10

**Recorded after the delegated rater filled the sheet but before the scorer
ran; the blind_id→claim_id map has never been opened (file mtime unchanged
since export).** This amendment changes the rater identity of Amendment 1's
"Verifier validation" bullet only. Every category definition and rate
formula (§7a), hypothesis (§3), κ band (§6), §8 prescribed action, the
Tier-1 rules, and the R2 judge procedure stay frozen as written.

**What changes:**

- **Delegated rater authorized (blind-check only).** Amendment 1's
  verifier-validation pass ("Author blind-labels a seeded sample…") may be
  executed by an LLM agent acting as the author's delegate, its labels
  adopted by the author as their submission. Rater of record for the
  2026-07-10 control: a fresh-context Claude agent (Claude Fable 5) in an
  isolated worktree, given only the blinded sheet, the frozen §7a category
  table, and mechanical labeling rules; it never saw the
  blind_id→claim_id map, the claims files, the run logs, or telemetry.
- **Reporting rule.** The agreement figure is verifier↔LLM-delegate
  agreement. It is never reported as human validation of the machine
  labels; every mention names the rater, and the model-validates-machine
  weakness accompanies the figure wherever it appears. Partial mitigation,
  stated for what it is: the delegate is from a different model family
  than the DeepSeek generator and judge, so same-family self-preference is
  not in play for this control.

**Sequence and outcome-knowledge, stated plainly:** the sheet (18 rows,
stratified per arm, seed 20260709) was exported 2026-07-10 00:02 and its
map sealed; the delegated rater filled it 13:45 the same day; the filled
sheet was integrity-verified against the sealed original (dish/text/source
byte-identical; labels within the frozen vocabulary: 15 correctly-unverified,
3 opinion-non-checkable). Because every sampled row's source is empty, the
Tier-1 side of the comparison is derivable in advance (empty source →
correctly-unverified), so the agreement figure (15/18) is knowable before
the scorer runs — this entry is recorded for rater-identity honesty, not
outcome-blindness, and claims no pre-outcome status.

**Why:** the author chose to delegate the final human-labeling pass under
the same solo-completion constraint that motivated Amendment 1, and adopts
the delegate's labels. The alternative — presenting delegated labels as the
author's own hand-labeling — would be a false methodology claim; this entry
replaces it with a true one.
```
