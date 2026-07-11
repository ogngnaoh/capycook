# Handoff — milestone 02b (behavior-contract)

## Next session start here
B1 docs + spec + contract DRAFT are complete and committed (66 criteria: 56 assert /
10 judge, areas A–J; the four 2026-07-11 gaps are encoded as [FAILS TODAY] criteria
A-3, A-4, B-3, B-4, plus F-3/I-2 expected fails). **The USER ratification gate has
NOT happened** — the contract is a draft until the user ratifies it. On
ratification: commit any edits, record the pin hash in `milestone.md`, then start
B2 (oracle harness). Do not start B2 before ratification.

## Current state
- Branch `measure-run`; 02b inserted into `docs/milestones.md` (02's S8 paused
  behind 02b). No code changed yet — docs only.
- Plan of record: `docs/superpowers/specs/2026-07-11-behavior-contract-oracle-loop-design.md`
  (expanded from the ratified session plan of 2026-07-11).
- Known UX gaps the contract must cover: IntentBar silent empty no-op
  (`web/src/components/IntentBar.tsx:32`), no auto first pass, rationale replayed
  only post-completion (`internal/transport/hub.go`), focus-on-Stop Enter trap
  (`Workbench.tsx` focusDecision). Verified 2026-07-11: no auto-cancel bug exists.
- S8 pre-publish audit already passed (no-key grep, tests/vet, freeze diff empty,
  §9 intact) — carries over; S8 resumes after 02b ships.

## Open concerns
- Contract must stay falsifiable: every criterion needs a check recipe the oracle
  can actually run; no dead criteria (area J guards this).
- Oracle must never touch `data/capycook.db` (H2 operator events) — fresh temp DBs
  only; record the operator event count before B2 starts.
- Langfuse OTLP 401 (since 2026-07-11) is out of scope — user checks keys/host.
