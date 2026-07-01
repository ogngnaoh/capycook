# CapyCook — Session Handoff

_Overwrite each session. Last updated: 2026-06-30._

## Load at session start
- `DESIGN.md` (canonical design, **v0.4**) — the project.
- `docs/research/DESIGN-MEMO.md` — cited findings/recommendations from the agent-team review.
- `docs/research/07-pilot-interview.md` — persona-grounding + requirements-elicitation self-interview (Rounds 1–2 complete).
- `docs/research/01–06` — scout reports, critique, gate review (background; reference by name).

## Completed this session
- **Completed the wk-0 pilot interview (Round 2)** and folded R1 (multi-project workspace) + R2 (per-project **siloed** KB, all four memory types) into `DESIGN.md §16.1` as P1+ vision.
- **Reframed the project** to a self-built portfolio/resume app with **no market-validation goal** — the author is the spec (see memory `capycook-portfolio-not-product`).
- **Portfolio-lens agent-team re-cut → `DESIGN.md` v0.4.** Team: 4 domain reviewers → adversarial Critic → synthesizer → builder → fidelity reviewer. Re-judged all 48 design decisions (**41 KEEP / 2 REVISE / 4 REFRAME / 1 DROP / 0 KILL**); Reviewer PASS on AC6–AC9. Audit trail: `docs/research/08-portfolio-recut.md`.
- **Key v0.4 changes:** market frame removed (wk-0 study dropped → pre-registration; locked-#4 retired); **`cost`≠USDA honesty fix** (FDC has no price data) propagated to 8 spots; eval gate-dynamics relabeled as operator/autobiographical-design telemetry (n=1-honest); inter-rater check re-scoped to eval-credibility; safety-gate motivation → engineering signal. Zero P0 build creep; R1/R2 stay P1+.
- Prior sessions (background): agent-team review v0.2→v0.3 (`a20d677`); 4 locked v0-scope decisions → v0.3.1 (`0d3e44b`, decision #4 since retired).

## Current state
- `DESIGN.md` = **v0.4**, committed to `master` this session. v0.3.1 recoverable at `4291dc8`; v0.2 at `6794f80`.
- Discovery phase (NOT building yet). No milestone/slice structure created (deliberately — premature).
- Pilot interview Rounds 1–2 done; portfolio reframe locked; all 48 design decisions re-cut + verified.

## Next session start here (literal first action)
1. Round 2 of the pilot interview is **already complete** (see `docs/research/07-pilot-interview.md`) and R1/R2 are already folded into `DESIGN.md` §16.1 — the prior version of this list was stale and is now corrected.
2. `DESIGN.md` is now **v0.4** (portfolio-lens recut applied — see its own changelog). No external wk-0 user test is planned.
3. Next build action: write the **README pre-registration doc** (methodology + hypothesis, before any eval run) per the v0.4 §15 "Scaffold + pre-register" phase.

## Active concerns
- **New requirements (R1/R2) threaten P0 scope creep.** Keep v0 to the one deep loop; R1/R2 are P1+ vision until validated. Scope discipline is what the whole review protected.
- **Pilot is biased (n=1 author).** No external study is owed under the portfolio reframe — the arm's-length recruiting instrument is retired, not deferred. The 2nd labeler for inter-rater labeling (§9.4) is a separate, still-needed person — recruited for eval-credibility, not as a market/user-study proxy.
- **Open product decisions still pending** from the memo: benchmark labeler identity; safety-gate edge cases.
- **Tooling gotcha** for agent-team work: spawn disk-writing async agents, not named mailbox teammates (cost several turns this session) — see user memory `agent-team-disk-delivery`.

## Candidate next builds (after discovery wraps)
- **README pre-registration doc** — methodology + hypothesis, before any run — no code.
- Eval-harness skeleton (Pillar 2) — **needs a stack decision first** (design is stack-agnostic).
- Milestone/slice setup for Pillar 1 (move/gate machine + version chain) when build begins.
