# Dish Development Workbench — Product & System Design Doc (v0.4)

> An open-source, self-hostable, **human-in-the-loop agentic system** for collaborative dish development. The cook brings an idea; an interruptible orchestrator co-develops it into a real, cookable, costed, *understood* dish through gated turns — never a closed autonomous run. Food is the distinctive, demoable substrate; the **engineering is the point**. The flagship result is the *system + the eval methodology* — grounding's value is a hypothesis we measure and report honestly, not the headline.

| | |
|---|---|
| **Status** | Draft **v0.4** — post-portfolio-recut (positioning de-marketed for a portfolio, not a market; cost tier-split applied; wk-0 user test retired, replaced by pre-registration); four v0-scope decisions locked (see below) |
| **Type** | Product + system design doc (PRD + architecture) |
| **Author** | _you_ |
| **Last updated** | 2026-06-30 |
| **Optimizing for** | **Portfolio flagship** — engineering signal + intellectual honesty + a deployed demo for big-tech (general-SWE / systems) internships. Not a startup; defensibility-against-competitors is explicitly *not* a goal. |

### Changelog from v0.3.1 (each change mapped to its driver)

- **Portfolio-lens recut applied.** Doc now reads for a resume reviewer, not a market: recruiting/market-sizing language removed; the author is the spec, not a "biased n=1" to apologize for. — *Driver: portfolio-lens re-cut (four reviewers + Critic).*
- **`cost (USDA)` over-attribution fixed (trust tier-split).** USDA FoodData Central has no price data. Nutrition = USDA authoritative (unchanged); cost = static `[approximate]` table, NOT attributed to USDA. Propagated to §3.2, §8.4, §10, §11, §13, §14, §17 + the deterministic-services checklist. — *Driver: culinary Gap-12; Critic change 1 (honesty-critical).*
- **Wk-0 user test dropped; replaced by pre-registration.** No recruiting, no n=5, no "0/5 no-go," no "steers scope." v0 phase = scaffold + pre-register the eval methodology/hypothesis before any run. Locked-decision #4 retired. — *Driver: positioning C2/A7; Critic confirm.*
- **Hero gate-dynamics relabeled as operator/autobiographical-design telemetry.** Report explicit N + per-move-category breakdown, never a bare % (n=1 operator). Benchmark-based provenance/hallucination stays the top hero leg. — *Driver: eval Decision 1; Critic change (honest middle).*
- **Inter-rater check re-scoped to eval-credibility, not market.** "Second serious cook" → "a second labeler"; report Cohen's kappa + confusion matrix; labeling-reliability check, not a user study. — *Driver: eval Decision 4.*
- **Safety-gate motivation reframed to engineering signal.** Building the gate demonstrates domain-hazard modeling + systematic risk-thinking, evaluable independent of whether it reaches a real kitchen. Gate stays non-negotiable P0. — *Driver: culinary/positioning C9.*
- **Positioning de-marketed.** Persona = illustrative narrative; durability = "where the engineering shines" (not "edge"); landscape scan = "found a specific gap" (not moat); discovery = capability demo; §16.1 = requirements exploration. — *Driver: positioning A1/A6/A10, C1/C4/C5/C7/C8.*
- **§14 honesty risk added by design.** "By design — author is the spec; external judgment out of scope" (not a confession); optional non-gating external-cook garnish. — *Driver: Critic change 3.*
- **Design gaps closed.** Cancel = discard-not-rollback + `move_cancelled`/`proposal_blocked` events; deterministic-services checklist; fusion routes by claim type; batch Proposal / stream rationale; conversation-history scope; tree-not-DAG branching; labeling rubric. — *Driver: arch Gaps 2/3/6/7/10, eval Gap 8/9, culinary Gap 4.*
- **Currency notes (decline/watch-only).** DBOS Transact named-and-declined; FlavorDiffusion + Epicure "checked & rejected for P0, P1 watch"; ChatGPT June-2026 memory upgrade noted; npj Science of Food 2025 added; Fresco 2026 confirms the hands-dirty boundary. — *Driver: arch A-5, culinary A-4, positioning 2026 re-scan.*

### Changelog from v0.2 (each change mapped to its driver)

- **Hero reframed: process metrics + methodology, not the grounding number.** The headline result is now provenance/hallucination rate + gate accept/edit/reject dynamics; the 3-arm grounding ablation is demoted to an honest, openly-hedged *supporting* finding. The spine and the eval methodology read as the flagship even under a null ablation. (§9, §17 rewritten.) — *Driver: critique [High] "hero measures the wrong thing"; culinary §5; product §4.*
- **"Event-sourced" draft → git-style snapshot+diff+branch version chain.** The draft's own acceptance criteria need versioning, not event-sourcing; the old label was an overclaim. True event-sourcing is now located only on the **move/gate event log** (append-only, replayed for eval metrics). — *Driver: architecture [High]; critique "event-sourcing contradiction — resolved."*
- **Live-literature retrieval moved to P1.** The P0 grounded arm is **FlavorGraph + USDA/FoodOn only**. Live retrieval was the timeline-killer wired as a hard dependency of the hero. — *Driver: critique [High] #2; market rec 4.*
- **Grounding narrative made honest.** No longer "flavor-science grounding." It is *deterministic nutrition/identity grounding (USDA, FoodOn — zero flavor data) + one empirically-contested flavor-pairing signal (FlavorGraph)*. Flavor suggestions are now cuisine-aware; FlavorGraph is presented as a contested signal, not settled science. — *Driver: culinary §1, §2, recs 1 & 4.*
- **New §8.7 SAFETY-GATE.** A deterministic service that can *block* a proposal (narrow anaerobic-preservation blocklist, min cook-temps, allergen check vs `constraints.allergens`) + a documented disclaimer. Discovery mode gets the same gate, not a lighter one. — *Driver: culinary §4, recs 2 & 5; critique [Med].*
- **Citations fixed.** FoodPuzzle reworded to "motivates retrieval by design, not by demonstrated ablation"; FoodSky softened to "beats ChatGPT-3.5 and a field of 7–13B baselines" with the published ~83%/91% figures and a paywall caveat; ChatGPT claim softened; "no tool exists" → "not found in this landscape scan"; Macaron and FoodKG disambiguated. — *Driver: market recs 1, 2, 3, 5; culinary §3.*
- **Dropped "blackboard" and "CQRS."** P0 has one generative agent; the labels were unearned. — *Driver: critique [Med]; architecture over-engineering.*
- **Streaming scoped to single-process, in-session cancellation** as a deliberate choice (checkpointing ≠ durable execution), and transport **locked to SSE + a separate cancel endpoint** (not "or WebSockets"). — *Driver: architecture [Med]/[Low], recs 3 & 6.*
- **Flat vector index, not a graph DB**, for the FlavorGraph signal (a similarity lookup; no multi-hop traversal planned). — *Driver: architecture over-engineering finding.*
- **Magentic-UI added as architectural prior art** for the HITL interaction model. — *Driver: product rec 3.*
- **Eval rigor added:** inter-rater reliability spot-check (double-label ~15–20% of the benchmark set) + a versioned benchmark set; **tracing promoted to the explicit P0 list.** — *Driver: architecture gaps & rec 5.*
- **Minimal autonomy dial pulled into P0** (auto-advance deterministic moves only); **idempotent "accept,"** **"take-over" reconciled with the version log,** a "gate happens at the counter, not the stove" boundary, and one sentence on steering-conversation persistence. — *Driver: product recs 1, 2, 5; architecture gaps.*
- **P0 + roadmap reshaped around two deep pillars** (the move/gate machine + proposal contract + version chain, hand-rolled; and the eval harness + methodology with sign-robust hero metrics). Everything else is deferred or thinned explicitly. — *Driver: critique "the 1–2 things to go deep on"; architecture "minimum viable P0."*

