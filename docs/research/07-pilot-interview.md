# Wk-0 Pilot — Persona Interview (Round 1)

> **Status: PILOT / BIASED, n=1.** The subject is the project's **author**, who is also a real member of the target persona (serious home cook). This is NOT the wk-0 go/no-go signal — the author cannot be the validation subject (maximal investment + curse of knowledge). It serves two legitimate purposes: (a) **persona-grounding** from a real cook, and (b) a **protocol pilot** to debug the stimulus/questions before recruiting ~5 arm's-length cooks. Findings here are a clearly-labeled, known-biased data point.
> Date: 2026-06-30. Un-primed: questions asked about real behavior *before* showing any of the design.

## Round 1 — questions & answers

1. **Last time you developed/modified a dish?** — Just yesterday. (Active, frequent dish development — persona confirmed.)
2. **Where does an LLM fit today / where does it fall short?** — Uses Claude for inspiration and quick reference. But for *serious* iteration, wants "agentic tools to fan out and verify and search against dedicated DBs — basically an agentic tool entirely focused on recipe refinement and development"; believes this would make output quality "much higher."
3. **How do you iterate / track versions?** — Talks with the agent; when context gets cluttered, **clears it or opens a new Claude chat.** (→ current workflow destroys iteration history.)
4. **Do you care about the "why"?** — Cares "a lot"; needs a **concise explanation with sources included.**
5. **Ever abandoned iterating due to hassle?** — Yes. Wants "an organized space to create new dishes/projects," where each project can **spawn agents to iterate** on that dish and **build a knowledge base** from the discussion, **retaining important info over time** so each project becomes "different and nuanced from further discussions and refinements."

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

## Pending — Round 2 (next session starts here)

Three follow-ups to sharpen R2/R1, then show the stimulus:
1. **Per-project KB — what must persist?** What you tried *and rejected, and why*; taste calls; constraints; trusted citations; post-cook feedback — "what would you be angry to lose a week later?"
2. **Cross-project learning** — should the system learn general taste across projects (profile-level memory) or keep each project siloed? (Decides where "memory" lives.)
3. **"Fan out and verify"** — value mostly *checking claims against sources* (trust) or generating *more diverse options* (breadth)? (Verification depth vs. ideation breadth first.)

Then: present the **workbench-vs-ChatGPT stimulus** (carbonara-with-miso, 2 gated moves + a 2nd iteration "miso too salty") for unfiltered reaction.

## Scope discipline
R1/R2 are exciting but bigger than the "one deep loop" v0. Keep them OUT of P0; log as product-vision / P1+ in DESIGN.md §16 **after** the Round-2 follow-ups validate their shape. Do not let them balloon P0 — scope discipline is what the whole review fought for.
