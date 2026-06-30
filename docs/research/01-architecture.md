# Architecture Scout Report — Dish Development Workbench (DESIGN.md v0.2)

Calibration used throughout: this is a **portfolio flagship**, judged on (a) does it read as real systems engineering vs. an API wrapper, (b) is it honest, (c) is it buildable solo in one semester. Market defensibility is explicitly out of scope.

## Strengths (senior-signal)

- **The human gate as a structural property, not a prompt instruction.** Making "no autonomous ship" a state-machine invariant — a move literally cannot write the draft without a verb — is exactly the pattern Anthropic's own agent guidance recommends: checkpoints before consequential actions, with the orchestrator unable to proceed without external input ([Building Effective AI Agents](https://www.anthropic.com/research/building-effective-agents)). It also mirrors Temporal's signal-based human-approval-gate pattern, where a workflow blocks until an external signal arrives ([Temporal HITL cookbook](https://docs.temporal.io/ai-cookbook/human-in-the-loop-python)). This is the single strongest "not a wrapper" component in the doc.
- **The deterministic/generative split is the cleanest, cheapest, highest-signal boundary here.** Plain functions for scaling/cost/nutrition, no LLM in the arithmetic path — low build cost, directly testable, and a real production pattern, not invented for the demo.
- **Borrowing FoodPuzzle's actual published benchmark** (Molecular Food Prediction / Molecular Profile Completion, 978 foods / 1,766 molecule profiles, KDD'25) rather than inventing a task demonstrates literature fluency and gives the eval a real external anchor ([arXiv:2409.12832](https://arxiv.org/abs/2409.12832), [ACM DL](https://dl.acm.org/doi/10.1145/3711896.3737384)).
- **Six-verb gate vocabulary (accept · edit · regenerate · alternatives · redirect · take-over)** is a recognizable, well-precedented pattern, not invented from nothing: it's structurally the same accept/reject/edit-diff loop shipped in Cursor and GitHub Copilot's agent modes ([comparison overview](https://www.codingmoney.com/blog/mastering-ai-coding-agents-a-practical-guide-to-github-copilot-and-cursor/), [DataCamp](https://www.datacamp.com/blog/cursor-vs-github-copilot)), applied to a new domain.
- **Willingness to lead with a null/modest ablation result** is unusual intellectual honesty and is the kind of rigor that reads well in a FAANG loop — it matches the controlled-study norms used in current RAG hallucination-benchmarking work (fixed labeled set, documented rubric before running) ([RAG hallucination benchmark study](https://arxiv.org/html/2605.11330)).

## Weaknesses & risks

- **[High] Event sourcing is disproportionate to the actual requirement.** The doc's own acceptance criteria for §8.3 (undo, diff, branch, develop-over-days, iterate-against-cooked-version) don't require true event sourcing — they require *versioning*. Real event sourcing carries event schema versioning/upcasters, snapshotting, and projection-rebuild discipline that practitioners explicitly flag as overkill for a single bounded domain run solo ("most domains are not that complex, while event sourcing is very complex") — [Event Sourcing for Normal People](https://medium.com/@b.lizdias/event-sourcing-for-normal-people-when-it-helps-vs-when-its-overkill-0072848208ba), [Event Sourcing on a Complexity Budget](https://antman-does-software.com/event-sourcing-on-a-complexity-budget). Notably, git itself is a real-world, well-understood instance of "event sourcing" without any of that CQRS apparatus ([git as event sourcing](https://dev.to/devcorner/git-as-an-event-sourced-system-understanding-event-sourcing-through-git-271p)) — that's the cheaper model to actually build.
- **[High] Hybrid retrieval (3 distinct sources, toggleable, provenance-attaching) is squeezed into the same 5-week "spine" window as 8 other P0 items** (wk 2–6 covers P0-1…P0-7, P0-9). A live-literature retrieval pipeline (query construction, source fetch, citation extraction, ranking/fusion against the FlavorGraph signal) is a multi-week subsystem on its own even before fusion with graph + deterministic signals ([Hybrid RAG architecture](https://atlan.com/know/hybrid-rag/), [GraphRAG at scale](https://arxiv.org/html/2507.03226v3)). The roadmap doesn't budget it separately from the rest of the spine.
- **[Medium] "Interruptible, checkpointed, cancellable" implies durable-execution guarantees the design doesn't disclose it's declining.** Frameworks like LangGraph give you checkpoint/resume, not failure detection, watchdogs, or crash recovery — "checkpointing says *I saved your state*; durable execution says *your workflow will run to completion*" ([Diagrid: checkpoints ≠ durable execution](https://www.diagrid.io/blog/checkpoints-are-not-durable-execution-why-langgraph-crewai-google-adk-and-others-fall-short-for-production-agent-workflows)). For a single-tenant demo this gap is fine to accept — but the doc should say so explicitly, or a reviewer who knows the distinction will read it as a gap rather than a choice.
- **[Medium] Single-rater human labeling for the eval harness.** No inter-rater reliability check is mentioned for the hand-labeled benchmark set that the "hero artifact" depends on — undercuts the rigor claim cheaply fixable.
- **[Low] Autonomy dial (P1) is described inside the P0 state-machine section (§8.2)** — risk of scope bleed if not fenced off explicitly.
- **[Low] Transport is left as "SSE + control channel, or WebSockets"** — both are defensible, but leaving it open reads as undecided rather than a deliberate trade-off in a doc whose whole thesis is "the engineering is the point."

## Over-engineering

- **Full event-sourced + CQRS draft store** for what is, functionally, one document per session with linear/branching history — see High-risk item above. A snapshot+diff version chain with parent pointers (the git model) gets identical user-facing guarantees for materially less build and debug surface.
- **A separate graph database for FlavorGraph** is implied by "embedding + graph stores" in §8.6, but FlavorGraph is described as "one grounding signal (pairing embeddings)" — i.e., a vector similarity lookup, not multi-hop graph traversal. Unless multi-hop pairing reasoning is actually planned, a flat vector index is sufficient and removes an entire infra component.
- **Three named, individually-toggleable grounding arms** (FlavorGraph-only / hybrid / ungrounded) adds an extra arm of build, instrumentation, and analysis for a comparatively low-signal middle data point: FoodPuzzle's own finding ("live retrieval beats static-index RAG") already telegraphs that the FlavorGraph-only arm will likely underperform hybrid — worth keeping as a stretch ablation, not core P0 surface.

## Under-engineering / gaps

- **No idempotency story for "accept."** What happens on a double-click accept, or an accept racing a redirect? Given how carefully the state machine is specified elsewhere, this is a real correctness gap, not a nitpick.
- **"Take-over" isn't reconciled with the version log.** Does a manual cook edit emit a synthetic diff/event so the history stays complete, or does it create an untracked gap in provenance? One sentence would close this.
- **Tracing is filed under NFRs (§12) but is a hard dependency of the eval harness** (§12 itself says tracing "also feeds evals"). Given P0-10 (eval harness) can't function without it, tracing should be promoted into the P0 list explicitly rather than left "P0-adjacent."
- **No versioning of the benchmark set itself** — ironic given the draft gets full version history; the eval's "fixed benchmark set" should get the same discipline (even a simple git-tracked fixture file with a changelog) so claims about reproducibility hold up under scrutiny.

## Comparable patterns & sources

| Pattern in design | Real-world comparable | Source |
|---|---|---|
| Mandatory human gate / no autonomous ship | Anthropic agent checkpoints; Temporal signal-based approval | [anthropic.com/research/building-effective-agents](https://www.anthropic.com/research/building-effective-agents), [Temporal HITL](https://docs.temporal.io/ai-cookbook/human-in-the-loop-python) |
| Interrupt/resume move loop | LangGraph `interrupt()` + checkpointer | [LangGraph interrupts docs](https://docs.langchain.com/oss/python/langgraph/interrupts) |
| Checkpointing vs. true durable execution | Diagrid critique of LangGraph/CrewAI/ADK | [diagrid.io](https://www.diagrid.io/blog/checkpoints-are-not-durable-execution-why-langgraph-crewai-google-adk-and-others-fall-short-for-production-agent-workflows) |
| Lightweight durable execution for solo/small teams | DBOS (Postgres-embedded library), Inngest (no worker fleet) | [DBOS vs Temporal](https://www.dbos.dev/compare/compare-dbos-vs-temporal-dbos), [Inngest vs Temporal](https://www.inngest.com/compare-to-temporal) |
| Six-verb accept/edit/regenerate gate | Cursor / Copilot agent diff review | [Coding agents 2026 overview](https://www.codingmoney.com/blog/mastering-ai-coding-agents-a-practical-guide-to-github-copilot-and-cursor/) |
| SSE for token streaming, separate cancel channel | OpenAI/Anthropic SSE choice; WS only needed for bidirectional interrupt | [websocket.org AI guide](https://websocket.org/guides/websockets-and-ai/), [Hivenet SSE vs WS](https://www.hivenet.com/post/llm-streaming-sse-websockets) |
| Real cost of "cancellable, resumable" streaming | Per-token DB writes, separate cancel-marker store, polling | [zknill: SSE token streaming wasn't easy](https://zknill.io/posts/everyone-said-sse-token-streaming-was-easy/) |
| Shared artifact multiple agents read/write | Blackboard architecture (Hearsay-II lineage) | [Blackboard architecture overview](https://callsphere.ai/blog/blackboard-architecture-multi-agent-systems-shared-knowledge-spaces) |
| Hybrid graph+vector retrieval with fusion | Production HybridRAG / GraphRAG patterns | [Atlan Hybrid RAG](https://atlan.com/know/hybrid-rag/), [GraphRAG at scale](https://arxiv.org/html/2507.03226v3) |
| Live retrieval beating static-index RAG (domain-specific) | FoodPuzzle (KDD'25) | [arXiv:2409.12832](https://arxiv.org/abs/2409.12832) |
| Git as a simpler event-sourcing-equivalent model | Branch/diff/undo without CQRS projections | [Git as event-sourced system](https://dev.to/devcorner/git-as-an-event-sourced-system-understanding-event-sourcing-through-git-271p) |
| Event sourcing complexity tax for solo/simple domains | Practitioner consensus against ES-for-CRUD-shaped problems | [Event Sourcing for Normal People](https://medium.com/@b.lizdias/event-sourcing-for-normal-people-when-it-helps-vs-when-its-overkill-0072848208ba) |

## Feasibility verdict: **rescope, not no**

The four load-bearing pillars — gated state machine, versioned/branchable draft, deterministic/generative split, and a 3-arm eval harness — are the *right* four things to build to read as senior engineering, and each individually has real precedent and is buildable solo. The risk isn't the architecture's shape; it's that two of eleven P0 items (event-sourced draft, hybrid 3-source retrieval) are scoped at production-system fidelity inside a 5-week spine window that also has to deliver seven other items plus streaming/interrupt.

**Minimum viable P0 that still reads senior:**
1. Move/gate engine + six verbs (hand-rolled — this *is* the differentiator, don't outsource it to a framework).
2. Proposal contract (cheap — it's a schema).
3. **Simplified** versioned draft: append-only snapshot+diff chain with parent pointers and branch refs (git model), not full event-sourcing/CQRS. Same user-facing guarantees (undo, diff, compare, branch), a fraction of the build/debug risk.
4. One deterministic service (USDA cost+nutrition) — keep as-is, cheapest high-signal item.
5. One grounded generative capability with an ungrounded baseline toggle, where "grounded" = hybrid retrieval pipeline as a single unit (live literature + USDA/FoodOn entity resolution); treat FlavorGraph-only as a P1 stretch ablation arm rather than a third P0 build target.
6. Streaming + interrupt, explicitly scoped to single-process, in-session cancellation (no multi-device resumability, no cross-process crash recovery — state that choice plainly in the README, citing the checkpointing-vs-durable-execution distinction so it reads as a decision, not a gap).
7. Eval harness, even if reduced to two arms (ungrounded vs. hybrid) plus a smaller, inter-rater-checked benchmark set — this is the hero artifact and should not be the thing that gets cut under time pressure.
8. Deployed demo + README leading with methodology.

Defer or thin: the post-cook iterate-on-feedback loop (P0-8) can ship as a single re-proposal cycle rather than the richer version, since it's additive to an already-working loop rather than differentiating on its own.

## Top 5 concrete recommendations

1. **Replace "event-sourced" with a git-style snapshot+diff version chain** (parent pointers + branch refs) for the draft. Keep "versioned, branchable, diffable" in the README; only claim "event-sourced" if you actually build event upcasting and projections — otherwise the simpler model is the more honest and more buildable claim, and it's still a real data-model story.
2. **Hand-roll the move/gate state machine; don't adopt LangGraph for it.** It's small, bounded, and is the core differentiator — building it yourself is the stronger signal. Use LangGraph's `interrupt`/`Command` model only as a conceptual reference.
3. **Lock the transport decision to SSE + a separate cancel endpoint** (don't leave it open as "or WebSockets" in the doc) — this matches OpenAI/Anthropic practice and is materially simpler to build than full bidirectional WebSockets; spend the saved time on the actually-hard part (cancellation race conditions + guaranteeing no partial-state writes), not the protocol choice.
4. **Front-load the live-literature retrieval pipeline** in the schedule (the genuinely hard, FoodPuzzle-validated component) and treat FlavorGraph + USDA/FoodOn lookups as cheap, fast additions bolted onto it — don't budget all three sources as equal-effort.
5. **Add a cheap inter-rater reliability spot-check** to the eval harness (double-label ~15–20% of the benchmark set, report agreement) — small effort, meaningfully strengthens the credibility of the hero artifact for reviewers who will scrutinize methodology.
