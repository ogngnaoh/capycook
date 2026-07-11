# Handoff — milestone 02b (behavior-contract)

## Next session start here
B1 docs + spec + contract DRAFT are complete. The contract survived a 49-round
fresh-context adversarial review loop (UX home-cook + WCAG 2.2 AA critic personas,
each round a fresh agent, every finding code-verified before folding in): grew
66 → 109 criteria (99 assert / 10 judge), final verdict APPROVE (round 49, nits
only). The review loop itself surfaced real product bugs beyond the original four
(silent wrong-shape take-over commit, partial-alternatives premature gate,
override "Go back" discarding typed edits, typed-input discard on failure ×3,
AA contrast failures measured in tokens.css) — all encoded as [FAILS TODAY]
criteria. **The USER ratification gate has NOT happened** — the contract is a
draft until the user ratifies it; two criteria are explicitly flagged
⚖ RATIFICATION DECISION (BC-C-26 in-app safety disclaimer, BC-D-12 persisted
move rationale). On ratification: commit any edits, record the pin hash in
`milestone.md`, then start B2. Do not start B2 before ratification.

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
