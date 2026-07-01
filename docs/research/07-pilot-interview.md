# Wk-0 Pilot — Persona Interview (Rounds 1–2, complete)

> **Status: PILOT / BIASED, n=1.** The subject is the project's **author**, who is also a real member of the target persona (serious home cook). Under the portfolio-lens reframe there is no market to validate and no external study owed — this file's value is (a) **persona-grounding** from a real cook, and (b) a **protocol pilot** that shaped the requirements-elicitation questions. Findings here are a clearly-labeled, known-biased data point.
> Date: 2026-06-30. Un-primed: questions asked about real behavior *before* showing any of the design.

## Round 1 — questions & answers

1. **Last time you developed/modified a dish?** — Just yesterday. (Active, frequent dish development — persona confirmed.)
2. **Where does an LLM fit today / where does it fall short?** — Uses Claude for inspiration and quick reference. But for *serious* iteration, wants "agentic tools to fan out and verify and search against dedicated DBs — basically an agentic tool entirely focused on recipe refinement and development"; believes this would make output quality "much higher."
3. **How do you iterate / track versions?** — Talks with the agent; when context gets cluttered, **clears it or opens a new Claude chat.** (→ current workflow destroys iteration history.)
4. **Do you care about the "why"?** — Cares "a lot"; needs a **concise explanation with sources included.**
5. **Ever abandoned iterating due to hassle?** — Yes. Wants "an organized space to create new dishes/projects," where each project can **spawn agents to iterate** on that dish and **build a knowledge base** from the discussion, **retaining important info over time** so each project becomes "different and nuanced from further discussions and refinements."

## Round 2 — questions & answers

Asked one-per-tool to avoid inter-question anchoring; then the stimulus.

1. **Per-project KB — what must persist?** — **All four selected** (nothing added): rejected attempts + why · taste calls · trusted citations · post-cook feedback. → the KB is *all four* memory types; genuinely richer than today's `iteration_log`.
2. **Cross-project learning vs. siloed?** — **Per-project silo.** Explicitly rejected profile-level / cross-project taste learning. → no global taste model; memory lives inside each project. Cheaper than R1, and removes an over-generalization failure class.
3. **"Fan out and verify" — trust vs. breadth?** — rejected both framings (via Other): _"it should be quick so maybe a single agent but with specialized access to a food embedding model or food db makes more sense."_ → **latency beat the swarm**; resolves to the P0 single-agent + DB-access architecture (§8.4). The author walked back their own Round-1 "fan out" phrase — a protocol-pilot win.

**Stimulus — workbench vs. ChatGPT** (miso carbonara: 2 gated moves + a "miso too salty" 2nd iteration where the system reasons against the exact cooked version, recomputes sodium deterministically, and logs the salt problem so it's never re-proposed). Reaction: **"Payoff earns the friction"** — the iteration-2 durability/trust is worth the shot-1 gate friction, *even given the speed-first instinct from Q3*. (Still biased-author; sharpens the bet, doesn't prove it.)

## Synthesis

**Strong validations (maps to current design):**
- **The wedge (§3.2)** — author independently splits "quick reference" (raw Claude) vs. "serious iteration with dedicated agentic tooling." (Q2)
- **Durability is the real edge (§3.2 steelman, §8.3)** — "clear context / open a new chat" means today's tool *destroys* iteration history. This confirms the product-UX scout's hypothesis that durability/resumability — not flavor grounding — is the edge over ChatGPT. (Q3)
- **Provenance is non-negotiable (§7.3, §8.2 citations, §9.1 hero metric)** — "concise explanation with sources" is exactly the provenance-attaching grounding + the reframed hero metric (claim-provenance rate). (Q4)
- **Abandonment from disorganization (§5 JTBD, develop-over-days)** — confirmed. (Q5)

**Two NEW requirements that extend the design (not yet in v0.3.1; capture as product-vision / P1+):**
- **R1 — Multi-project workspace.** "An organized space to create new dishes/projects." The design currently centers a single dish draft; the author wants a portfolio of projects.
- **R2 — Per-project accumulating knowledge base / long-term memory.** "Retaining important info over time that makes each project nuanced." Richer than the current `iteration_log` + user profile — a per-project KB that personalizes the agent's context as a project matures.

**Honest nuance (kept for intellectual-honesty signal):** the author's instinct — "fan out, verify, search a dedicated DB" — is the right quality lever, but the research (`02-culinary.md`, `04-market-feasibility.md`) shows the *trustworthy* lift comes mostly from verifying against **deterministic** sources (nutrition/cost/identity) + provenance, NOT from the flavor-pairing DB (culturally biased, contested). Expectation to set: the felt quality jump is "every number/claim is trustworthy and nothing gets lost," not "the flavor science is magic."

## Round 2 outcome (done 2026-06-30)
Both rounds complete. R1 (multi-project workspace) + R2 (per-project siloed KB, all four memory types) folded into **`DESIGN.md §16.1`** as P1+ product-vision — kept OUT of P0. The "fan out" ambition collapsed into the existing P0 single-agent architecture (§8.4), so it added no new requirement. P0 stays the one deep gated loop + eval harness.

## Scope discipline (held)
R1/R2 are exciting but bigger than the "one deep loop" v0 — they are logged as P1+ vision in §16.1, not P0. Scope discipline held; the review's core win is intact. **No external study is owed.** Under the portfolio reframe there is no market to validate, so the arm's-length recruiting instrument is retired, not deferred. This file's value stands on its own two purposes: (a) persona-grounding, (b) a requirements/protocol pilot. The **2nd labeler** (`DESIGN.md` §9.4) survives independently on eval-credibility grounds — "who checked the person grading their own homework?" — not as part of a user study, and is a separate person from this pilot's subject.