### v0 scope decisions (locked 2026-06-30)

Four open questions from the design review are now decided for the v0 build:

1. **Benchmark labeling → a second serious cook double-labels ~15–20%** of the benchmark set — true *inter*-rater agreement, not intra-rater. (Refines §9.4.)
2. **Cuisine scope → the v0 demo is restricted to the Western-cuisine subset** where FlavorGraph's compound-sharing signal has positive empirical support; the 3-arm ablation runs on that subset, and the cultural bias (inverted for East/South Asian cuisines) is logged as a finding + committed future work. (Refines §5, §8.5, §15.)
3. **Safety gate → hard block in v0:** a proposal that trips the blocklist is refused outright and never reaches the cook; block-with-citation-override is deferred to P1. (Refines §8.7.)
4. **Wk-0 user test [RETIRED, v0.4]:** no external user test — no recruiting, no n=5, no "0/5 no-go," no "steers scope" exit. Replaced by: wk-0 = scaffold + pre-register the eval methodology and hypothesis in the README before any run. (Refines §14, §15.)

---

## 1. Executive summary

This is a **systems-engineering flagship** disguised as a cooking app. The headline capability — helping a serious home cook *develop and understand their own dishes* rather than follow or generate someone else's — is the distinctive, demoable surface. The actual deliverable is a well-engineered system that reads as real engineering, not an API wrapper: a stateful, interruptible, human-gated orchestrator over a versioned shared artifact, with a strict deterministic/generative boundary, a deterministic safety gate, a single-process streaming-with-cancel transport, and a reproducible evaluation harness.

The product's identity is one commitment: **the agent proposes, the human disposes — at every move.** This is a back-and-forth co-development loop, not a closed autonomous agent. The cook is a first-class actor who can accept, edit, redirect, branch, or take over at every step, and can return after cooking to iterate against the exact version they made.

**The flagship result is the system and the eval methodology, not a grounding number.** The hero metrics are process-level and sign-robust — provenance/hallucination rate and gate accept/edit/reject dynamics — and they hold their value whatever the grounding ablation shows. Whether retrieving a contested flavor-pairing signal beats a strong 2026 LLM is an honestly-measured *supporting* question, reported plainly including a null. Building the apparatus *and* measuring rigorously is the signal; the number is a footnote.

---

## 2. What "success" means for this flagship

Because the goal is a portfolio piece, success is defined in engineering-signal terms, not market terms:

1. **Reads as real engineering, not a wrapper.** A reviewer skimming the repo sees a hand-rolled gated state machine, a versioned/branchable data model, a clean deterministic/generative boundary, a deterministic safety gate, tests, tracing, and an eval harness — not `prompt → response`.
2. **A deployed, reproducible demo** with a clean README that opens with methodology and a results table.
3. **A reproducible benchmark + honest writeup** whose *headline* is process quality (provenance, gate dynamics) and whose *supporting* section reports the grounding ablation — including a null or modest result, reported plainly.
4. **One deep, complete loop** beats five shallow agents. Depth and rigor on a narrow slice signal seniority.
5. **Demonstrable command of the literature** — the README situates the work against Chef Watson, FoodPuzzle, FoodSky, Magentic-UI, and the consumer market, and states precisely what is and isn't novel, with every claim accurately hedged.

**The "not a wrapper" test (apply to every P0 item):** if removing the LLM leaves nothing engineered behind, it's a wrapper. The move/gate state machine, the versioned draft, the deterministic services, the safety gate, and the eval harness all pass this test on their own.

---

## 3. Problem, opportunity & the corrected competitive read

### 3.1 The wedge (holds)
The consumer cooking-app market is saturated along one axis only — finding, generating, planning, and organizing recipes — and optimizes to *remove thinking* for the convenience cook. Tools in the category are built around everyday cooking, **not** chef-style experimentation. The serious hobbyist who wants to *develop their own dishes and understand why they work* is a different user with the opposite job, and is not served by that market.

### 3.2 The corrected read
The "depth lane is unserved" claim was too comfortable. The *why* and *coaching* parts of that job are already being served — badly, but served — by **raw ChatGPT** (the de facto default cooks reach for) and by a wave of **cooking companions** (proactive check-ins, failure recovery, specialized dietary chefs). So:

- **The real competitor is ChatGPT + companions, not ChefGPT.** OpenAI's June-2026 memory upgrade (recall 67.9%→82.8%, remembers year-old chats — TechRadar/Neowin) narrows but doesn't close the gap: recall is not a diffable, branchable, versioned, grounded artifact with a gate.
- **The honest, narrow claim:** *not found in this landscape scan* — no tool offers grounded, structured, iterative dish-development with deterministic correctness and a versioned co-development loop. (A universal "no tool exists" negative can't be proven, only not-falsified across the five products scanned.) The value of this claim is engineering judgment — the landscape was mapped and a specific gap was found — not a defensible moat; the why-and-coach parts alone are contested, the integrated, measured, engineered loop is not.
- **Honest counter-case:** for a single-shot question with no need to resume or to lean on a guaranteed number — nutrition is trustworthy, but cost is a reasonable estimate, not a to-the-dollar guarantee — raw ChatGPT is already good enough and the gate is friction with no visible payoff — the workbench's edge only appears at the second/third iteration.
- **For a flagship this is fine** — you're not claiming a defensible market, you're demonstrating engineering. The bar is "is it well-built and honestly evaluated," not "can it beat ChatGPT in the market."

---

## 4. Related work & how this differs

| Prior art | What it is | How this differs |
|---|---|---|
| **IBM Chef Watson** (2014) | Flavor-compound pairing suggestions; produced a cookbook; consumer apps now retired | Stopped at *suggestion*; not agentic; defunct. We close the *development* loop and keep a human gate. |
| **FoodPuzzle** (KDD 2025, arXiv 2409.12832) | LLM agents as "autonomous flavor scientists"; molecular-flavor benchmark (978 foods / 1,766 molecule profiles) | We borrow its **published benchmark** as a chemistry-knowledge proxy, but build a **human-in-the-loop product** with deterministic correctness, a safety gate, full-stack UI, and open-source packaging — not an autonomous research agent. FoodPuzzle *motivates* web/scholarly retrieval over a static index **by design, not by a demonstrated ablation** (its method even caches web results offline) — so hybrid retrieval is *our own* hypothesis to test, not a borrowed result. |
| **FoodSky** (Cell Patterns 2025) | Food LLM that passes Chinese chef/dietetic exams (~83.3% / 91.2% published; primary text paywalled, figures via science-press summary); a fine-tuned 7B **beats ChatGPT-3.5 and a field of 7–13B open baselines** | We don't train a foundation model; we orchestrate, ground, and *measure*. FoodSky is evidence that domain reasoning is non-trivial — motivating an honest ablation, not a "beats much larger models" sweep (only one larger model was in the comparison). |
| **Magentic-UI** (Microsoft Research, arXiv 2507.22358, 2025) | A researched HITL agentic system: co-planning, co-tasking, and **action approval for high-stakes actions** as named interaction mechanisms | Our gate-as-mandatory-checkpoint is the same researched HITL primitive, not invented. We cite it as architectural prior art for the **interaction model** (§13), applied to a versioned dish artifact rather than general tasks. |
| **Consumer apps** (ChefGPT, FoodsGPT, DishGen, …) | Convenience-first recipe generation/planning | Different user, opposite job; explicitly not experimentation. None expose versioning, deterministic costing, or a gated loop. |
| **Companions** (ChatGPT-as-tutor, **Macaron — a general personal-AI agent where cooking is one feature among many**, MyChefAI) | Serve the "why"/coach parts conversationally | We add deterministic correctness, a safety gate, a versioned iterative dev loop, self-hosting, and a published eval. |

**Honest positioning:** nothing here is unprecedented as a research *idea*. The contribution is an open, self-hostable, well-engineered **system** that ties grounded reasoning, deterministic correctness, a deterministic safety gate, and an iterative human-gated co-development loop together — and measures, honestly, what the grounding actually buys.

---

## 5. Target user & jobs-to-be-done

**Primary persona — the serious home cook ("amateur professional").** The enthusiast minority who *pushes* their cooking: reads Kenji and *Salt Fat Acid Heat*, does weekend project cooks, hosts dinner parties, wants to understand *why* a dish works so they can repeat and riff on it. Their job is **"get better, make something impressive, exercise creative agency"** — they want engagement, not less of it. They are also the **hardest user to fool**, which is a feature: it forces honesty and grounding.

This is a real, identifiable segment (the home-cook-typology literature isolates "hobby chefs" as a distinct cluster), but the persona's job here is **illustrative, not a market to size or reach**: it shows the design has a specific shape, not a TAM. The doc leans on persona **specificity**, never persona size, as supporting evidence (consistent with the stated non-goal of market size).

- **JTBD-1 (primary):** develop an idea/ingredient/craving into a great, understood, cookable dish.
- **JTBD-2 (mastery):** understand what went wrong and how to improve.
- **JTBD-3 (discovery):** explore surprising, grounded flavor directions — framed as a **capability demo and an adversarial stress-test of the safety gate**, not a "users want creative suggestions" feature: *this is the part of the system most likely to wander into novel-but-unsafe territory, so it carries the full safety gate (§8.7), not a lighter one.*

**Non-users (v1):** the convenience cook (opposite job, saturated market) and professional kitchens (different job; the *engine* could later wear a pro face, the *surface* won't).

---

## 6. Product thesis & the experience

### 6.1 What it is
A **dish-development workbench**: a two-pane interface — the evolving **dish draft** on one side, a **steering conversation** on the other. An interruptible orchestrator proposes, grounds, costs, and iterates; the cook directs it move by move. The interaction model is a deliberate transplant of the diff-review pattern from AI coding tools (propose → render inline diff → cheap accept/reject), validated as a researched HITL primitive by Magentic-UI (§4).

### 6.2 Modes — one trunk, two branches (scoped)
- **A. Dish development (trunk, P0):** seed → co-develop a real, understood, cookable dish → iterate on post-cook feedback.
- **B. Cook's coach (branch, P1):** "why did my sauce break?" — diagnosis + improvement, as a mode inside A.
- **C. Flavor sandbox (branch, P1):** explore the flavor map; the discovery front door of A — a **capability demo and adversarial stress-test of the safety gate under novelty**, not a "users want creative suggestions" feature. **Runs under the same safety gate as the trunk** — discovery and danger are correlated, so this mode gets *more* safety scrutiny, not less.

### 6.3 The core loop
1. **Seed** + constraints (dietary, allergens, equipment, skill, servings, on-hand).
2. **Move** — the orchestrator runs one unit of work and emits a **Proposal**. The Proposal is emitted as a **complete, batched structured object, not streamed** — the safety gate needs the whole thing before it can screen it; only the free-text `rationale` streams token-by-token.
3. **Safety screen** — the deterministic safety gate (§8.7) may *block* a proposal before it ever reaches the cook.
4. **Gate** — the surviving proposal (diff + rationale + citations + confidence + `[unverified]`) stops for the cook.
5. **Verb** — accept · edit · regenerate · alternatives (branch) · redirect · take-over.
6. **Advance / loop** — the state machine transitions; the orchestrator returns to the gate. **Deterministic moves may auto-advance** if the minimal autonomy dial is on (§8.2); creative moves always stop.
7. **Cook & iterate** — post-cook feedback is reasoned against the exact version cooked; adjustments proposed.

### 6.4 What it is **not**
Not an autonomous oracle; not a meal-planner/pantry app; not a claim to taste; **not an in-cook tool.** The gate happens at the counter/laptop *before and after* cooking, not at the stove with food-covered hands — voice/hands-free in-cook use is an explicit non-goal for v1 (a deliberate scoping decision, not an unaddressed gap). **Fresco** (an in-cook connected-appliance product, PRNewswire, June 2026) occupies exactly the opposite boundary — confirming hands-dirty is a deliberate scoping choice, not a gap this doc missed. It expands the search space and does the tedious, checkable work; judgment stays human.

---

## 7. Design principles (locked)

1. **The agent proposes; the human disposes — at every move.** Agentic ≠ autonomous. The gate is a mandatory transition. (Deterministic-only moves may opt into auto-advance; creative moves never do.)
2. **Deterministic truth for deterministic facts.** Scaling, cost, nutrition are computed by plain functions — never the LLM.
3. **Grounded or honest.** A claim is backed by retrieved evidence with provenance, or labeled `[unverified]`. The system reports its own grounding value — and applies that honesty *one level up*, to the premise: the flavor-pairing signal is contested, and the doc says so.
4. **Measure, don't assert.** Grounding's value is an empirical result, published — not a marketing claim. The hero metrics are process-level and sign-robust so the result reads regardless of which way the grounding number lands.
5. **Teach the why.** Every proposal carries its rationale; the depth *is* the explanation.
6. **Safe by construction where the stakes are physical.** A deterministic safety gate can block a proposal outright — distinct from the `[unverified]` label, which is the wrong severity tool for "this could cause foodborne illness."
7. **License-clean by construction.** Build only on open, permissively-licensed primitives; encumbered research assets are reference/benchmark only.

---

## 8. System architecture

### 8.1 Overview
A human-gated, vertically-layered system. The hero is the **gate** between the cook and the agentic core: the loop structurally cannot cross it autonomously. A deterministic **safety gate** sits in front of the human gate and can block proposals. Grounding in P0 is the deterministic data (USDA/FoodOn) plus the FlavorGraph pairing signal, wired so it can be toggled off for the ablation; live-literature retrieval is a P1 layer.

```
            ┌──────────────────────────────┐
            │  Cook + workbench UI          │   draft pane + steering pane
            └──────────────┬───────────────┘
                           │  stream proposals ▲ / interrupt + edit ▼
            ┌──────────────▼───────────────┐
   ┌───────▶│  HUMAN GATE                   │   accept · edit · regenerate ·
   │        │  (mandatory checkpoint)       │   alternatives · redirect · take-over
   │        └──────────────┬───────────────┘
   │  each move            │  ▲ blocked proposals never arrive
   │  returns here         │  │
   │        ┌──────────────┴──┴────────────┐
   │        │  DETERMINISTIC SAFETY GATE    │   anaerobic-preservation blocklist ·
   │        │  (can BLOCK a proposal)       │   min cook temps · allergen check
   │        └──────────────┬───────────────┘
   │        ┌──────────────▼───────────────┐        ┌───────────────────────┐
   │        │  Session orchestrator         │◀──────▶│  Versioned dish draft  │
   └────────┤  interruptible move loop      │        │  (git-style snapshot+  │
            └──────────────┬───────────────┘        │   diff+branch chain)   │
                           │                          └───────────────────────┘
            ┌──────────────▼───────────────┐
            │  Capability layer             │
            │  generative agent (LLM)       │  flavor reasoner (P0)
            │  + deterministic services     │  scaling · cost · nutrition
            └──────────────┬───────────────┘
                           │   [grounding toggle for ablation]
            ┌──────────────▼───────────────┐
            │  Grounding / retrieval        │   FlavorGraph pairing signal (contested,
            │  every claim cited / [unverif]│   cuisine-aware) + USDA/FoodOn resolution
            └──────────────┬───────────────┘     [+ live literature retrieval — P1]
                           │
            ┌──────────────▼───────────────┐
            │  Open food data + sources     │   FlavorGraph · FoodOn · USDA
            └──────────────────────────────┘
                           ▲
            ┌──────────────┴───────────────┐
            │  EVAL HARNESS (hero artifact) │   hero: provenance/hallucination + gate
            │  taps the move/gate event log │   dynamics; supporting: grounding ablation
            └──────────────────────────────┘
```

### 8.2 The move/gate protocol — where "back-and-forth" lives
A **hand-rolled state machine where every transition is human-gated** (we build it ourselves — it's small, bounded, and is the differentiator; LangGraph's `interrupt`/`Command` model is a conceptual reference only, not a dependency). **Why not LangGraph (or a managed agent framework)?** A bounded six-verb machine with fewer than three branching points and no durable-checkpoint need clears the "DIY vs. framework" bar cleanly (developersdigest.tech/blog/managed-agents-vs-langgraph-vs-diy-2026) — hand-rolling it is the more legible engineering signal, not less. A move never emits a finished result; it emits a **Proposal**:

```
Proposal {
  target_fields:   [ draft field paths to change ]
  change:          structured diff against current draft version
  rationale:       why — in plain language
  citations:       [ provenance per grounded claim ]   // may be empty
  confidence:      0.0–1.0
  unverified:      [ claims that could not be grounded ]
  safety:          { status: pass | blocked, reasons[] }   // from §8.7
  suggested_next:  [ 2–3 recommended next moves ]
}
```

The gate renders this as an actionable diff with six **verbs**, each a first-class event driving the machine: **accept · edit · regenerate · ask-for-alternatives (branch) · redirect · take-over.** There is no transition meaning "agent decides it's done and ships."

**Minimal autonomy dial (P0).** Approval fatigue is the best-documented failure mode of gate-everywhere interaction models (DeepMind "AI Agent Traps," Franklin et al. 2025): a gate that prompts on *every* operation gets bypassed; one that prompts only on consequential operations gets used. So P0 ships a minimal dial: **deterministic moves (a unit conversion, a cost recompute) may auto-advance; every creative/generative move always stops at the gate.** The richer per-capability dial stays P1.

**Correctness details (closing the state-machine gaps):**
- **"accept" is idempotent** — a double-click or an accept racing a redirect resolves to exactly one new version; later duplicates are no-ops keyed on the proposal id.
- **"take-over" is reconciled with the version log** — a manual cook edit emits a synthetic diff/event so history stays complete; there is no untracked provenance gap.
- The gate is a transition *boundary*, not a place state silently mutates: nothing writes the draft without a verb.

### 8.3 The versioned dish draft — the shared artifact
A structured document maintained as a **git-style snapshot+diff+branch version chain**: each accepted move appends an immutable snapshot with a structured diff and a parent pointer; ask-for-alternatives creates a branch ref. This is the single source of truth that both the generative agent and the human read and write.

```
DishDraft {
  concept, flavor_rationale[ {claim, provenance, cuisine_context} ],
  ingredients[ {name, canonical_food_id, qty, unit} ],   // resolved to FoodOn/USDA
  steps[ {text, technique, why} ],
  constraints{ dietary, allergens, equipment, skill, servings, on_hand },
  analysis{ cost, nutrition },                            // deterministic
  branches: tree of variations,                           // branch refs
  iteration_log[ {cooked_version, feedback, changes} ],
  versions: append-only snapshot+diff chain with parent pointers
}
```

Accept → new snapshot; ask-for-alternatives → branch. This delivers undo, side-by-side compare, develop-over-days, and iterate-against-the-cooked-version — **the full user-facing data-model story without the CQRS apparatus** (event upcasters, projection rebuilds). We claim "versioned, branchable, diffable," not "event-sourced," because that is what we build; git itself is the real-world instance of this model. *(True event-sourcing lives elsewhere — see §8.6, the move/gate event log.)*

**Steering-conversation persistence.** The draft is durable, but so is the *conversation*: the steering thread persists with the draft across multi-day gaps, so a cook returning after three days can recall *why* a flavor direction was chosen, not just *what* the diff was. (For code review the diff is self-explanatory; for cooking the rationale recall matters more.)

**Conversation-history scope.** What persists: the steering thread **verbatim**, plus the decision/rationale log (already implicit above). Explicitly excluded: raw provider chain-of-thought (OpenAI hides it by policy; Anthropic's isn't guaranteed-faithful) — never persisted or shown. Free-standing user notes (a scratch-pad separate from the steering thread) are an explicit **P1/P2 deferral**, not a silent gap.

**Branching model.** `branches` is a **tree, not a DAG** — no verb implies merge, so merge/conflict machinery is out of scope by construction. "Promote branch" is a **pointer reassignment** (the branch ref becomes the new trunk head), not a content merge.

### 8.4 Capability layer — the generative/deterministic split
- **Generative (LLM, must cite):** flavor reasoner (P0); technique/why explainer (P1); substitution (P2). Routed through grounding.
- **Deterministic (plain functions, no LLM):** scaling & unit conversion, **nutrition (USDA FoodData Central — authoritative)**, **cost (a static `[approximate]` ingredient-price table — NOT USDA; FoodData Central carries no price data)**.

**Never let the model do arithmetic.** One hallucinated number torches trust in every flavor claim; determinism here is what *lets the generative claims be believed*, and it's a clean architectural boundary that passes the "not a wrapper" test on its own. This is also the only food-domain claim in the doc that the literature unambiguously supports — USDA arithmetic should never be hallucinated. (Cost is deterministic *arithmetic over an approximate table*, not a USDA-sourced fact — the trust tier is different and the doc says so everywhere this comes up.)

**Deterministic-services checklist (P0):**
- Scaling / unit conversion
- Cost — static `[approximate]` table (NOT USDA)
- Nutrition — USDA (authoritative)
- FoodOn identity resolution
- Allergen check
- Safety blocklist (anaerobic + min-temp)
- Idempotency-key resolution
- Version-chain integrity bookkeeping

**Flag:** `confidence` is **LLM-emitted**, not a deterministic service — it must never become a gating input.

### 8.5 Grounding / retrieval — honestly named
The grounding layer is **not** "flavor-science grounding." It is precisely:
- **Deterministic nutrition/identity grounding — USDA + FoodOn.** Both are excellent and unambiguous, and both contain **zero flavor/aroma/sensory data**: USDA is nutrition ground truth, FoodOn is identity/taxonomy ground truth. They fix what LLMs are genuinely bad at (exact nutrient/cost arithmetic, canonical entity naming).
- **One empirically-contested flavor-pairing signal — FlavorGraph** (Park et al. 2021). This is the only piece of the stack actually about flavor, and it inherits the food-pairing hypothesis's known problems: the shared-compound "principle" is statistically significant for North American/Western European cuisines, **inverted (negative pairing) for East Asian and all eight Indian regional cuisines**, and *not robust to which compound database is used* (the same analysis flips sign on a cleaner dataset). A **fresh Nov-2025 consensus** — Caprioli et al., *npj Science of Food* 9:242 (2025), nature.com/articles/s41538-025-00588-4 / arXiv:2408.15162 — restates the same split (positive Western, negative/irrelevant East/South Asian) 14 years after Ahn 2011: the hedge isn't stale lit, it's a **live 2025 consensus**. So:
  - Flavor suggestions are **cuisine-aware**: compound-sharing is surfaced as a *positive* signal for the Western subset and an explicitly *negative-or-irrelevant* one for East/South Asian dishes — never as universal "evidence this works."
  - FlavorGraph-derived suggestions are presented as **one contested signal among the rationale**, with a per-cuisine disclaimer — not a scientific fact pattern. FlavorGraph is vendored/pinned (it's stale, ~2020–21; its README still carries a "to appear" placeholder citation; **staleness re-verified mid-2026**). Its would-be successor, **FlavorDiffusion** (arXiv:2502.06871), was **checked and rejected for P0** — logged as a **P1 watch-item**, not a swap-in.
  - **v0 demo scope (locked):** demo dishes are restricted to the **Western-cuisine subset** where the signal has positive support; all-cuisines support (handling the inverted East/South Asian case) is committed future work (§16).
  - **Fusion routing.** USDA/FoodOn/FlavorGraph are claim-type-disjoint (nutrition/cost vs. identity vs. flavor-pairing) — grounding routes **by claim type, not a numeric blend**; there is no fusion problem to solve in P0. **P1 tie-break (pre-registered):** retrieved literature may only augment a proposal's `rationale`/`citations[]`, never silently renumber FlavorGraph's `confidence`; on direct contradiction, apply a fixed deterministic confidence penalty + a `[contested]` label — no learned re-ranker.

Engineering requirements:
- **Toggleable** — the grounded path can be disabled per move for the ablation (the ungrounded baseline runs through the same orchestrator).
- **Provenance-attaching** — grounded claims carry source + date onto the draft field.
- **Honest** — a claim that can't be grounded is surfaced `[unverified]`, never asserted.
- **Self-reporting** — the system tracks and can display its own grounding rate.

**Live-literature retrieval is P1, not P0.** A live query→fetch→citation-extraction→ranking→fusion pipeline is a multi-week subsystem; wiring it as a hard dependency of the grounded arm (which the hero ablation depends on) would let a retrieval slip cascade into the hero slipping. So P0 ships FlavorGraph + USDA/FoodOn as the grounded arm; live retrieval layers on top of an already-working ablation in P1. Whether hybrid retrieval beats a static signal is the **project's own hypothesis to test**, not a borrowed FoodPuzzle finding.

### 8.6 Orchestrator, transport, persistence, model layer
- **Orchestrator:** runs the move/gate machine; runs the safety screen; selects the capability; assembles context; streams; **halts at the gate**; persists. Interruptible.
- **Transport (locked): SSE for token streaming + a separate cancel endpoint.** This matches OpenAI/Anthropic practice and is materially simpler than full bidirectional WebSockets. **Streaming is explicitly scoped to single-process, in-session cancellation** — a move is cancellable and a redirect loses nothing within the session, but there is **no multi-device resumability and no cross-process crash recovery.** This is a deliberate choice, not a silent gap: *checkpointing says "I saved your state"; durable execution says "your workflow will run to completion."* We provide in-session cancellation, not durable execution, and the README says so. **Named and declined:** DBOS Transact (dbos.dev/blog/what-is-lightweight-durable-execution) is the concrete 2026 lightweight-durable-execution option — declined for P0, matching the LangGraph/WebSockets/CQRS decline pattern; nothing pre-accept is lost by declining it. **Cancel is discard-not-rollback** — there is nothing pre-accept to roll back, only to discard. Stream granularity is provider-dependent (Anthropic's tool-use returns structured output as one block at stream end, not token-by-token — pockit.tools). The genuinely hard part to get right is the cancellation race and guaranteeing no partial-state writes — that's where the effort goes, not the protocol choice.
- **Persistence:** the version-chain draft store (snapshots + diffs + branch refs); the **move/gate event log** — an append-only, *truly event-sourced* stream that is the eval data source and is replayed to compute metrics (event types now include **`move_cancelled`** and **`proposal_blocked`**, so cancel/block behavior is visible to the gate-dynamics hero metric); user profile (skill, equipment, dietary, taste history); a flat vector index for the FlavorGraph signal (a similarity lookup — no separate graph database, since no multi-hop pairing traversal is planned).
- **Model layer:** abstracted/swappable — and it's what makes the ungrounded baseline run through the same harness.

### 8.7 Safety gate — the deterministic block (new in v0.3)
**Building this gate is itself an engineering-signal decision, not a product-liability requirement.** Correctly identifying the physical-stakes/no-stakes boundary — pH, water activity, the temperature danger zone, allergen-class relationships — and encoding it as a **deterministic, blocking** service, rather than trusting an LLM disclaimer, *is* the domain-rigor / systematic-risk-thinking signal for a portfolio reviewer; skipping it would be evidence the author didn't know where the hazards are. A system whose job is proposing *novel* combinations to home cooks needs a safety category alongside generative and deterministic. This is a **deterministic safety-gate service that can BLOCK a proposal from ever reaching the human gate** — distinct from `[unverified]`, which is the wrong severity tool for "this could cause foodborne illness." LLMs have no model of pH, water activity, or the temperature danger zone, and general LLMs are documented to be only sparsely safety-aligned in the food domain (FoodGuardBench / "Cooking Up Risks").

**Calibrated scope — a narrow hard-coded blocklist + a documented disclaimer, NOT a full FDA rules engine** (a full preservation rules engine would itself blow the scope budget). **In v0 the gate hard-blocks** — a proposal that trips any rule below is refused outright and never reaches the human gate; block-with-citation-override is a P1 refinement. The rules:
- **Anaerobic preservation block.** Any proposal involving low-oxygen environments — oil infusions, vacuum/sous-vide-style anaerobic holds, home canning, fermentation, curing — is flagged for mandatory safety-citation or refusal (the raw-garlic-in-room-temp-oil → *Clostridium botulinum* vector is the textbook case, and a real reported 2024 LLM failure).
- **Minimum cook-temp check.** Poultry, eggs, ground meat, and similar high-risk proteins are checked against deterministic minimum-safe-temperature/time rules — not generative "why" text.
- **Allergen check.** Ingredient and substitution suggestions are checked deterministically against `constraints.allergens` (via FoodOn ingredient-class relationships), not trusted to LLM recall (ChatGPT has recommended almond milk in a "nut-free" context).
- **Disclaimer.** A documented, surfaced disclaimer accompanies the system; the safety gate is a backstop, not a guarantee.

The **flavor-sandbox / discovery mode (§6.2-C) runs under this same gate** — exploratory novelty is exactly where toxic-combination and unsafe-technique risk concentrates. The P2 substitution agent's deferral is flagged as a **safety-relevant** deferral, not merely a scope one.

---

## 9. Evaluation strategy — the hero artifact (reframed)

The eval harness is the single highest-signal deliverable. Build it **early** and measure as you go. **The hero is the methodology and the process metrics — not the grounding number.** "I built the apparatus to measure my own assumption rigorously, and reported the real result" is the signal; the engineering spine and the eval methodology read as the flagship *even under a null ablation*, because neither depends on flavor-pairing being true.

### 9.1 Hero metrics — process-level and sign-robust
These are the headline, and they read regardless of which way grounding lands. Reported in this order — benchmark-based first, operator telemetry below it:
- **Claim-provenance rate** and **hallucination rate** (human-labeled on a fixed, versioned benchmark set).
- **Gate accept / edit / reject / redirect dynamics per move** — reported as **operator / autobiographical-design telemetry** (Neustaedter & Sengers; CHI 2024 autoethnography review, dl.acm.org/doi/10.1145/3613904.3642355), not a user-research quality signal: there is exactly one human generating these decisions (the author), so this is always reported as an **explicit N** (e.g., "N=140 gate decisions across 12 sessions, single operator") broken down **per move-category**, never as a bare %.

### 9.2 Supporting result — the grounding ablation (openly hedged)
A demoted, honestly-framed *supporting* finding, not the headline. The hypothesis: does grounding measurably beat an **ungrounded 2026 LLM baseline**? We **keep three arms** — the FlavorGraph-only arm is retained deliberately because it aids *null-interpretability* (under a null, a 2-arm design can't distinguish "grounding doesn't help" from "this retrieval impl is weak"):
1. **Ungrounded** — modern LLM, no retrieval.
2. **FlavorGraph-only** — the contested pairing signal alone.
3. **Grounded (P0)** — FlavorGraph + USDA/FoodOn deterministic resolution. *(Live-literature retrieval enters as a fourth arm in P1, layered on this working ablation.)*

We **expect, and pre-register, a nuanced result**: grounding most plausibly helps *correctness/provenance* (and much of that win is really the deterministic USDA/entity path, which we already route around the LLM — so we will not dress a calculator-beats-LLM result up as a flavor-grounding win), and most plausibly shows a *modest or null* effect on creativity-quality, which is the scientifically expected outcome given the pairing hypothesis is itself contested. The README says this *before* the run, so a null reads as a confirmed prediction, not a disappointment.

### 9.3 Borrowed task metrics (scoped honestly)
- **FoodPuzzle molecular-flavor accuracy** — borrowed as a **chemistry-knowledge proxy metric only.** It measures flavor-chemistry recall/inference on an existing molecule↔food database; it does **not** establish that a proposed dish tastes good, is novel, or is correct. The writeup scopes it explicitly so "high FoodPuzzle accuracy" is never mistaken for "dishes taste better."
- **Recipe1MSubs MRR** — only if substitution is in scope (P2).

### 9.4 Reproducibility & rigor
- **Pin/vendor** all weights and data; **fix and version the benchmark set itself** (a git-tracked fixture with a changelog — the eval gets the same versioning discipline the draft does).
- **Inter-rater reliability spot-check** — **a second labeler (a friend/labmate — not persona-screened)** double-labels ~15–20% of the benchmark set and we report **Cohen's kappa + a confusion matrix** (true inter-rater, not intra-rater; kappa>0.6 = substantial, <0.4 = ambiguous rubric — mbrenndoerfer.com/writing/inter-annotator-agreement-kappa-alpha-reliability; arxiv.org/html/2506.13639v1); cheap, and it materially strengthens the credibility of the hero for reviewers who scrutinize methodology. README states this plainly: **"a labeling-reliability check, not a user study."**
- **Tracing is a hard dependency of the eval** (the harness replays the move/gate event log) — so tracing is an explicit P0 item, not an NFR afterthought.
- Publish the methodology and a results table; ship the scripts. The README **opens** with the methodology and the **process** results — including a null/modest grounding result reported plainly in a clearly-labeled supporting section.

### 9.5 Labeling scheme (rubric)
Two separate labeling tasks, not one:
- **(a) Per-claim provenance/hallucination** — nominal categories *grounded-correct · grounded-mischaracterized · correctly-unverified* (all count FOR the system) *· hallucinated · opinion/non-checkable* (excluded) → scored with **Cohen's kappa** (RAGTruth/FaithBench style — arxiv.org/html/2401.00396v1, arxiv.org/html/2410.13210v1).
- **(b) Per-arm/per-dish quality** — technique correctness, provenance completeness, novelty (single-rater), safety-gate false-negative/false-positive — rated by one rater, not double-labeled.

Process: freeze the category definitions before labeling; run a calibration pass; report the confusion matrix alongside kappa. At ~200 claims with 15–20% double-labeled (≈30–40 claims), kappa is computable but the confidence interval is wide — the writeup says so rather than over-claiming precision.

**Labeler criterion is task-competence, not persona-representativeness:** enough food literacy to judge whether a cited source supports a claim, plus attention to follow the rubric — a friend/labmate/colleague qualifies. The wk-0 self-interview subject (the author, §16.1) is **not** reused as the second labeler — that would collapse inter-rater back into intra-rater. The README states plainly that the labeler pool is a convenience sample of one additional person, not a validated panel.

---

## 10. Data foundation (open, license-clean)

All seven licenses below were verified against primary sources and check out — this table ships largely as-is.

| Asset | License | Role | Caveat |
|---|---|---|---|
| **USDA FoodData Central** | CC0 | Deterministic **nutrition** + canonical entities (zero flavor data); **NOT cost** — FDC carries no price data | Free API + bulk; cleanest |
| **FoodOn** | CC BY 4.0 | Ontology: entity resolution, allergen/constraint vocab (zero flavor data) | Actively maintained (OBO Foundry) |
| **FlavorGraph** | Apache-2.0 | **One contested** flavor-pairing signal (pairing embeddings) | Stale (~2020–21), README still "to appear" — vendor/pin; cuisine-biased |
| **KitcheNette** | Apache-2.0 | Optional pairing-score signal | Stale; pin |
| **Live flavor-science literature** | varies | Hybrid retrieval — **P1**, not P0 | Retrieve + cite; respect source terms |
| **Recipe1MSubs** (from GISMo) | GISMo CC-BY-NC | Substitution **benchmark only** (P2) | Non-commercial → benchmark, don't ship |
| **Nutrition5k / Food-101** | CC BY 4.0 / research | Future multimodal | Defer |

**Cost data note:** cost is a static `[approximate]` ingredient-price table maintained outside USDA data, not attributed to FDC. ERS "Purchase to Plate" (ers.usda.gov/data-products/purchase-to-plate) is a **P1 option** if pursued further — it needs an NHANES↔FDC crosswalk that P0 doesn't build.

**Flavor-pairing successors (watch, not swap):** FlavorDiffusion (arXiv:2502.06871) and Epicure (arXiv:2605.22391) were both checked and rejected for P0 — logged as **P1 watch-items**, not swap-ins for FlavorGraph.

**Traps:** Recipe1M/1M+ non-commercial + registration-gated; FoodBERT/RecipeNLG-code no-license; weight link-rot (vendor + pin). Build a **lighter KG from FoodOn + USDA** rather than full FoodKG (whose canonical build depends on the gated Recipe1M+ files — confirmed in its own ISWC 2019 paper). Cite the **canonical `foodkg/foodkg.github.io`** (Haussmann et al., ISWC 2019, Apache-2.0) — an unrelated, unlicensed `Gharibim/FoodKG` shares the name.

---

## 11. Requirements (tightened MoSCoW)

### P0 — the demoable spine (two deep pillars + the minimum around them)

**The two things to go deep on:**
- **P0-A (Pillar 1) — the move/gate state machine + proposal contract + version chain, hand-rolled.** Move/gate engine with the six verbs (no autonomous "ship"); idempotent accept; take-over reconciled to the log; the Proposal contract (diff + rationale + citations + confidence + `[unverified]` + safety status); the git-style snapshot+diff+branch versioned draft; the minimal autonomy dial (deterministic auto-advance only).
- **P0-B (Pillar 2) — the eval harness + methodology with sign-robust hero metrics.** Hero process metrics (provenance/hallucination rate + gate dynamics); the 3-arm grounding ablation as a supporting result; a fixed, **versioned** benchmark set; an inter-rater reliability spot-check; **tracing** (replayed from the move/gate event log — a hard dependency).

**The minimum that makes the pillars real:**
- **P0-1** Seed intake + constraints.
- **P0-5** Deterministic services: **nutrition via USDA** (authoritative) **+ cost via a static `[approximate]` table** (NOT USDA — FDC has no price data).
- **P0-6** One **grounded generative capability** (flavor reasoner, cuisine-aware) **with a toggleable ungrounded baseline**.
- **P0-7** Grounding layer = **FlavorGraph + USDA/FoodOn only**, toggleable. *(Live literature → P1.)*
- **P0-7b** **Deterministic safety gate** (§8.7): anaerobic-preservation blocklist + min cook-temps + allergen check + disclaimer.
- **P0-8** Minimal **iterate-on-feedback** loop (post-cook feedback → a single re-proposal cycle against the cooked version).
- **P0-9** **SSE streaming + single-process in-session cancel** (separate cancel endpoint).
- **P0-11** Deployed demo + README leading with **methodology + process results** (grounding number in a supporting section).

**Acceptance (samples):** a move emits a Proposal and **halts** — no draft change without a human verb; a double-click *accept* produces exactly one version (idempotent); *redirect* mid-stream cancels and re-runs without losing the current version; a *take-over* edit writes a synthetic diff so history stays complete; an ungroundable claim renders `[unverified]`; an anaerobic-oil-infusion proposal is **blocked** by the safety gate before reaching the cook; the same orchestrator runs grounded and ungrounded arms; the eval reconstructs gate dynamics by replaying the event log; a deterministic move auto-advances only when the dial is on.

### P1 — depth
Live-literature retrieval (layered on the working ablation, adding a fourth arm); technique/why explainer; flavor-exploration front door (mode C, under the safety gate); richer post-cook iteration; the full per-capability autonomy dial; observability/tracing polish; branching + side-by-side compare.

### P2 — breadth
Substitution agent + Recipe1MSubs scoring (**a safety-relevant deferral**, not just a scope one); substitution-model retraining; multi-capability orchestration; caching + cost controls.

---

## 12. Non-functional requirements & production hygiene
Version control; structured logging; error handling; automated tests (deterministic services and the **safety gate** unit-tested against fixtures); monitoring; Dockerized, reproducible setup; pinned/vendored weights + data; token accounting; license-clean assets only with provenance tracked end-to-end. (Full move/gate **tracing** is *not* listed here — it is promoted to P0-B, since the eval can't run without it.) These are the engineering signal — treat them as P0-adjacent, not afterthoughts.

---

## 13. Key decisions & trade-offs

| Decision | Rationale | Trade-off |
|---|---|---|
| Human-gated loop (not autonomous) | The product's identity + the systems story; the same researched HITL primitive as Magentic-UI (arXiv 2507.22358) | Latency/effort vs one-shot — intended; mitigated by the minimal autonomy dial |
| **Git-style version chain (not "event-sourced")** | Delivers undo/compare/branch/iterate-against-cooked at a fraction of CQRS build cost; honest label = real signal | Slightly less buzzword shine — the simpler claim is the truer and more buildable one |
| **True event-sourcing only on the move/gate event log** | An append-only stream replayed for eval metrics is where event-sourcing actually earns its keep | One real event-sourced surface, scoped tightly |
| Deterministic/generative split | Correctness + trust + "not a wrapper" | More components — a clean boundary |
| **Deterministic safety gate that can block** | Physical-stakes failures (botulism, undercooking, allergens) need a block, not a confidence label | A narrow blocklist will miss edge cases — calibrated to a demo, with a disclaimer |
| **Hero = process metrics + methodology** | Survives a null ablation; **where the engineering shines** is durability + numbers you can actually trust — nutrition is USDA-authoritative, cost is a clearly-labeled approximate estimate — not flavor grounding; the gate-dynamics leg is reported as operator telemetry (explicit N, never a bare %), below the benchmark-based provenance/hallucination leg | The grounding number is a footnote, not a headline — by design |
| **Grounding as a measured, demoted component** | Honest, higher-signal; FlavorGraph is contested 2011-lineage science, not a moat | The ablation may show little — *that's still a publishable, pre-registered result* |
| **Live retrieval deferred to P1** | It's the timeline-killer; decoupling it protects the hero | Less retrieval sophistication in P0 — a reviewer cares more about the gate + methodology |
| SSE + separate cancel endpoint (locked) | Matches OpenAI/Anthropic practice; simpler than bidirectional WS | Single-process, in-session cancel only — stated as a choice, not a gap |
| Ruthless P0 scope around two pillars | Depth+rigor on one loop signals seniority | Less breadth — deliberately |

---

## 14. Risks & open questions

- **[demo-design risk] Does the durability/versioning edge read convincingly in a demo, or does the gate look like friction?** The competitor is ChatGPT + companions, not ChefGPT; where the engineering shines is **durability/resumability + numbers that are actually trustworthy** (nutrition USDA-authoritative, cost a clearly-labeled approximate estimate) — which the hero process metrics measure directly. There is no external user test to de-risk this (see "v0 scope decisions" #4 — retired); the mitigation is **demo design**: script the README/demo around the **multi-iteration, multi-day** case (the miso-carbonara-style scenario), which is self-verifiable and non-gated by any external subject — that is exactly where the versioning/gate machinery becomes legible. Note: ChatGPT's mid-2026 memory upgrade (recall, not a versioned/diffable/gated artifact — §3.2) narrows the perceived gap without closing it, which sharpens why the demo has to make the *mechanism* visible, not just claim a recall win.
- **[portfolio-honesty risk] By design — the author is the spec; external judgment is explicitly out of scope for this deliverable.** This is not a confession of a missing user study; there is no market to validate and no persona to represent beyond the author's own. Optional, non-gating garnish: if 1–2 cooks are shown the demo informally, the README gets one sentence about their reaction; if not, the project ships without it — neither path blocks anything.
- **[supporting, pre-registered] Is grounding's value worth the infra?** Expect "helps correctness/provenance more than creativity," with much of the correctness win actually belonging to the deterministic path. Report honestly.
- **[scope] Is the P0 loop achievable solo in a semester?** Yes — see §15. The reshape around two pillars, live-retrieval deferral, and the calibrated (not FDA-grade) safety gate are what make it fit.
- **[data] FlavorGraph staleness/coverage + cultural bias** — pin a copy; make suggestions cuisine-aware; lean on P1 live retrieval for freshness later.
- **[safety] The blocklist is narrow by design** — it will not catch every unsafe proposal; the disclaimer and the discovery-mode gate are the backstops.

---

## 15. Feasibility verdict & roadmap (semester-scale, portfolio-tuned)

**Verdict: rescope, not no — buildable solo in a semester.** The four load-bearing pillars (gated state machine, versioned/branchable draft, deterministic/generative split, eval harness) are the *right* things to build to read as senior engineering, and each has real precedent and is individually buildable solo. The v0.2 risk was that two of eleven P0 items (an over-labeled "event-sourced" draft and a 3-source hybrid retrieval) were scoped at production fidelity inside one 5-week window. v0.3 fixes that: the draft is a git-style version chain (a fraction of the build/debug surface), live retrieval is deferred to P1, the safety gate is a calibrated blocklist (not a rules engine), and P0 is reshaped around two deep pillars with everything else thinned explicitly.

| Phase | Goal | Exit criterion |
|---|---|---|
| **v0 — Scaffold + pre-register (wk 0–1)** | Repo skeleton; vendor FlavorGraph, load USDA/FoodOn; **stand up the eval harness shell + tracing**; sketch the safety blocklist; **write the README methodology + hypothesis before any run** | The 3-arm harness runs an empty baseline; tracing emits a replayable event; **README pre-registers the ablation and what a null means** — no external subjects |
| **v1 — Pillar 1: the loop (wk 2–6)** | P0-A + P0-1, P0-5, P0-6, P0-7, P0-7b, P0-9: hand-rolled gated loop + version chain + idempotent accept + deterministic services + cuisine-aware grounded capability with baseline toggle + safety gate + SSE/cancel + minimal autonomy dial | A cook takes a seed to a finished, grounded, costed, *safety-screened* dish entirely through gated moves; both ablation arms run; an unsafe proposal is blocked |
| **v2 — Pillar 2: measure + iterate + deploy (wk 7–10)** | P0-B + P0-8, P0-11: hero process metrics + 3-arm ablation + versioned benchmark + inter-rater spot-check; post-cook iteration; provenance/safety UI; deploy | README results table led by **process metrics** (provenance/hallucination + gate dynamics), grounding ablation in a supporting section; live demo |
| **v3 — Depth (wk 11–13)** | P1: live-literature retrieval (4th arm), technique explainer, flavor sandbox (under the safety gate), branching/compare, full autonomy dial | The "why" + exploration modes live; compare-variations works; the live-retrieval arm reports |
| **Stretch** | P2: substitution + Recipe1MSubs (safety-relevant); caching/cost controls | — |

---

## 16. Future / deferred
Pantry-truth inventory; multi-user/dinner-party co-editing; multimodal (Nutrition5k, Food-101); offline/edge inference; in-cook voice/hands-free mode; the **engine → pro generalization** (the grounded flavor/cost engine could later wear a professional creative-R&D face — same core, different surface); the engine shipped as a standalone open primitive. Live-literature retrieval is *not* here — it is committed P1 (§11).

### 16.1 Requirements exploration (author self-interview, 2026-06-30)
Surfaced by an author self-interview (n=1 — `docs/research/07-pilot-interview.md`) — a **requirements-elicitation exercise, not a go/no-go validation study.** There is no market to validate; the author is a real member of the persona, and the interview's job is to check whether the design's shape holds up against a real cook's own workflow, not to clear a recruiting bar. Explicitly **out of P0** — v0 proves the one deep loop first.

- **R1 — Multi-project workspace.** An organized portfolio of independently-developable dish projects, vs. the single-draft workbench of P0.
- **R2 — Per-project knowledge base / long-term memory** (extends §8.3's `iteration_log` + steering persistence):
  - **Contents — all four load-bearing:** rejected attempts + *why* (agent never re-proposes a killed direction) · taste calls (subjective verdicts the model can't derive) · accepted citations (approved provenance, not re-litigated) · post-cook feedback (reality-check for the next iteration).
  - **Scope = per-project siloed.** Persona explicitly rejected cross-project/profile-level taste learning — no "system thinks it knows my taste." Markedly cheaper than a global taste model; removes an over-generalization failure class.
- **"Fan out & verify" resolved to a single fast grounded agent, not a swarm.** Pushed on latency, the persona wanted one quick agent with specialized access to the food embedding model / food DB — which *is* the P0 architecture (§8.4). Multi-agent reading considered and rejected by the persona on latency grounds.
- **Scope discipline.** R1/R2 stay P1+; the v0 deliverable remains the one deep gated loop + eval harness.

---

## 17. README-style pitch (drop on the repo)

> **Dish Development Workbench** — an open-source, self-hostable system that helps serious home cooks *develop and understand their own dishes*, not just generate recipes. Unlike a chatbot that hands you a finished recipe, it works as a **human-in-the-loop co-development loop**: a hand-rolled, interruptible state machine proposes dish moves, builds and scales the dish with **deterministic nutrition you can trust (USDA FoodData Central) and a reasonable, clearly-approximate cost estimate** (never the model's arithmetic), runs every proposal through a **deterministic food-safety gate** that can block it, keeps a **versioned, branchable draft** so you can iterate against the exact version you cooked — and every step pauses for your call.
>
> **The flagship is the engineering and the evaluation methodology.** The repo ships a reproducible eval whose headline metrics are *process* quality — claim-provenance/hallucination rate (benchmark-based) and the accept/edit/reject dynamics of the gate, reported as **operator telemetry with an explicit N** (a single-operator autobiographical-design signal, never a bare %) — which hold their meaning whatever the model does. As a supporting, openly-hedged experiment, it asks whether grounding a model in a (contested, 2011-lineage, cuisine-specific) flavor-pairing signal actually beats just asking a strong 2026 LLM — and reports the real answer, including a null. Building the apparatus and measuring honestly is the point; the grounding number is a footnote, not the pitch.
>
> Related work: IBM Chef Watson; FoodPuzzle (KDD'25); FoodSky (Patterns'25); Magentic-UI (arXiv 2507.22358) for the human-in-the-loop interaction model.

---

## Appendix A — Glossary
Food-pairing hypothesis (contested; Western-specific, inverted for East/South Asian cuisines); flavor network; food-bridging; ingredient embeddings (FlavorGraph / food2vec); cross-modal recipe retrieval; ingredient substitution graph; Recipe1MSubs; molecular descriptors; knowledge graph / ontology (FoodKG / FoodOn); move / gate; **version chain (snapshot+diff+branch)**; **event sourcing (move/gate event log only)**; **deterministic safety gate**; ablation; approval fatigue.

## Appendix B — References (verify before relying)
USDA FoodData Central (CC0); FoodOn (CC BY 4.0); FlavorGraph (Apache-2.0, Park et al. 2021, *Scientific Reports*); KitcheNette (Apache-2.0, 2019); GISMo / Recipe1MSubs (CC-BY-NC, Fatemi et al. 2023); Nutrition5k (CC BY 4.0); Food-101; **FoodKG** (Apache-2.0, Haussmann et al., ISWC 2019 — cite canonical `foodkg/foodkg.github.io`); **food-pairing literature, treated as contested** (Ahn et al. 2011, *Sci. Rep.* — significant for Western cuisines, inverted for East Asian; Jain, Rakhi & Bagler 2015, *PLOS ONE* — negative pairing across Indian cuisines; Varshney et al. 2013 — database-sensitive sign flip; Kim, Kim & Park — food-bridging); **FoodPuzzle (KDD 2025, arXiv 2409.12832 — retrieval is a design contrast, not a demonstrated ablation); FoodSky (Cell Patterns 2025 — ~83%/91% published figures, primary text paywalled; beats ChatGPT-3.5 and a field of 7–13B baselines); Magentic-UI (arXiv 2507.22358); FoodGuardBench / "Cooking Up Risks" (arXiv 2604.01444)**; **Caprioli et al., npj Science of Food 9:242 (2025), nature.com/articles/s41538-025-00588-4 / arXiv:2408.15162 — a fresh 2025 consensus reaffirming food-pairing is contested/cuisine-specific**; **FlavorDiffusion (arXiv:2502.06871) — checked & rejected for P0, P1 watch-item**; **Epicure (arXiv:2605.22391) — checked & rejected for P0, P1 watch-item**; IBM Chef Watson (2014, consumer apps retired). Plus the consumer-market and companion landscape (ChefGPT, FoodsGPT, DishGen, **Macaron — a general personal-AI agent, cooking is one feature**, MyChefAI) for positioning. **Cost-source note:** cost is a static `[approximate]` table, not USDA-sourced; ERS "Purchase to Plate" (ers.usda.gov/data-products/purchase-to-plate) is a P1 option.

> Verify every license, link, and maintenance status against the source before depending on it — several research assets are stale and some links rot. The detailed claim-by-claim verification lives in `docs/research/` (architecture, culinary, product-ux, market-feasibility, critique) and the synthesis in `docs/research/DESIGN-MEMO.md`.
