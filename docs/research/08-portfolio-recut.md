# 08 — Portfolio-Recut: Decisions Review + DESIGN.md v0.4 Change-Set

> **Synthesis of the portfolio-lens re-cut.** Merges four reviewer reports (architecture, culinary/grounding, eval, positioning) + one adversarial Critic verdict, all under one lens: **CapyCook is a self-built experimental agentic app the author is building to showcase on their resume (general-SWE / systems internships). There is no market to validate.** The test for every decision is: *does it maximize engineering signal + intellectual honesty for a portfolio reviewer* — not "would a market of cooks want it." The author IS the user; the author's preferences are simply the spec (no "biased n=1" apology owed).
>
> **Inputs read:** `scratchpad/recut/00-inventory.md` (Sections A/B/C/D), `reviewer-arch.md`, `reviewer-culinary.md`, `reviewer-eval.md`, `reviewer-positioning.md`, `critic-verdict.md`, and `DESIGN.md` v0.3.1 (line refs below are against that file).
>
> **Status:** verdict set for approval. This file is a **specification**; the actual overwrite of `DESIGN.md` → v0.4 (and the satellite-doc edits) is a later Builder stage, AFTER the user approves this. Nothing outside this file has been edited.

## Headline / recommendation
**SHIP TO BUILDER with the Critic's 3 mandatory changes applied.** The design is fundamentally sound under the reframe: the market-validation apparatus drops cleanly, the engineering spine and eval methodology survive untouched, and the reviewers converge. Of 48 Section-A decisions, **41 KEEP / 2 REVISE / 4 REFRAME / 1 DROP / 0 KILL** — every REVISE/REFRAME/DROP is a *label or framing* change, not a capability cut; **zero P0 build creep** (Critic-confirmed). The only substantive honesty defect is the **`cost (USDA)` over-attribution** (USDA FoodData Central has no price data) — a second instance of the source-overclaim pattern the prior review already caught once, and it reaches the README pitch. Fix = split trust tiers everywhere; it is a scope *reduction*.

---

# PART 1 — Decision verdict set

## 1.1 Verdict tally (Section A — all 48)

| Verdict | Count |
|---|---|
| KEEP | 41 |
| REVISE | 2 |
| REFRAME | 4 |
| DROP | 1 |
| KILL | 0 |
| **Total** | **48** |

- **REVISE (2):** Eval-1 (hero gate-dynamics framing), Eval-4 (inter-rater labeler framing).
- **REFRAME (4):** Product-1 (persona), Product-6 (durability "edge"), Product-10 (competitive positioning), Feasibility-6 (roadmap v0 phase).
- **DROP (1):** Product-7 (wk-0 user test).

Section C (9 market-premised items) is scored separately in §1.3: **2 DROP, 7 REFRAME.** Section D (12 gaps) in §1.4: **11 RESOLVED, 1 DEFERRED-build-time.**

## 1.2 Section A verdicts, by domain

Evidence column is mandatory for every non-KEEP (AC3); KEEP rows carry a coherence/one-line rationale, and note fresh evidence where a reviewer supplied it. Where a decision's *motivation* is reframed but the decision itself stands, the row is KEEP and cross-references the Section-C item that owns the motivation change.

### Architecture & systems (10) — 10 KEEP
| # | Decision | Verdict | Rationale / evidence |
|---|---|---|---|
| A-arch-1 | State-machine move/gate control | KEEP | Strongest "not a wrapper" signal; portfolio lens removes the market-friction cost. Add a one-sentence "why not LangGraph" rebuttal — a bounded 6-verb machine with <3 branching points and no durable-checkpoint need clears the DIY bar (developersdigest.tech/blog/managed-agents-vs-langgraph-vs-diy-2026). |
| A-arch-2 | Git-style version chain (not event-sourced) | KEEP | Cleanest honesty win in the doc; unchanged by new evidence. |
| A-arch-3 | Deterministic/generative split | KEEP | No change; cleanest boundary. |
| A-arch-4 | SSE + separate cancel endpoint | KEEP | 2026 sources confirm SSE remains standard, now also the A2A/MCP transport (pockit.tools/blog/llm-structured-output-complete-guide). |
| A-arch-5 | Durable-execution scoped to single-process in-session cancel | KEEP | Decision stands; currency fix only — name **DBOS Transact** (dbos.dev/blog/what-is-lightweight-durable-execution) and explicitly DECLINE it (nothing lost pre-accept). Decline-only wording per Critic guard. |
| A-arch-6 | Idempotent "accept" | KEEP | Matches 2026 idempotency-key production pattern. |
| A-arch-7 | Take-over reconciled with version log | KEEP | Closes the untracked-provenance gap. |
| A-arch-8 | Tracing promoted to P0 | KEEP | Correct dependency fix — eval replays the event log. |
| A-arch-9 | Flat vector index for FlavorGraph | KEEP | Similarity lookup, no multi-hop traversal — right-sized. |
| A-arch-10 | Three ablation arms (not two) | KEEP | Cost objection is architecturally weak (one enum value on an already-required toggle); null-interpretability argument owned by eval domain. |

