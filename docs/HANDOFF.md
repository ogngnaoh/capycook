# CapyCook — Session Handoff

_Overwrite each session. Last updated: 2026-07-01._

## Load at session start
- `DESIGN.md` (canonical design, **v0.4**) — the project.
- `docs/PREREGISTRATION.md` (**frozen** eval pre-registration) — hypotheses + arms + outcomes + analysis plan, committed before any run.
- `docs/research/DESIGN-MEMO.md` — cited findings/recommendations from the agent-team review.
- `docs/research/07-pilot-interview.md` — persona-grounding self-interview (Rounds 1–2 complete).
- `docs/research/01–06`, `08` — scout reports, critique, gate review, portfolio recut (background; reference by name).

## Completed this session
- **Wrote + froze `docs/PREREGISTRATION.md`** — the v0 "Scaffold + pre-register" phase's pre-registration half (DESIGN.md §15). Frozen before any eval run: H1 provenance/hallucination (primary), H2 gate dynamics (operator telemetry, explicit N), H3 the openly-hedged grounding ablation (H3a helps-correctness / H3b null-on-creativity); 3 arms with null-interpretability rationale; §8 analysis plan is **descriptive + directional (no NHST)** with 4 pre-committed interpretation rules — including the load-bearing "attribute any correctness win to the deterministic path, not flavor grounding."
- **Resolved one scoring rule at pre-registration:** `grounded-mischaracterized` now gets **its own reported rate** (provenance/honesty · mischaracterization · hallucination = three separate rates), deliberately refining DESIGN.md §9.5 (which had lumped it into "counts for"). More honest + more informative.
- **Locked three doc-design calls:** frozen dedicated doc (not folded into README); descriptive+directional stats; stack-agnostic (no code, no stack — that's the *next* decision).
- Prior sessions (background): portfolio recut → DESIGN.md v0.4 (`8fee659`); v0.3.1 four locked scope decisions (`4291dc8`); agent-team review v0.2→v0.3 (`a20d677`).

## Current state
- `DESIGN.md` = **v0.4**; `docs/PREREGISTRATION.md` = **frozen this session** (see commit that adds it). v0.3.1 recoverable at `4291dc8`; v0.2 at `6794f80`.
- Still **discovery / scaffold phase** — not building app code yet. No milestone/slice structure (deliberately premature). **No stack chosen yet.**
- Pre-registration is DONE; scaffold (eval-harness shell + tracing) is the remaining half of the v0 phase.

## Next session start here (literal first action)
1. **Make the stack decision.** DESIGN.md is deliberately stack-agnostic; the eval-harness skeleton can't start without it. Brainstorm/decide: language + web/stream framework (SSE + cancel endpoint per §8.6), data-model/persistence approach for the version chain + move/gate event log, test runner. This is a real fork — treat it as its own short brainstorm.
2. **Then the eval-harness skeleton** (Pillar 2, P0-B) — the 3-arm shell that runs an empty baseline + tracing that emits a replayable event (v0 exit criterion, §15). Pre-registration (§9 methodology) is already frozen to build against.

## Active concerns
- **The pre-registration is FROZEN.** Any change to the eval methodology must go through `docs/PREREGISTRATION.md` §9 amendment log (dated entry) — never a silent edit. That tamper-evidence is the whole point.
- **R1/R2 threaten P0 scope creep.** Keep v0 to the one deep loop + eval harness; multi-project workspace (R1) and per-project siloed KB (R2) stay P1+ until the loop ships.
- **Second labeler still needed** (§6 / §9.4) — a task-competent friend/labmate (NOT the author, NOT persona-screened) to double-label 15–20% for Cohen's κ. Recruit before the labeling pass, not before the build.
- **Pilot is biased (n=1 author)** — fine under the portfolio reframe; no external user study is owed (v0-scope #4 retired).
- **Tooling gotcha** for agent-team work: spawn disk-writing async agents, not named mailbox teammates — see user memory `agent-team-disk-delivery`.

## Candidate next builds
- **Stack decision** (blocks everything below) — its own short brainstorm.
- Eval-harness skeleton (Pillar 2) — 3-arm shell + tracing; empty baseline; replayable event.
- Milestone/slice setup for Pillar 1 (move/gate machine + version chain) when app-code build begins.
