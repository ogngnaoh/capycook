# Handoff — milestone 02 (measure-run)

## Next session start here
Author task first, no Claude needed: **blind-label the Tier-1 control sample** —
open `eval/out/blind_check.csv` (18 rows, arms hidden), fill the label column per
the §7a rubric, do NOT open `blind_check_map.csv` until done. Then score it:
`go run ./cmd/eval blind-check-score --csv=eval/out/blind_check.csv --map=eval/out/blind_check_map.csv --claims=eval/out/claims_all.jsonl`.
Then execute the S6 plan (pointer in milestone.md) — S6 has NO other labeling
work: Tier-2 is empty (see Active concerns).

## Current state
- Branch `measure-run`, **not pushed** (D7 holds all pushes until Results fill). Tree clean.
- S1–S5 shipped. S5 (2026-07-10): 562 live claims (150/203/209), 12/13 seeds per
  arm (bench-12 blocked symmetrically, allergen-unresolved), Tier-1 100%
  everywhere, $0.87 of $2 spent, 220 traces in Langfuse. Artifacts + backups in
  `eval/out/` + `eval/out/live-backup-2026-07-09/` (gitignored — do not delete;
  a re-run re-spends and re-rolls the data).
- PREREGISTRATION §9 now carries Amendment 2 (bounded move retries) + T1 re-pin
  at `32afe54` (user-delegated paste 7dd5c51). §1–§8 byte-unchanged.
- Eval CLI hardened this session: Langfuse tracing (--live only), 660s move
  timeout, 5-attempt strict/fallback alternation, per-attempt + payload-snippet
  logging, runner retry/skip machinery. All fresh-context reviewed.

## Active concerns
- **Zero Tier-2 claims** (milestone note (h)): R1 sheet + judge R2 vacuous,
  κ has no rows — S6's Results section must report this plainly per §8 (frozen
  machinery met unexpected data shape; never fabricate or dress up).
- Citation uptake low (10/209, 10/203, 0/150): H1 contrast rests on few
  citation-bearing claims — findings paragraph owns it.
- bench-12 un-runnable as generated (allergen-unresolved in all arms/rolls):
  S6 writeup item; denominators are 12/13 seeds.
- H2 operator-session count unchecked this session — run `eval replay` while
  executing S6 (rough floor ~8 sessions).