### Grounding & culinary science (8) — 8 KEEP
| # | Decision | Verdict | Rationale / evidence |
|---|---|---|---|
| A-cul-1 | Food-pairing = contested/culture-specific/db-sensitive | KEEP (strengthened) | Fresh Nov-2025 consensus restates the doc's framing 14 yrs after Ahn 2011: Caprioli et al., *npj Science of Food* 9:242 (2025), nature.com/articles/s41538-025-00588-4 / arXiv:2408.15162. Add to Appendix B. |
| A-cul-2 | USDA = deterministic nutrition ground truth | KEEP | CC0; FDC monthly cadence (v15.1, May 2026); zero flavor data confirmed. |
| A-cul-3 | FoodOn = identity/taxonomy | KEEP | CC BY 4.0; latest 2025-08-01; actively maintained. |
| A-cul-4 | FlavorGraph = the one contested flavor signal | KEEP (stronger staleness note) | Repo abandoned (github.com/lamypark/FlavorGraph, Py3.5.2/PyTorch1.0.0 pins, "to appear" placeholder). Successor **FlavorDiffusion** (arXiv:2502.06871) = "checked & rejected for P0, P1 watch-item," NOT a swap-in (Critic guard). |
| A-cul-5 | Live retrieval → P1 | KEEP | Engineering/timeline call, not market-premised. |
| A-cul-6 | Deterministic safety gate | KEEP; motivation → **REFRAME** (see C9) | Gate stays non-negotiable P0. Culinary's "motivation REVISE" = positioning's "C9 REFRAME" — same recommendation, different vocabulary; the *decision* is KEEP, the *why* is reframed in §1.3-C9. |
| A-cul-7 | Cuisine-aware flavor reasoning | KEEP | Reinforced by the 2025 npj paper (positive Western, negative/irrelevant East/South Asian). |
| A-cul-8 | Discovery mode under same safety gate | KEEP | Novelty↔hazard correlation is a culinary fact; survives the reframe. |

### Eval methodology (6) — 4 KEEP, 2 REVISE
| # | Decision | Verdict | Rationale / evidence |
|---|---|---|---|
| A-eval-1 | Hero = process metrics; grounding demoted | **REVISE** | Keep the grounding demotion; fix the hero's *internal* framing. Provenance/hallucination is benchmark-item-based (n=1-proof). Gate accept/edit/reject dynamics have a statistical unit of "one human × a proposal" — and there is exactly ONE human. Copilot/Cursor accept-rates are meaningful only aggregated over tens of thousands of devs (axify.io/blog/github-copilot-metrics). At n=1 a bare % invites the exact reviewer question this recut exists to preempt. Relabel to **operator/autobiographical-design telemetry** (Neustaedter & Sengers; CHI 2024 autoethnography review, dl.acm.org/doi/10.1145/3613904.3642355): report explicit N ("N=140 gate decisions across 12 sessions, single operator"), never a bare %; break down per move-category; keep in the hero section but below benchmark-based provenance/hallucination. |
| A-eval-2 | Three-arm ablation | KEEP | Benchmark unit = scenario × config; orthogonal to user count. Null-interpretability argument holds. |
| A-eval-3 | FoodPuzzle = chemistry-knowledge proxy only | KEEP | Matters MORE under the reframe — a technical reviewer will check the citation scoping. |
| A-eval-4 | Hand-labeled benchmark + inter-rater spot-check (2nd labeler on 15–20%) | **REVISE** | Decision survives on eval-credibility grounds ("who checked the person grading their own homework?") — the ONLY place a second human eye touches results. Strip the market/recruiting framing: "second serious cook" → "a second labeler (friend/labmate, NOT persona-screened)"; report **Cohen's kappa + confusion matrix** (kappa>0.6 substantial, <0.4 = ambiguous rubric — mbrenndoerfer.com/writing/inter-annotator-agreement-kappa-alpha-reliability; arxiv.org/html/2506.13639v1); README sentence: "a labeling-reliability check, not a user study." |
| A-eval-5 | Versioned benchmark set | KEEP | Reproducibility hygiene; mirrors the draft's versioning. |
| A-eval-6 | FoodPuzzle "live retrieval beats static RAG" = design contrast | KEEP | Citation-accuracy correction; matters more under reframe (audience checks primary sources). |

