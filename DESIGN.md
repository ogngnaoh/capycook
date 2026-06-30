# Dish Development Workbench — Product & System Design Doc (v0.2)

> An open-source, self-hostable, **human-in-the-loop agentic system** for collaborative dish development. The cook brings an idea; an interruptible orchestrator co-develops it into a real, cookable, costed, *understood* dish through gated turns — never a closed autonomous run. Food is the distinctive, demoable substrate; the **engineering is the point**; grounding is a hypothesis we *measure*, not a moat we assume.

| | |
|---|---|
| **Status** | Draft **v0.2** — post-landscape-audit; engineering-recentered |
| **Type** | Product + system design doc (PRD + architecture) |
| **Author** | _you_ |
| **Last updated** | 2026-06-30 |
| **Optimizing for** | **Portfolio flagship** — engineering signal + a deployed demo for big-tech (general-SWE / systems) internships. Not a startup; defensibility-against-competitors is explicitly *not* a goal. |

### Changelog from v0.1
- **Recentered on systems engineering.** The thesis is a durable, interruptible, human-in-the-loop agentic *system*; the food domain is the substrate, not the selling point.
- **Grounding reframed** from "the moat" to an **instrumented component with a published ablation**. Source upgraded from a single stale embedding to **hybrid retrieval**.
- **Eval harness promoted to the hero artifact.** Reproducible benchmark + methodology + an *honest* result is the highest-signal deliverable.
- **Scope tightened.** P0 cut to one deep, well-measured loop. Breadth deferred.
- **Honest related-work added** (Chef Watson, FoodPuzzle, FoodSky). No "first" claims.
- **Competitive read corrected.** The real competitor is **raw ChatGPT + cooking companions**, not ChefGPT.

---

## 1. Executive summary

This is a **systems-engineering flagship** disguised as a cooking app. The headline capability — helping a serious home cook *develop and understand their own dishes* rather than follow or generate someone else's — is the distinctive, demoable surface. The actual deliverable is a well-engineered system that reads as real engineering, not an API wrapper: a stateful, interruptible, human-gated orchestrator over a versioned shared artifact, with a strict deterministic/generative boundary, a streaming-with-interrupt transport, and a reproducible evaluation harness.

The product's identity is one commitment: **the agent proposes, the human disposes — at every move.** This is a back-and-forth co-development loop, not a closed autonomous agent. The cook is a first-class actor who can accept, edit, redirect, branch, or take over at every step, and can return after cooking to iterate against the exact version they made.

