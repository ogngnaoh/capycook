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
| `label_r1` | primary rater's category — empty until labeled |
| `label_r2` | second rater's category — empty; only on double-label rows |
| `double_label` | CSV sheet only: `true` = row is in the seeded R2 subset (dropped on import) |

## Frozen label categories (PREREG §7a — by reference)

`label_r1`/`label_r2` must be exactly one of the five frozen category names —
`grounded-correct` · `grounded-mischaracterized` · `correctly-unverified` ·
`hallucinated` · `opinion-non-checkable` (the wire value for "opinion /
non-checkable"). The definitions, the three rate formulas over the checkable
denominator, and the neither-for-nor-against handling of
`grounded-mischaracterized` live ONLY in [`docs/PREREGISTRATION.md`](../../docs/PREREGISTRATION.md)
§7a — that document is frozen and its text governs; nothing is restated here.
`import-labels` rejects any other value.

## Double-label subset (seeded sampler)

PREREG §6 pins a second labeler on 15–20% of the set. The exporter marks that
subset with a fixed-seed sampler, pinned in `internal/eval/labels.go`:

- **seed `20260706`** (the T1 build-spec date), **target rate 18%** — ~36 of
  the ~200-claim target, inside §6's 30–40 arithmetic;
- **stratified per arm**, minimum one claim per non-empty arm (tiny arms can
  therefore sit outside the band — the band is about the real set);
- deterministic given the claim-id set: ids are sorted per arm before a
  Fisher–Yates draw pinned in our source, so input row order never changes
  the subset.

Seed and rate are part of the instrument: changing either gets a CHANGELOG
entry, never a silent edit.

## Labeling workflow (export → label → import → rates/κ)

1. `go run ./cmd/eval run --arm=all` — the harness exports **UNLABELED**
   claims to `eval/out/claims_<arm>.jsonl` (gitignored).
2. `go run ./cmd/eval export-labels
   --claims eval/out/claims_ungrounded.jsonl,eval/out/claims_flavorgraph.jsonl,eval/out/claims_grounded.jsonl
   --out eval/out/labels.csv` — one labeler CSV sheet, label columns empty,
   double-label subset marked.
3. Label in a spreadsheet: R1 fills `label_r1` on every row; R2 fills
   `label_r2` on `double_label=true` rows only. Category names must match the
   frozen five exactly (use a dropdown/data-validation column).
4. `go run ./cmd/eval import-labels --csv eval/out/labels.csv
   --out eval/out/claims_labeled.jsonl` — validates every label against the
   frozen five (unknown values and `label_r2` outside the marked subset are
   rejected) and writes the labeled-claim JSONL.
5. `go run ./cmd/eval rates --labels …` · `kappa --labels …` · `report` —
   the PREREG §7a rates, Cohen's κ + confusion matrix, and the composed
   report.

Once the labels are real and the benchmark is ratified, the labeled JSONL is
committed **here** with a CHANGELOG entry.