### Product / positioning (12) — 8 KEEP, 3 REFRAME, 1 DROP
| # | Decision | Verdict | Rationale / evidence |
|---|---|---|---|
| A-prod-1 | Persona (serious home cook, multi-day iteration) | **REFRAME** | Recast from "recruiting target / market size" to an **illustrative narrative that shows the design isn't arbitrary.** Delete "reachable for an n=5 validation test" (§5:98). Coherence: no market to size or reach → persona is evidence the design has a shape, not a TAM. |
| A-prod-2 | JTBD (get better / understand why / creative agency) | KEEP | Engineering-motivating; not market-premised. |
| A-prod-3 | Two-pane model + six-verb gate (Magentic-UI precedent, arXiv 2507.22358) | KEEP | Researched HITL primitive; strongest interaction-design signal. |
| A-prod-4 | Six-verb gate (richness vs fatigue) | KEEP | Approval-fatigue is the best-documented gate-everywhere failure mode (DeepMind "AI Agent Traps," Franklin et al. 2025). |
| A-prod-5 | Autonomy dial (auto-advance deterministic only) | KEEP | Mitigates approval fatigue; minimal in P0. |
| A-prod-6 | Durability/resumability = the real "edge" | **REFRAME** | Drop the competitive-market word "edge" → "**where the engineering shines.**" Coherence: durability is a demoable engineering property, not a moat; the reframe removes a market claim without cutting anything built. |
| A-prod-7 | Wk-0 user test (n=5, "0/5 is a real no-go") | **DROP** | "0/5 is a no-go" is definitionally market-validation (Critic-confirmed). No recruiting, no n=5, no "steers scope" exit. Replaced by pre-registration of the eval methodology before any run (see C2, §15). |
| A-prod-8 | Hands-dirty boundary (pre/post-cook, not in-cook) | KEEP | Now evidenced against a real 2026 product: Fresco (in-cook connected-appliance, PRNewswire June 2026) is the *opposite* boundary — confirms hands-dirty is a deliberate scoping decision, not a gap. |
| A-prod-9 | Multi-day session continuity | KEEP | Confirmed by the self-interview (07-pilot Q3: "clear context / open a new chat" destroys iteration history). |
| A-prod-10 | Competitive positioning ("not found in this landscape scan") | **REFRAME** (purpose) | Landscape claim STILL HOLDS for 2026 (positioning re-scanned Macaron, Fresco, ChatGPT memory, Canvas sunset, CookBench arXiv 2508.03232 [robotic], Epicure arXiv:2605.22391). Reframe the *purpose*: value = "did the homework, mapped the landscape, found a specific gap" (engineering judgment), NOT market-defensibility/moat. |
| A-prod-11 | "ChatGPT = de facto default" | KEEP (context update) | Add one sentence: OpenAI's June-2026 memory upgrade (recall 67.9%→82.8%, remembers year-old chats — TechRadar/Neowin) NARROWS but doesn't close the gap — recall ≠ a diffable/branchable/versioned/grounded artifact with a gate. Pre-empts "doesn't ChatGPT do this now?" |
| A-prod-12 | Real edge reframed (durability + trustable numbers, not flavor grounding) | KEEP | Correct under reframe; "trustable numbers" wording is softened by the cost tier-split (see §1.5 / Critic change 1). |

### Feasibility & scope (6) — 5 KEEP, 1 REFRAME
| # | Decision | Verdict | Rationale / evidence |
|---|---|---|---|
| A-feas-1 | Solo-semester "rescope, not no" | KEEP | Load-bearing pillars each individually buildable solo. |
| A-feas-2 | P0 reshaped around two pillars | KEEP (non-negotiable) | One deep loop + eval harness; guarded against creep. |
| A-feas-3 | Live-literature retrieval → P1 | KEEP | Decouples the timeline-killer from the hero. |
| A-feas-4 | Event-sourced draft → version chain | KEEP | Build-cost cut + honesty win. |
| A-feas-5 | Three-arm ablation cost vs signal | KEEP (non-negotiable) | Kept for null-interpretability. |
| A-feas-6 | Phased roadmap v0–v3 | **REFRAME** | v0 phase is market-premised ("Validate + scaffold" / "user-test result steers mode A scope"). Rename to **"Scaffold + pre-register (wk 0–1)"**; exit criteria = harness runs empty baseline + tracing replay + README pre-registers the ablation and what a null means — no external subjects. Frees ~one afternoon → redirect to pre-registration (not timeline compression). |

### Data & licensing (2) — 2 KEEP
| # | Decision | Verdict | Rationale / evidence |
|---|---|---|---|
| A-data-1 | All seven dataset licenses verified | KEEP | Re-verified this pass. |
| A-data-2 | Lighter KG from FoodOn+USDA (avoid gated Recipe1M) | KEEP | Avoids the gated Recipe1M+ dependency. |

### Safety (4) — 4 KEEP
| # | Decision | Verdict | Rationale / evidence |
|---|---|---|---|
| A-safe-1 | Safety gate as deterministic service | KEEP; motivation → REFRAME (C9) | Same decision as A-cul-6; gate stays P0, motivation reframed. |
| A-safe-2 | Blocklist + disclaimer (not FDA engine) | KEEP | *More* clearly correct under the portfolio lens — a full FDA rules engine = over-engineering that blows the scope budget. |
| A-safe-3 | Hard block (not override) in v0 | KEEP (strengthened) | Override existed for paying-user convenience (a market rationale); removing the market makes hard-block obviously correct and simpler to demo. |
| A-safe-4 | Discovery-mode safety = same gate | KEEP | Exploratory novelty is where toxic-combination risk concentrates. |

