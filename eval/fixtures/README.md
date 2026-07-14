# eval/fixtures/ — versioned benchmark set + eval instruments

The git-tracked source of truth for the benchmark set, the eval instruments,
and (once labeling has happened) the labeled-claim files — PREREGISTRATION §6:
the eval fixture gets the same versioning discipline as the dish draft. Every
change to this directory is logged in `CHANGELOG.md`.

**HYGIENE RULE: no synthetic or example data ever lands in `eval/fixtures/`.
Synthetic test fixtures live in `internal/eval/testdata/` — only there. Label
values in this directory may only ever be real human-rater output; they are
never pre-filled, demoed with plausible values, or "example-filled".**

## Contents

- `move_script.json` — the fixed, versioned 5-move script + auto-accept policy
  every benchmark seed runs identically per arm (plan 4.3). An instrument, not
  data.
- `seeds.json` — **absent until Gate C.** Benchmark seeds are drafted in
  `docs/01-end-to-end/proposed-benchmark-seeds.json` and copied here only
  after user ratification, with a CHANGELOG entry.
- labeled-claim JSONL — **absent until labeling.** Committed here only once a
  human-labeled sheet has been imported (workflow below), with a CHANGELOG
  entry.

## Label schema (plan 4.6)

One claim per JSONL line / CSV row:

| column | meaning |
|---|---|
| `claim_id` | unique id minted by the harness export |
| `arm` | `ungrounded` \| `flavorgraph` \| `grounded` (PREREG §4) |
| `dish` | benchmark seed id the claim came from |
| `text` | the claim (spec §7 claim unit: `flavor_rationale[].claim` + `unverified[]` entries) |
| `source` | cited provenance; empty = the claim surfaced `[unverified]` |
| `label_tier1` | machine-written by the Tier-1 verifier (PREREG §9 Amendment 1); never set by raters |
| `label_r1` | primary rater's (the author's) category — empty until labeled |
| `label_r2` | the LLM judge's category — empty; only on double-label rows |
| `double_label` | CSV sheet only: `true` on every Tier-2 row (100% double-label coverage, PREREG §9 Amendment 1); dropped on import |

## Frozen label categories (PREREG §7a — by reference)

`label_r1`/`label_r2` must be exactly one of the five frozen category names —
`grounded-correct` · `grounded-mischaracterized` · `correctly-unverified` ·
`hallucinated` · `opinion-non-checkable` (the wire value for "opinion /
non-checkable"). The definitions, the three rate formulas over the checkable
denominator, and the neither-for-nor-against handling of
`grounded-mischaracterized` live ONLY in [`docs/PREREGISTRATION.md`](../../docs/PREREGISTRATION.md)
§7a — that document is frozen and its text governs; nothing is restated here.
`import-labels` rejects any other value.

## Tier-2 coverage & R1 blinding (PREREG §9 Amendment 1)

PREREG §6's second labeler — a seeded sampler drawing 15–20% of the set — is
**superseded**. Tier-2 double-label coverage is now **100%**: every claim the
Tier-1 verifier could not settle (`label_tier1` empty) gets both `label_r1`
(the author) and `label_r2` (the LLM judge, DeepSeek `deepseek-v4-flash`,
prompted with the §7a rubric, seeing claim text + source only — never the
arm). There is no sampler and no rate left to pin; `double_label` on the CSV
sheet is simply `true` on every Tier-2 row.

Amendment 1 also requires the author's R1 pass to be **blind to the arm** —
but `claim_id` embeds the arm (`clm-<arm>-<seed>-<n>`), so R1 is exported as
a separate blind sheet instead of the plain labeler CSV (`internal/eval/blind.go`):

- `export-labels --blind` writes a blind sheet — columns `blind_id, dish,
  text, source, label_r1`, **no `arm`, no `claim_id`** — in a seeded-shuffled
  row order (seed `20260708`), plus a sidecar `blind_id`→`claim_id` map.
  **Do not open the map until R1 labeling is done** — that is the entire
  point of the blind pass.
- This is *partial* blinding, by design: `text`/`source` can still leak the
  arm content-wise (a citation-bearing claim can give itself away); only the
  structural leak — an `arm`/`claim_id` column, or the id itself — is closed.
- `import-labels --blind --map=<file> --claims=<jsonl,...>` rejoins the
  filled blind sheet back onto the original claims (validating every
  `label_r1` against the frozen five) and writes the labeled-claim JSONL.

**Verifier↔author blind-check sample** — Amendment 1's control on the Tier-1
verifier's residual risk (a citation-resolution check can miss compound-level
or other content-layer errors): `blind-check --claims=<jsonl>` draws a seeded
sample of Tier-1-labeled claims (`label_tier1` non-empty), stratified
round-robin per arm, exported as a blind sheet with `label_tier1` withheld —
seed `20260709`, capped at 18 claims. The author blind-labels it the same
way; `blind-check-score --csv=<file> --map=<file> --claims=<jsonl>` compares
the filled sheet's `label_r1` back against `label_tier1` and reports
verifier↔author agreement + confusion counts.

Seeds and the cap are part of the instrument: changing any of them gets a
CHANGELOG entry, never a silent edit.

## Labeling workflow (export → label → import → rates/κ)

1. `go run ./cmd/eval run --arm=all` — the harness exports **UNLABELED**
   claims to `eval/out/claims_<arm>.jsonl` (gitignored).
2. `go run ./cmd/eval export-labels --blind
   --claims eval/out/claims_ungrounded.jsonl,eval/out/claims_flavorgraph.jsonl,eval/out/claims_grounded.jsonl
   --out eval/out/labels_blind.csv --map eval/out/labels_blind_map.csv` — the
   blind R1 sheet plus its sidecar map (do not open the map yet).
3. Label in a spreadsheet: the author (R1) fills `label_r1` on every row,
   blind to the arm. Category names must match the frozen five exactly (use
   a dropdown/data-validation column).
4. `go run ./cmd/eval import-labels --blind
   --csv eval/out/labels_blind.csv --map eval/out/labels_blind_map.csv
   --claims eval/out/claims_ungrounded.jsonl,eval/out/claims_flavorgraph.jsonl,eval/out/claims_grounded.jsonl
   --out eval/out/claims_labeled.jsonl` — rejoins the blind sheet via the
   map, validates every `label_r1` against the frozen five, and writes the
   labeled-claim JSONL. (`label_r2` is written by the LLM judge separately,
   PREREG §9 Amendment 1.)
5. `go run ./cmd/eval rates --labels …` · `kappa --labels …` · `report` —
   the PREREG §7a rates, Cohen's κ + confusion matrix, and the composed
   report.

Once the labels are real and the benchmark is ratified, the labeled JSONL is
committed **here** with a CHANGELOG entry.
