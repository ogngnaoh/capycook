# CapyCook — Session Handoff

_Overwrite each session. Last updated: 2026-06-30._

## Load at session start
- `DESIGN.md` (canonical design, **v0.3.1**) — the project.
- `docs/research/DESIGN-MEMO.md` — cited findings/recommendations from the agent-team review.
- `docs/research/07-pilot-interview.md` — the in-flight wk-0 persona interview (Round 1 done).
- `docs/research/01–06` — scout reports, critique, gate review (background; reference by name).

## Completed this session
- **Agent-team design review** (research fan-out → critique → synthesis → gated review, PASS on 7/7 criteria). Artifacts in `docs/research/`.
- **Promoted design v0.2 → v0.3** (commit `a20d677`): hero reframed to process metrics; "event-sourced" draft → git-style version chain; live retrieval → P1; new §8.7 safety gate; food-pairing reframed as contested; all citations fact-checked; P0 reshaped around two pillars.
- **Locked 4 v0-scope decisions → v0.3.1** (commit `0d3e44b`): (1) 2nd-cook inter-rater labeling; (2) Western-cuisine subset for v0 demo; (3) safety gate = hard block in v0; (4) wk-0 test = run-to-steer-scope.
- **Started wk-0 pilot interview** (author-as-cook; biased n=1). Round 1 (5 Qs) captured in `07-pilot-interview.md`.

## Current state
- `DESIGN.md` = v0.3.1, committed and clean. v0.2 recoverable at `6794f80`.
- Discovery phase (NOT building yet). No milestone/slice structure created (deliberately — premature).
- Pilot interview Round 1 done; **Round 2 pending**.

## Next session start here (literal first action)
1. Continue the wk-0 pilot — ask the **3 Round-2 follow-ups** listed in `07-pilot-interview.md` (per-project KB contents; cross-project taste learning; "fan out & verify" = trust vs. breadth).
2. Then present the **workbench-vs-ChatGPT stimulus** (carbonara-with-miso, 2 gated moves + a "miso too salty" 2nd iteration) for the author's unfiltered reaction.
3. Once Round 2 validates their shape, **fold R1 (multi-project workspace) + R2 (per-project knowledge base/memory) into `DESIGN.md` §16** as product-vision / P1+ — keep them OUT of P0.

## Active concerns
- **New requirements (R1/R2) threaten P0 scope creep.** Keep v0 to the one deep loop; R1/R2 are P1+ vision until validated. Scope discipline is what the whole review protected.
- **Pilot is biased (n=1 author).** Still owe the real arm's-length 5-cook wk-0 test before heavy build (§14/§15). Needs: a 2nd cook for inter-rater labeling, and ~5 recruits (r/AskCulinary flair-holders, a cooking Discord).
- **Open product decisions still pending** from the memo: benchmark labeler identity; safety-gate edge cases.
- **Tooling gotcha** for agent-team work: spawn disk-writing async agents, not named mailbox teammates (cost several turns this session) — see user memory `agent-team-disk-delivery`.

## Candidate next builds (after discovery wraps)
- Wk-0 user-test kit (recruiting post + mock stimulus + protocol + rubric) — no code.
- Eval-harness skeleton (Pillar 2) — **needs a stack decision first** (design is stack-agnostic).
- Milestone/slice setup for Pillar 1 (move/gate machine + version chain) when build begins.