## 1.3 Section C — the 9 market-premised decisions (re-cut)

Each is DROP or REFRAME with its new framing (AC2). Note: positioning collapses C2+C6 into a single instrument (the wk-0/recruiting mechanism), so the **2 DROP are one conceptual instrument counted across two line-items**; the remaining 7 are REFRAME.

| # | Decision | Verdict | New framing |
|---|---|---|---|
| C1 | Persona sizing/targeting | **REFRAME** | Illustrative narrative that shows the design isn't arbitrary. Drop recruiting + market-sizing language ("no market to size or reach"). Evidence: coherence — a portfolio reviewer reads persona as design-shape justification, not TAM. |
| C2 | Wk-0 user test as go/no-go gate | **DROP** | Retire it: no recruiting, no n=5, no "0/5 no-go," no "steers scope" exit; retire locked-decision #4. Replacement: "wk-0 = scaffold + pre-register the eval methodology + hypothesis in the README before any run — no external user test." Evidence: "0/5 is a no-go" is definitionally market-validation (Critic-confirmed); pre-registration is independently defensible (eval wants it), not a fig leaf. |
| C3 | "Hardest user to fool" motivation | **REFRAME** | Keep as an *engineering* motivation (high epistemic bar → forces rigorous eval/grounding). Drop the market-conversion read "if the hardest user won't buy, no one will" — which lives in the §14 bullet being deleted. Evidence: §5 already frames this as engineering; completing the reframe = removing the market bullet. |
| C4 | Competitor positioning ("no tool does X") | **REFRAME** (purpose) | Value = "mapped the landscape, found a specific gap" (engineering judgment), not a defensible moat. Landscape claim re-verified holding for 2026. Evidence: positioning 2026 re-scan (Macaron/Fresco/ChatGPT-memory/Canvas-sunset/CookBench/Epicure). |
| C5 | "Multi-day iteration = key differentiator" | **REFRAME** | Multi-day is the demo scenario that makes the durability engineering *legible*; script the README demo around it. Drop "where we compete / beat / edge." Evidence: coherence — the multi-iteration case is where the versioning/gate machinery is visible, independent of any market. |
| C6 | Recruiting arm's-length 5 cooks | **DROP** | Same instrument as C2 — the recruiting mechanism goes with the wk-0 study. Evidence: no market → no recruiting; the 2nd *labeler* (A-eval-4) is a SEPARATE instrument that survives on eval-credibility grounds (see §1.6). |
| C7 | Discovery mode as a feature | **REFRAME** | A *capability demo* — safe exploration via deterministic gating; the flavor-sandbox is an adversarial stress-test of the safety gate under novelty, not a "users want creative suggestions" feature. Evidence: novelty↔hazard correlation (culinary), reframe removes a demand claim. |
| C8 | Per-project KB / R1-R2 / pilot framing | **REFRAME** | R1/R2 stay P1+ vision. §16.1 becomes "Requirements exploration (author self-interview)," NOT "persona-validated … wk-0 pilot"; the pilot is requirements *elicitation*, not go/no-go validation. Evidence: 07-pilot-interview.md is an author self-interview (n=1); reframe matches its actual epistemic status. |
| C9 | Safety gate as market-required | **REFRAME** (motivation only; gate stays non-negotiable P0) | New §8.7 opener frames building the gate as an **engineering-signal** decision: correctly identifying the physical-stakes/no-stakes boundary (pH, water activity, temperature danger zone, allergen-class relationships) and encoding it as a *deterministic, blocking* service — rather than trusting an LLM disclaimer — IS the domain-rigor / systematic-risk-thinking signal; skipping it would be evidence the author didn't know where the hazards are. Evidence: FoodGuardBench / "Cooking Up Risks" (arXiv:2604.01444, Apr 2026): 3,339 FDA-grounded queries find LLMs "sparsely safety-aligned" in food + jailbreak-susceptible. |

**Decisions NOT market-dependent (confirmed staying):** hero-artifact reframe; four pillars; food-pairing-as-contested; corrected citations; the wk-0 protocol *methodology* survives only as pre-registration (honesty/rigor, not market).

## 1.4 Section D — the 12 gaps (RESOLVED / DEFERRED)

**11 RESOLVED, 1 DEFERRED-build-time.**