Grounding (does retrieving real flavor-science data make the model's claims better than an ungrounded 2026 LLM?) is treated as an **open empirical question with a published answer**, not an article of faith. Building the grounding layer *and rigorously measuring whether it helps* is a stronger engineering signal than asserting it matters.

---

## 2. What "success" means for this flagship

Because the goal is a portfolio piece, success is defined in engineering-signal terms, not market terms:

1. **Reads as real engineering, not a wrapper.** A reviewer skimming the repo sees durable/versioned state, interruptible orchestration, a clean service boundary, tests, tracing, and an eval harness — not `prompt → response`.
2. **A deployed, reproducible demo** with a clean README that opens with methodology and a results table.
3. **A reproducible benchmark + honest writeup** of the grounding ablation — including a null or modest result, reported plainly.
4. **One deep, complete loop** beats five shallow agents. Depth and rigor on a narrow slice signal seniority.
5. **Demonstrable command of the literature** — the README situates the work against Chef Watson, FoodPuzzle, FoodSky, and the consumer market, and states precisely what is and isn't novel.

**The "not a wrapper" test (apply to every P0 item):** if removing the LLM leaves nothing engineered behind, it's a wrapper. The move/gate state machine, the versioned draft, the deterministic services, the retrieval layer, and the eval harness all pass this test on their own.

---

## 3. Problem, opportunity & the corrected competitive read

### 3.1 The wedge (holds)
The consumer cooking-app market is saturated along one axis only — finding, generating, planning, and organizing recipes — and optimizes to *remove thinking* for the convenience cook. Tools in the category state outright that they're built around everyday cooking, **not** chef-style experimentation. The serious hobbyist who wants to *develop their own dishes and understand why they work* is a different user with the opposite job, and is not served by that market.

### 3.2 The corrected read (new in v0.2)
The "depth lane is unserved" claim was too comfortable. The *why* and *coaching* parts of that job are already being served — badly, but served — by **raw ChatGPT** (now widely positioned as the go-to for "the science behind the food") and by a wave of **cooking companions** (proactive check-ins, failure recovery, specialized dietary chefs). So:

- **The real competitor is ChatGPT + companions, not ChefGPT.**
- **The honest, narrow claim:** no tool offers *grounded, structured, iterative dish-development with deterministic correctness and a versioned co-development loop.* The why-and-coach parts alone are contested; the integrated, measured, engineered loop is not.
- **For a flagship this is fine** — you're not claiming a defensible market, you're demonstrating engineering. The bar is "is it well-built and honestly evaluated," not "can it beat ChatGPT in the market."

---

## 4. Related work & how this differs (new in v0.2)

| Prior art | What it is | How this differs |
|---|---|---|
| **IBM Chef Watson** (2014) | Flavor-compound pairing suggestions; produced a cookbook | Stopped at *suggestion*; not agentic; defunct. We close the *development* loop and keep a human gate. |
| **FoodPuzzle** (KDD 2025) | LLM agents as "autonomous flavor scientists"; molecular-flavor benchmark; found live scholarly retrieval beats static-index RAG | We borrow its benchmark and its hybrid-retrieval lesson, but build a **human-in-the-loop product** with deterministic correctness, full-stack UI, and open-source packaging — not an autonomous research agent. |
| **FoodSky** (Cell Patterns 2025) | Food LLM that passes chef/dietetic exams; fine-tuned 7B beats much larger general models; GPT-3.5 < 60% | We don't train a foundation model; we orchestrate, ground, and *measure*. FoodSky is evidence that domain reasoning is non-trivial — motivating the ablation. |
| **Consumer apps** (ChefGPT, FoodsGPT, DishGen, …) | Convenience-first recipe generation/planning | Different user, opposite job; explicitly not experimentation. |
| **Companions** (ChatGPT-as-tutor, Macaron, MyChefAI) | Serve the "why"/coach parts conversationally | We add grounding, deterministic correctness, a versioned iterative dev loop, self-hosting, and a published eval. |

**Honest positioning:** nothing here is unprecedented as a research *idea*. The contribution is an open, self-hostable, well-engineered **system** that ties grounded reasoning, deterministic correctness, and an iterative human-gated co-development loop together — and measures whether the grounding actually helps.

---

## 5. Target user & jobs-to-be-done

**Primary persona — the serious home cook ("amateur professional").** The enthusiast minority who *pushes* their cooking: reads Kenji and *Salt Fat Acid Heat*, does weekend project cooks, hosts dinner parties, wants to understand *why* a dish works so they can repeat and riff on it. Their job is **"get better, make something impressive, exercise creative agency"** — they want engagement, not less of it. They are also the **hardest user to fool**, which is a feature: it forces honesty and grounding.

- **JTBD-1 (primary):** develop an idea/ingredient/craving into a great, understood, cookable dish.
- **JTBD-2 (mastery):** understand what went wrong and how to improve.
- **JTBD-3 (discovery):** explore surprising, grounded flavor directions.

**Non-users (v1):** the convenience cook (opposite job, saturated market) and professional kitchens (different job; the *engine* could later wear a pro face, the *surface* won't).

---

## 6. Product thesis & the experience

### 6.1 What it is
A **dish-development workbench**: a two-pane interface — the evolving **dish draft** on one side, a **steering conversation** on the other. An interruptible orchestrator proposes, grounds, costs, and iterates; the cook directs it move by move.

### 6.2 Modes — one trunk, two branches (scoped)
- **A. Dish development (trunk, P0):** seed → co-develop a real, understood, cookable dish → iterate on post-cook feedback.
- **B. Cook's coach (branch, P1):** "why did my sauce break?" — diagnosis + improvement, as a mode inside A.
- **C. Flavor sandbox (branch, P1):** explore the flavor map; the discovery front door of A.

### 6.3 The core loop
1. **Seed** + constraints (dietary, allergens, equipment, skill, servings, on-hand).
2. **Move** — the orchestrator runs one unit of work and emits a **Proposal**.
3. **Gate** — the proposal (diff + rationale + citations + confidence + `[unverified]`) stops for the cook.
4. **Verb** — accept · edit · regenerate · alternatives (branch) · redirect · take-over.
5. **Advance / loop** — the state machine transitions; the orchestrator returns to the gate.
6. **Cook & iterate** — post-cook feedback is reasoned against the exact version cooked; adjustments proposed.

### 6.4 What it is **not**
Not an autonomous oracle; not a meal-planner/pantry app; not a claim to taste. It expands the search space and does the tedious, checkable work; judgment stays human.

---

## 7. Design principles (locked)

1. **The agent proposes; the human disposes — at every move.** Agentic ≠ autonomous. The gate is a mandatory transition.
2. **Deterministic truth for deterministic facts.** Scaling, cost, nutrition are computed by plain functions — never the LLM.
3. **Grounded or honest.** A claim is backed by retrieved evidence with provenance, or labeled `[unverified]`. The system reports its own grounding value.
4. **Measure, don't assert.** Grounding's value is an empirical result, published — not a marketing claim.
5. **Teach the why.** Every proposal carries its rationale; the depth *is* the explanation.
6. **License-clean by construction.** Build only on open, permissively-licensed primitives; encumbered research assets are reference/benchmark only.

---

## 8. System architecture

### 8.1 Overview
A human-gated, vertically-layered system. The hero is the **gate** between the cook and the agentic core: the loop structurally cannot cross it autonomously. The grounding layer is now **hybrid retrieval**, and is wired so it can be toggled off for the ablation.

```
            ┌──────────────────────────────┐
            │  Cook + workbench UI          │   draft pane + steering pane
            └──────────────┬───────────────┘
                           │  stream proposals ▲ / interrupt + edit ▼
            ┌──────────────▼───────────────┐
   ┌───────▶│  HUMAN GATE                   │   accept · edit · regenerate ·
   │        │  (mandatory checkpoint)       │   alternatives · redirect · take-over
   │        └──────────────┬───────────────┘
   │  each move            │
   │  returns here         ▼
   │        ┌──────────────────────────────┐        ┌───────────────────────┐
   │        │  Session orchestrator         │◀──────▶│  Versioned dish draft  │
   └────────┤  interruptible move loop      │        │  (event-sourced,       │
            └──────────────┬───────────────┘        │   branchable)          │
                           │                          └───────────────────────┘
            ┌──────────────▼───────────────┐
            │  Capability layer             │
            │  generative agents (LLM)      │  flavor · technique · (substitution P2)
            │  + deterministic services     │  scaling · cost · nutrition
            └──────────────┬───────────────┘
                           │   [grounding toggle for ablation]
            ┌──────────────▼───────────────┐
            │  Hybrid grounding / retrieval │   FlavorGraph signal + live
            │  every claim cited / [unverif]│   flavor-science literature + USDA
            └──────────────┬───────────────┘
                           │
            ┌──────────────▼───────────────┐
            │  Open food data + sources     │   FlavorGraph · FoodOn · USDA · (lit.)
            └──────────────────────────────┘
                           ▲
            ┌──────────────┴───────────────┐
            │  EVAL HARNESS (hero artifact) │   grounded vs ungrounded vs hybrid;
            │  taps the orchestrator events │   benchmark + gate-accept metrics
            └──────────────────────────────┘
```

### 8.2 The move/gate protocol — where "back-and-forth" lives
A **state machine where every transition is human-gated.** A move never emits a finished result; it emits a **Proposal**:

```
Proposal {
  target_fields:   [ draft field paths to change ]
  change:          structured diff against current draft version
  rationale:       why — in plain language
  citations:       [ provenance per grounded claim ]   // may be empty
  confidence:      0.0–1.0
  unverified:      [ claims that could not be grounded ]
  suggested_next:  [ 2–3 recommended next moves ]
}
```

The gate renders this as an actionable diff with six **verbs**, each a first-class event driving the machine: **accept · edit · regenerate · ask-for-alternatives (branch) · redirect · take-over.** There is no transition meaning "agent decides it's done and ships." An **autonomy dial** (opt-in) may let deterministic moves auto-advance while creative moves always gate.

### 8.3 The versioned dish draft — the shared artifact
A structured, **event-sourced** document; the single source of truth (a blackboard both agents and human read/write):

```
DishDraft {
  concept, flavor_rationale[ {claim, provenance} ],
  ingredients[ {name, canonical_food_id, qty, unit} ],   // resolved to FoodOn/USDA
  steps[ {text, technique, why} ],
  constraints{ dietary, allergens, equipment, skill, servings, on_hand },
  analysis{ cost, nutrition },                            // deterministic
  branches: tree of variations,
  iteration_log[ {cooked_version, feedback, changes} ],
  versions: append-only history
}
```
Accept → new version; ask-for-alternatives → branch. This delivers undo, side-by-side compare, develop-over-days, and iterate-against-the-cooked-version.

### 8.4 Capability layer — the generative/deterministic split
- **Generative (LLM, must cite):** flavor reasoner (P0), technique/why explainer (P1), substitution (P2). Routed through grounding.
- **Deterministic (plain functions, no LLM):** scaling & unit conversion, cost (USDA), nutrition (USDA).

**Never let the model do arithmetic.** One hallucinated number torches trust in every flavor claim; determinism here is what *lets the generative claims be believed*, and it's a clean architectural boundary that passes the "not a wrapper" test on its own.

### 8.5 Hybrid grounding / retrieval (reframed)
Per FoodPuzzle's finding that **live scholarly retrieval beats static-index RAG**, grounding is a *hybrid* of: (a) the **FlavorGraph** embedding as one signal (pin/vendor your own copy — it's stale), (b) **live flavor-science literature** retrieval, and (c) the **deterministic data** (USDA, FoodOn). Engineering requirements:
- **Toggleable** — the layer can be disabled per move for the ablation (the ungrounded baseline runs through the same orchestrator).
- **Provenance-attaching** — grounded claims carry source + date onto the draft field.
- **Honest** — a claim that can't be grounded is surfaced `[unverified]`, never asserted.
- **Self-reporting** — the system tracks and can display its own grounding rate.

### 8.6 Orchestrator, transport, persistence, model layer
- **Orchestrator:** runs the move/gate machine; selects the capability; assembles context; streams; **halts at the gate**; persists. Interruptible.
- **Transport:** bidirectional (SSE stream + control channel, or WebSockets); moves are **cancellable** and checkpoint partial state so a redirect loses nothing.
- **Persistence:** event-sourced draft store (versions + branches); move/gate event log (also the eval data source); user profile (skill, equipment, dietary, taste history); embedding + graph stores.
- **Model layer:** abstracted/swappable — and it's what makes the ungrounded baseline run through the same harness.

---

## 9. Evaluation strategy — the hero artifact

The eval harness is the single highest-signal deliverable. Build it **early** and measure as you go.

### 9.1 The hypothesis under test
Does grounding (hybrid retrieval) measurably beat an **ungrounded 2026 LLM baseline** on the things that matter? Expect a nuanced answer: grounding likely helps **correctness and provenance** more than raw creativity. Report whatever is true.

### 9.2 Three arms
1. **Ungrounded** — modern LLM, no retrieval.
2. **FlavorGraph-only** — the stale-embedding signal alone.
3. **Hybrid** — FlavorGraph + live literature + deterministic data.

### 9.3 Metrics
- **Claim-grounding rate** and **hallucination rate** (human-labeled on a fixed benchmark set).
- **FoodPuzzle-style molecular-flavor accuracy** (borrow the task).
- **Recipe1MSubs MRR** (only if substitution is in scope — P2).
- **Gate accept / edit / reject rate per move** (the live quality signal).

### 9.4 Reproducibility & the writeup
Pin/vendor all weights and data; fix the benchmark set; publish the methodology and a results table; ship the scripts. The README **opens** with the methodology and the number — including a null/modest result reported plainly. "I tested my own assumption and reported the real result" is the signal.

---

## 10. Data foundation (open, license-clean)

| Asset | License | Role | Caveat |
|---|---|---|---|
| **USDA FoodData Central** | CC0 | Deterministic cost + nutrition; canonical entities | Free API + bulk; cleanest |
| **FoodOn** | CC BY 4.0 | Ontology: entity resolution, constraint vocab | Actively maintained |
| **FlavorGraph** | Apache-2.0 | **One** grounding signal (pairing embeddings) | Stale (~2020–21) — vendor/pin; no longer the spine |
| **Live flavor-science literature** | varies | Hybrid retrieval (per FoodPuzzle) | Retrieve + cite; respect source terms |
| **KitcheNette** | Apache-2.0 | Optional pairing-score signal | Stale; pin |
| **Recipe1MSubs** (from GISMo) | GISMo CC-BY-NC | Substitution **benchmark only** (P2) | Non-commercial → benchmark, don't ship |
| **Nutrition5k / Food-101** | CC BY 4.0 / research | Future multimodal | Defer |

**Traps:** Recipe1M/1M+ non-commercial + registration-gated; FoodBERT/RecipeNLG-code no-license; weight link-rot (vendor + pin). Build a **lighter KG from FoodOn + USDA** rather than full FoodKG (which needs the gated Recipe1M files).

---

## 11. Requirements (tightened MoSCoW)

### P0 — the demoable spine (one deep, measured loop)
- **P0-1** Seed intake + constraints.
- **P0-2** Move/gate engine + the six verbs (no autonomous "ship").
- **P0-3** Proposal contract (diff + rationale + citations + confidence + `[unverified]`).
- **P0-4** Event-sourced versioned dish draft.
- **P0-5** One **deterministic service** (cost + nutrition via USDA).
- **P0-6** One **grounded generative capability** (flavor reasoner) **with a toggleable ungrounded baseline**.
- **P0-7** Hybrid grounding layer (FlavorGraph + live literature + USDA), toggleable.
- **P0-8** Minimal **iterate-on-feedback** loop (post-cook feedback → re-proposal against the cooked version).
- **P0-9** Streaming + interrupt.
- **P0-10** **Eval harness** (three-arm ablation + gate metrics).
- **P0-11** Deployed demo + README leading with methodology + results.

**Acceptance (samples):** a move emits a Proposal and **halts** — no draft change without a human verb; *redirect* mid-stream cancels and re-runs without losing the current version; an ungroundable claim renders `[unverified]`; the same orchestrator runs grounded and ungrounded arms; an accepted move writes an immutable, diff-able version.

### P1 — depth
Technique/why explainer; flavor-exploration front door (mode C); richer post-cook iteration; autonomy dial; observability/tracing polish; branching + side-by-side compare.

### P2 — breadth
Substitution agent + Recipe1MSubs scoring; substitution-model retraining; multi-capability orchestration; caching + cost controls.

---

## 12. Non-functional requirements & production hygiene
Version control; structured logging; error handling; automated tests (deterministic services unit-tested against fixtures); monitoring; full move/gate **tracing** (also feeds evals); Dockerized, reproducible setup; pinned/vendored weights + data; token accounting; license-clean assets only with provenance tracked end-to-end. These are the engineering signal — treat them as P0-adjacent, not afterthoughts.

---

## 13. Key decisions & trade-offs

| Decision | Rationale | Trade-off |
|---|---|---|
| Human-gated loop (not autonomous) | The product's identity + the systems story | Latency/effort vs one-shot — intended; mitigated by autonomy dial |
| Event-sourced versioned draft | Undo/compare/iterate-against-cooked-version + a real data-model story | Storage + complexity vs a flat draft — worth it |
| Deterministic/generative split | Correctness + trust + "not a wrapper" | More components — a clean boundary |
| **Grounding as a measured component (not a moat)** | Honest, higher-signal for a portfolio; the gap may be modest with 2026 LLMs | Risk the ablation shows little — *that's still a publishable result* |
| **Hybrid retrieval (not stale FlavorGraph alone)** | FoodPuzzle: live retrieval > static-index RAG | More retrieval infra vs a single embedding |
| Ruthless P0 scope | Depth+rigor on one loop signals seniority | Less breadth — deliberately |

---

## 14. Risks & open questions

- **[riskiest] Does grounded/structured beat *raw ChatGPT* for this user?** The competitor is ChatGPT + companions, not ChefGPT. **Cheapest test (one afternoon, before heavy build):** run a live co-development session — or show ten developed dishes — past five serious home cooks (your friends, r/AskCulinary, a cooking Discord) and ask: *"would you cook this and iterate on it — over just asking ChatGPT?"*
- **[the ablation answers this] Is grounding's value worth the infra?** Expect "helps correctness/provenance more than creativity." Report honestly.
- **[scope] Is the P0 loop achievable solo in a semester?** Yes *if* breadth stays deferred and the eval harness goes in early.
- **[data] FlavorGraph staleness/coverage** — pin a copy; lean on live retrieval for freshness.

---

## 15. Roadmap (semester-scale, portfolio-tuned)

| Phase | Goal | Exit criterion |
|---|---|---|
| **v0 — Validate + scaffold (wk 0–1)** | The beat-ChatGPT user test; repo skeleton; vendor FlavorGraph, load USDA/FoodOn; **stand up the eval harness shell** | Go/no-go on mode A; the three-arm harness can run an empty baseline |
| **v1 — The spine (wk 2–6)** | P0-1…P0-7, P0-9: gated loop + versioned draft + deterministic services + one grounded capability with baseline toggle + hybrid retrieval + streaming/interrupt | A cook takes a seed to a finished, grounded, costed dish entirely through gated moves; both arms run |
| **v2 — Measure + iterate + deploy (wk 7–10)** | P0-8, P0-10, P0-11: post-cook iteration; full ablation; provenance UI; deploy | Results table in the README (grounded vs ungrounded vs hybrid); live demo |
| **v3 — Depth (wk 11–13)** | P1: technique explainer, flavor sandbox, branching/compare, autonomy dial | The "why" + exploration modes live; compare-variations works |
| **Stretch** | P2: substitution + Recipe1MSubs; caching/cost controls | — |

---

## 16. Future / deferred
Pantry-truth inventory; multi-user/dinner-party co-editing; multimodal (Nutrition5k, Food-101); offline/edge inference; the **engine → pro generalization** (the grounded flavor/cost engine could later wear a professional creative-R&D face — same core, different surface); the engine shipped as a standalone open primitive.

---

## 17. README-style pitch (drop on the repo)

> **Dish Development Workbench** — an open-source, self-hostable system that helps serious home cooks *develop and understand their own dishes*, not just generate recipes. Unlike a chatbot that hands you a finished recipe, it works as a **human-in-the-loop co-development loop**: an interruptible orchestrator proposes grounded flavor directions, builds and scales the dish with deterministic costing and nutrition, explains the *why*, and iterates with you after you cook — and every step pauses for your call. Built to test one question honestly: **does grounding a model in real flavor-science data actually beat just asking a strong LLM?** The repo ships the system *and* the reproducible benchmark that answers it. Related work: IBM Chef Watson, FoodPuzzle (KDD'25), FoodSky (Patterns'25).

---

## Appendix A — Glossary
Food-pairing hypothesis; flavor network; food-bridging; ingredient embeddings (FlavorGraph / food2vec); cross-modal recipe retrieval; ingredient substitution graph; Recipe1MSubs; molecular descriptors; knowledge graph / ontology (FoodKG / FoodOn); blackboard pattern; move / gate; event sourcing; ablation.

## Appendix B — References (verify before relying)
USDA FoodData Central (CC0); FoodOn (CC BY 4.0); FlavorGraph (Apache-2.0, Park et al. 2021); KitcheNette (Apache-2.0, 2019); GISMo / Recipe1MSubs (CC-BY-NC, Fatemi et al. 2023); Nutrition5k (CC BY 4.0); Food-101; FoodKG (Apache-2.0); Ahn et al. 2011; **FoodPuzzle (KDD 2025, arXiv 2409.12832); FoodSky (Cell Patterns 2025)**; IBM Chef Watson (2014). Plus the consumer-market and companion landscape (ChefGPT, FoodsGPT, DishGen, Macaron, MyChefAI) for positioning.

> Verify every license, link, and maintenance status against the source before depending on it — several research assets are stale and some links rot.