| # | Gap | Status | Recommendation / reason |
|---|---|---|---|
| D1 | Stack/impl choices (language, framework, DB, eval format) | **DEFERRED (build-time)** | The design is deliberately stack-agnostic; HANDOFF confirms the eval-harness skeleton "needs a stack decision first." This is an execution choice with no design-level consequence — deferring it is the correct discipline, not a gap. |
| D2 | Streaming/interruption semantics | **RESOLVED** | Cancel = **discard-not-rollback** (nothing pre-accept to roll back); note provider-dependent stream granularity (Anthropic tool-use returns structured output as one block at stream end — pockit.tools); add two event types `move_cancelled`, `proposal_blocked` so cancel/block behavior is visible to the gate-dynamics hero metric. |
| D3 | Deterministic-service boundaries | **RESOLVED** | Enumerate: scaling/unit conversion, **cost (static `[approximate]` table — NOT USDA)**, nutrition (USDA), FoodOn identity resolution, allergen check, safety blocklist (anaerobic + min-temp), idempotency-key resolution, version-chain integrity bookkeeping. Flag: `confidence` is LLM-emitted, NOT a deterministic service — must never become a gating input. *(Checklist corrected to "cost (static table)" — resolves the one cross-report contradiction; see §1.6.)* |
| D4 | Grounding-signal fusion strategy | **RESOLVED** | No real fusion problem in P0 — USDA/FoodOn/FlavorGraph are claim-type-disjoint (nutrition/cost vs identity vs flavor-pairing). Routing is **BY CLAIM TYPE, not numeric blend** — state explicitly. Pre-register the P1 tie-break: retrieved literature may only augment `rationale`+`citations[]`, never silently renumber FlavorGraph `confidence`; on direct contradiction apply a fixed deterministic confidence penalty + `[contested]` label (no learned re-ranker). |
| D5 | Cuisine scope for v0 | **RESOLVED** (already in doc) | Already covered by v0 scope decision #2 + §8.5 "v0 demo scope" (Western subset). Inventory was stale on this — close without edits. |
| D6 | Streaming vs batch proposal generation | **RESOLVED** | Hybrid: **batch the structured Proposal** (the safety gate needs completeness before it can screen), **stream only the free-text `rationale`.** Scope reduction, not creep. |
| D7 | Conversation-history scope | **RESOLVED** | Steering thread (verbatim) + decision/rationale log persist (already implicit in §8.3); raw provider CoT explicitly excluded (OpenAI hides it by policy; Anthropic's isn't guaranteed-faithful); free-standing user notes named as explicit P1/P2 deferral, not a silent gap. |
| D8 | Benchmark labeling scheme | **RESOLVED** (rubric-writing, doc-only) | Split two tasks: (a) per-claim provenance/hallucination — nominal categories *grounded-correct · grounded-mischaracterized · correctly-unverified* (counts FOR the system) *· hallucinated · opinion/non-checkable* (excluded) → **Cohen's kappa** (RAGTruth/FaithBench style — arxiv.org/html/2401.00396v1, arxiv.org/html/2410.13210v1); (b) per-arm/per-dish quality — technique correctness, provenance completeness, novelty (single-rater), safety-gate FN/FP. Freeze defs before labeling; calibration pass; report confusion matrix; ~200 claims × 15–20% ≈ 30–40 double-labeled → kappa computable but wide CI, say so. |
| D9 | "Serious cook" screening criteria | **RESOLVED** (mostly moot; narrow resolution) | Replace persona-representativeness with a **task-competence** criterion: enough food literacy to judge whether a cited source supports a claim + attention to follow the rubric; a friend/labmate/colleague qualifies. Do NOT reuse the wk-0 self-interview subject as the 2nd labeler; state the convenience-sample fact in README. |
| D10 | Branching model specificity | **RESOLVED** | **Tree, not DAG** — no verb implies merge, so merge/conflict machinery is out of scope by construction; "promote branch" = pointer reassignment, not content merge. |
| D11 | Dataset staleness acknowledgment | **RESOLVED** (already flagged) | Already noted in §8.5/§10/§14; independently re-verified true in 2026. Add one line: "staleness re-verified mid-2026." |
| D12 | Cost/nutrition data trust model | **RESOLVED** (most consequential) | **USDA FoodData Central contains NO price/cost data** (ers.usda.gov/data-products/purchase-to-plate). Split trust tiers: nutrition = FDC authoritative (unchanged); cost = static `[approximate]` ingredient-price table NOT attributed to USDA (P0). ERS "Purchase to Plate" is a P1 option (needs an NHANES↔FDC crosswalk). This is Critic mandatory change 1 — propagated everywhere in Part 2. |

## 1.5 Scope-discipline statement (AC5)

**P0 remains exactly the ONE deep loop + the eval harness — unchanged.** Every verdict above is a label, framing, or wording change; **zero introduce new P0 build** (Critic verdict E: CLEAN). Specifically:
- `move_cancelled` / `proposal_blocked` = two enum values on the already-P0 event log, for already-P0 behaviors (block = P0-7b, cancel = P0-9) — completeness, not creep.
- Batch/stream hybrid (D6) and the labeling rubric (D8) are scope *reductions* / doc-only clarifications of already-P0 items.
- The DBOS mention (A-arch-5) and FlavorDiffusion/Epicure notes (A-cul-4) are **doc-only, decline/watch-only** — they must NEVER become P0 swaps (Critic guard). DBOS = name-and-decline (matches the existing LangGraph/WS/CQRS decline pattern); FlavorDiffusion + Epicure = "checked & rejected for P0 / P1 watch-item," never a FlavorGraph swap.
- **R1 (multi-project workspace) and R2 (per-project KB) stay P1+**, logged in §16.1 as vision, out of P0. The v0 deliverable remains the one deep gated loop + eval harness.

## 1.6 Cross-report contradictions & convergences (surfaced, not hidden)

1. **One real contradiction (low-severity, RESOLVED).** Arch Gap-3's deterministic-services checklist listed **"USDA cost"** — the exact attribution culinary Gap-12 deletes (FDC has no price data). Left unaligned, the doc would delete the over-claim in one place and re-assert it in another. **Resolution:** the checklist reads **"cost (static `[approximate]` table)"** in v0.4 (edit E14). This is the single cross-report contradiction the Critic flagged; the cost tier-split (Critic change 1) resolves it end-to-end.
2. **Apparent tension that is actually coherent (surfaced for the lead).** Positioning DROPs the wk-0 study (incl. recruiting) while eval KEEPs the 2nd-labeler inter-rater check. These rest on *unrelated* justifications — wk-0 = market-validation (dropped); 2nd-labeler = eval-credibility ("who checked the person grading their own homework?"). Same conclusion structure, no conflict; both honor the non-negotiable. The link "don't reuse the pilot cook as the 2nd labeler" (D9) = "the author must not be the 2nd labeler" = exactly what inter-rater agreement requires. **A cut to wk-0 must NOT gut the 2nd-labeler** — decide them independently.
3. **Vocabulary-only difference (no substance gap).** Culinary called the safety-gate motivation change "REVISE"; positioning/inventory call it "C9 REFRAME." Same recommendation (change the *why*, keep the gate). Recorded as A-cul-6/A-safe-1 = KEEP + C9 = REFRAME.
4. **Minor pointer correction (Critic-noted).** The culinary reviewer pointed the trust-number softening at §6.4/§17; the Critic verified the actual in-doc claims are at **§3.2:74, §13:365, §14:375, §17:414** (substance identical). Part 2 uses the Critic's corrected line refs.
5. **No NEW disagreement found** beyond the above. The four reviewers + Critic converge; nothing was silently reconciled.

---

# PART 2 — Change-set for DESIGN.md v0.4

Ordered top-to-bottom by document section for the Builder to apply in one pass. Format: **§/location · current intent → new intent · driver.** `[CRITIC]` marks the three mandatory Critic changes + guards. Line refs are against `DESIGN.md` v0.3.1. **This is a spec — do NOT apply until the user approves the verdict set.**

| # | §/location | Current intent → new intent | Driver |
|---|---|---|---|
| E1 | Header (:1, :7) | "v0.3" / "Draft v0.3.1" → **v0.4**; status note "post-portfolio-recut" | Recut pass |
| E2 | Changelog block (:13) | append v0.3.1→v0.4 entries (§2.3 below) | Convention |
| E3 | v0 scope decisions (:29–36) | Decision #4 "Wk-0 user test → run to steer scope" → **RETIRE**; replace with "Wk-0 = scaffold + pre-register eval methodology + hypothesis before any run; no external user test" | C2 DROP |
| E4 `[CRITIC]` | §3.2 (:74) | honest-counter-case "…or to trust a number" → soften: nutrition trustworthy, **cost a reasonable estimate**, not a to-the-dollar guarantee | Cost tier-split |
| E5 | §3.2 (:72–74) | competitive read → reframe purpose to engineering-judgment "mapped the landscape, found a specific gap" (not moat); ADD one sentence: OpenAI June-2026 memory upgrade (recall 67.9%→82.8%, TechRadar/Neowin) narrows but doesn't close the gap — recall ≠ versioned/diffable/gated artifact | A-prod-10/C4, A-prod-11 |
| E6 | §5 (:98) | delete "reachable for an n=5 validation test"; recast persona-specificity as illustrative narrative, drop recruiting/market-sizing language | A-prod-1/C1 |
| E7 | §5 (:96) | "hardest user to fool" → keep as engineering motivation; ensure no "won't buy → no one will" market-conversion read | C3 |
| E8 | §5 JTBD-3 / §6.2-C (:102, :116) | discovery mode → frame as capability demo / adversarial stress-test of the safety gate, not "users want creative suggestions" | C7 |
| E9 | §6.4 (:127–128) | hands-dirty boundary → cite Fresco (in-cook connected appliance, PRNewswire June 2026) as the contrasting boundary confirming this is a deliberate scoping decision | A-prod-8 |
| E10 | §6.3 (:120–124) | note the Proposal is emitted as a complete structured object (safety gate needs completeness); only free-text rationale streams | D6 |
| E11 | §8.2 (:191) | add one sentence explicitly rebutting "why not LangGraph" (bounded 6-verb machine, <3 branching points, no durable-checkpoint need — clears the DIY bar; developersdigest.tech/blog/managed-agents-vs-langgraph-vs-diy-2026) | A-arch-1 |
| E12 | §8.3 (:216–233) | state conversation-history scope (steering thread verbatim + decision/rationale log persist; raw provider CoT excluded; free-standing user notes = explicit P1/P2 deferral); state branching = **tree not DAG**, "promote branch" = pointer reassignment, no merge machinery | D7, D10 |
| E13 `[CRITIC]` | §8.4 (:237) | "cost (USDA), nutrition (USDA)" → "**nutrition (USDA FoodData Central — authoritative); cost (static `[approximate]` ingredient-price table — NOT USDA)**" | Cost tier-split |
| E14 `[CRITIC]` | §8.4/§12 (new checklist) | add deterministic-services checklist: scaling/unit conversion · **cost (static `[approximate]` table)** · nutrition (USDA) · FoodOn identity · allergen check · safety blocklist · idempotency-key resolution · version-chain integrity; flag `confidence` is LLM-emitted and must NEVER be a gating input | D3 (checklist aligned to cost tier-split — resolves the cross-report contradiction) |
| E15 | §8.5 (:244–247) | add npj 2025 (Caprioli et al., 9:242; arXiv:2408.15162) upgrading "hedged on 2011 lit" → "hedge still live 2025 consensus"; add "staleness re-verified mid-2026"; add "**FlavorDiffusion (arXiv:2502.06871) checked & rejected for P0 — P1 watch-item, not a swap-in**"; state fusion routes BY CLAIM TYPE (disjoint, no numeric blend in P0); pre-register P1 tie-break (literature augments rationale/citations only; deterministic confidence penalty + `[contested]` on contradiction; no learned re-ranker) | A-cul-1/A-cul-4, D4, D11; `[CRITIC guard]` FlavorDiffusion watch-only |
| E16 `[CRITIC]` | §8.6 (:259–260) | name **DBOS Transact** (dbos.dev/blog/what-is-lightweight-durable-execution) and explicitly **DECLINE** it (nothing lost pre-accept; matches the LangGraph/WS/CQRS name-and-decline pattern); add cancel = discard-not-rollback + provider-dependent stream granularity (Anthropic returns structured output as one block at stream end); add event types **`move_cancelled`, `proposal_blocked`** to the move/gate event log | A-arch-5 (DBOS decline-only guard), D2 |
| E17 | §8.7 (:264) | replace product-safety/liability opener with by-design engineering-signal framing (identifying the physical-stakes/no-stakes boundary and encoding it as a deterministic blocking service IS the domain-rigor / systematic-risk-thinking signal; skipping it = evidence the author didn't know where the hazards are); keep FoodGuardBench (arXiv:2604.01444) cite | C9 |
| E18 | §9.1 (:283) | relabel gate accept/edit/reject dynamics from "the live quality signal of the co-development loop" → **operator/autobiographical-design telemetry** (single operator; Neustaedter & Sengers; CHI 2024 autoethnography review dl.acm.org/doi/10.1145/3613904.3642355); always report explicit N, never a bare %; per-move-category breakdown; keep in hero section but below benchmark-based provenance/hallucination | A-eval-1 |
| E19 | §9.4 (:299) | "a second serious cook double-labels" → "**a second labeler (friend/labmate — not persona-screened)** double-labels"; report **Cohen's kappa + confusion matrix** (mbrenndoerfer.com/…; arxiv.org/html/2506.13639v1); README sentence "labeling-reliability check, not a user study" | A-eval-4 |
| E20 | §9.4 / new §9.5 | add labeling scheme: (a) per-claim provenance/hallucination nominal categories → kappa (RAGTruth/FaithBench — arxiv.org/html/2401.00396v1, arxiv.org/html/2410.13210v1); (b) per-arm/per-dish quality rubric (technique/provenance-completeness/novelty single-rater; safety FN/FP); freeze defs + calibration pass + confusion matrix + wide-CI caveat; labeler criterion = **task-competence** not persona-representativeness; do NOT reuse the self-interview subject; state convenience-sample-of-one in README | D8, D9 |
| E21 `[CRITIC]` | §10 table (:311) | "Deterministic cost + nutrition; canonical entities" → "**Deterministic nutrition + canonical entities (zero flavor data); NOT cost — FDC has no price data**"; add note: cost = static `[approximate]` table, ERS Purchase-to-Plate is a P1 option (needs NHANES↔FDC crosswalk) | Cost tier-split |
| E22 | §10 (:313) / Appendix B | add "FlavorDiffusion (arXiv:2502.06871) and Epicure (arXiv:2605.22391) checked & rejected for P0; **P1 watch-items, not swap-ins**" | A-cul-4; `[CRITIC guard]` FlavorDiffusion + Epicure watch-only |
| E23 `[CRITIC]` | §11 P0-5 (:333) | "One deterministic service (cost + nutrition via USDA)" → "deterministic services: **nutrition via USDA (authoritative) + cost via a static `[approximate]` table (NOT USDA)**" | Cost tier-split |
| E24 `[CRITIC]` | §13 (:365) | hero row "the real edge is durability + trustable numbers" → soften "trustable numbers" (nutrition trustworthy; cost a reasonable estimate) AND drop competitive word "edge" → "**where the engineering shines**"; align hero row with the operator-telemetry relabel | Cost tier-split, A-prod-6, A-eval-1 |
| E25 `[CRITIC]` | §14 first bullet (:375) | **DELETE** the wk-0 / 5-cook / "0/5 no-go" / "steers scope" bullet; replace with **[demo-design risk]**: does the durability/versioning edge read convincingly, or does the gate look like friction? — mitigation = script the README/demo around the multi-iteration multi-day case (self-verifiable, non-gated); note ChatGPT's mid-2026 memory upgrade (recall, not a versioned artifact); soften "trustable numbers" | A-prod-7/C2 DROP, A-prod-11, Cost tier-split |
| E26 `[CRITIC]` | §14 (new bullet) | add **[portfolio-honesty risk]** led with "**by design — the author is the spec; external judgment is explicitly out of scope**" (NOT a confession); optional NON-GATING garnish: if 1–2 cooks are shown the demo informally, add one README sentence; if not, ship without it | Critic change 3 |
| E27 | §15 v0 phase (:389) | rename "v0 — Validate + scaffold" → "**v0 — Scaffold + pre-register (wk 0–1)**"; goal = repo skeleton, vendor FlavorGraph, load USDA/FoodOn, eval-harness shell + tracing, sketch safety blocklist, **write the README methodology + hypothesis BEFORE any run**; exit = 3-arm harness runs empty baseline + tracing replay + README pre-registers the ablation and what a null means — **no external subjects**; delete "user-test result steers mode A scope" | A-feas-6, C2 |
| E28 | §16.1 (:400) | retitle "Persona-validated product vision (P1+ — wk-0 pilot)" → "**Requirements exploration (author self-interview)**"; reframe as requirements elicitation, not go/no-go validation; keep R1/R2 P1+ (also in Satellite reconciliation) | C8 |
| E29 `[CRITIC]` | §17 README (:414) | "deterministic costing and nutrition you can trust" → "**deterministic nutrition you can trust (USDA) and a reasonable, clearly-approximate cost estimate**"; align hero-metrics sentence with the operator-telemetry relabel (report N, not a bare %) | Cost tier-split, A-eval-1 |
| E30 | Appendix B (:426) | add npj Science of Food 2025 (Caprioli et al. 9:242; arXiv:2408.15162); FlavorDiffusion (arXiv:2502.06871, P1 watch); Epicure (arXiv:2605.22391, P1 watch); cost-source note (static `[approximate]` table; ERS Purchase-to-Plate = ers.usda.gov/data-products/purchase-to-plate, P1) | A-cul-1/A-cul-4, D12 |

**30 edits.** Of these, **8 carry the `[CRITIC]` mandatory tag** (E4, E13, E14, E16, E21, E23, E24, E25, E26, E29 for cost tier-split + DBOS-decline + solipsistic-toy wording — the cost split alone spans E4/E13/E14/E21/E23/E24/E25/E29).

## 2.1 Satellite docs reconciliation

Three follow-on edits keep the corpus consistent once the wk-0 study is retired. **These are specs for the Builder — not applied here.**

| Target | Location | Edit | Driver |
|---|---|---|---|
| `DESIGN.md §16.1` | :400 | Retitle to **"Requirements exploration (author self-interview)"**; drop "persona-validated … wk-0 pilot" framing; the interview is requirements *elicitation*, not go/no-go validation (also E28) | C8 |
| `docs/research/07-pilot-interview.md` | closing "Scope discipline (held)" line (:42) + header (:3) | **Close the "still owed study" caveat.** ":42 — "**Still owed:** the real arm's-length wk-0 test (~5 recruits + a 2nd cook…)" → under the portfolio reframe there is **no owed external study**; the arm's-length recruiting is retired. Restate: this file's value is (a) persona-grounding and (b) a protocol/requirements pilot; the 2nd *labeler* survives independently on eval-credibility grounds (not as part of a user study). Soften the header ":3" line "before recruiting ~5 arm's-length cooks" accordingly (no recruiting planned). | C2 / C6 DROP |
| `docs/HANDOFF.md` | line ~29 + next-action | Line 29 "**Still owe the real arm's-length 5-cook wk-0 test…**" → delete/reframe: **no owed external test** under the portfolio lens. Update "Next session start here" (Round 2 is already complete per 07-pilot-interview.md, so lines 22–25 are stale) and "Candidate next builds" (line 33 "**Wk-0 user-test kit**" → replace with "**README pre-registration doc — methodology + hypothesis, before any run**"). Note locked-decision #4 (line 14) is retired. | C2 DROP, A-feas-6 |

## 2.2 Proposed v0.3.1 → v0.4 changelog (drivers)

Drop these into the DESIGN.md changelog block (E2):

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

---

*P0 non-negotiables preserved throughout: one deep gated loop + eval harness; R1/R2 stay P1+; three ablation arms kept; no fabricated citations (all URLs carried from the reviewer reports).*
