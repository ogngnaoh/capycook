# Product & UX Scout Report — Dish Development Workbench (DESIGN.md v0.2)

Calibration honored throughout: this is a portfolio flagship for big-tech SWE/systems internships. Product/UX is graded on (a) whether it gives a distinctive, demoable surface and (b) whether it supports the riskiest empirical claim (§14) — not on market size or defensibility.

## 1. Persona reality check

The "serious home cook / amateur professional" (§5) is real and locatable, but smaller and more fragmented than the doc implies.

- **r/AskCulinary**: ~664K members — the closest Reddit analogue to this persona (problem-solving, technique-focused, expert-flaired answers), but most traffic is one-off Q&A, not multi-day project iteration. [thehiveindex.com/communities/r-askculinary]
- **r/Cooking**: ~5.5M members but general-purpose and convenience-skewed — not the target slice. [gummysearch.com/r/Cooking]
- **ChefSteps community**: ~400K at peak (2014 figure; the standalone forum has since been folded into Breville's ecosystem and is materially less active today) — directionally useful as "modernist/technique-obsessed cook" evidence, but stale data, flag accordingly. [prweb.com/releases/chefsteps_community_grows...]
- **Serious Eats**: 8M+ monthly views; Kenji López-Alt himself now has 1.6M+ YouTube subscribers / 250M+ views — strong evidence the "why" content has real demand, but this measures content *consumption*, not active project-cooking behavior. [Wikipedia: Serious Eats; en.wikipedia.org/wiki/J._Kenji_López-Alt]
- **Cooking Discords** are small and fragmented (largest general "Cooking" server found ~10K members) — not a reachable recruiting funnel at scale, though fine for n=5 qualitative recruiting. [discord.com/invite/YXrt32pyvc via DISCODUS]

Net: the persona is identifiable and reachable for an n=5 validation test (the wk-0 ask), but the doc's implicit sizing ("hardest user to fool," "engagement not less of it") is closer to thousands-to-low-hundred-thousands of highly engaged people than a mass audience — which is fine *given the stated non-goal of market size*, but the doc should not lean on persona size as supporting evidence for anything; it should lean on persona *specificity*.

**JTBD framing accuracy**: "get better / exercise creative agency / understand why" is well-supported by direct evidence — Kenji's "Food Lab" column model (explain mechanism, not just steps) is literally the proof this audience rewards "why" content; it got 10x the engagement of a typical recipe post. [Mashed: "The Untold Truth of Serious Eats"] The cooking-segmentation literature also independently validates the persona as a distinct cluster: a three-way home-cook typology (low-priority / everyday / hobby chefs by "cooking capital") finds hobby chefs use recipes and develop skill differently from convenience cooks. [ScienceDirect, "Let's talk about chefs, baby" 2023] This is a real, identifiable segment, not an invented one.

## 2. Interaction-model assessment — analogues & what transfers

The two-pane "evolving draft + steering conversation" with gated structured diffs (§6.1, §6.3) is a direct transplant of the **code-diff review pattern** now standard in AI coding tools: "Cursor and Windsurf built their core product around the review-trap UX: the thing you pay for is a beautiful diff viewer, and the thing you do in it is approve hunks." [DX Heroes / Nearform field reports on Cursor vs Copilot] Best-practice guidance for that pattern — "show the diff, not just the output," "make approval one click," don't bury it in modals [aiuxplayground.com human-in-loop pattern notes via search] — maps cleanly onto the Proposal contract in §8.2.

Closer and more rigorous precedent: Microsoft Research's **Magentic-UI** (arXiv 2507.22358, 2025) formalizes almost exactly this design — "co-planning," "co-tasking" (seamless take/hand-over of control), and **"action approval to ensure oversight of high-stakes actions"** as one of six named interaction mechanisms, explicitly justified as minimizing interruption cost by front-loading ambiguity resolution before execution rather than gating every micro-step. This is strong validation that the gate-as-mandatory-checkpoint pattern is a recognized, researched HITL primitive, not an invented one — cite it in the design doc itself as prior art for the architecture, not just the food-domain related work.

Notion AI's "suggested edits" (hover → checkmark/X to accept/reject inline) and Figma AI design-review copilots both reinforce the same shape: propose → render inline diff → cheap accept/reject verb. What's common across all these proven analogues: **the artifact under review is the same medium the human already edits in** (code, document text, design canvas). The dish draft is structurally similar (structured document, diffable fields) — this is the strongest point of transfer.

**What's specifically different here, and works in the workbench's favor:** unlike a PR or a Notion paragraph, a dish draft has a long natural pause between gates (you cook before the next move), so the "fast feedback loop" assumption baked into code-diff UX doesn't need to hold — slow, deliberate gates are actually appropriate to the domain, not a tax on it.

## 3. Cooking-specific UX risks (severity-tagged)

- **[HIGH] Approval fatigue at the gate.** DeepMind's "AI Agent Traps" taxonomy (Franklin, Tomašev, Jacobs, Leibo, Osindero, 2025) names *approval fatigue* explicitly: "a gate that prompts on every operation creates approval fatigue that gets bypassed; a gate that prompts only on consequential operations gets used." [aipatternbook.com/approval-fatigue, citing Franklin et al. 2025] §6.3's six-verb gate at *every* move risks exactly this if "move" granularity is too fine (e.g., gating a unit conversion the same way as a flavor-direction pivot). The doc's own "autonomy dial" (§8.2) is the right mitigation but is P1/opt-in — recommend pulling a minimal version of it (auto-advance on deterministic moves only) into P0, since it's cheap and directly defuses the single most citable failure mode of this interaction model.
- **[HIGH] Hands-dirty kitchen mismatch.** UX research on cooking apps converges on one finding: touching a screen with food-covered hands is a real, named pain point, which is why voice/hands-free modes exist in nearly every serious cooking app (Vule, Voicipe, "In the Kitchen"). [digitaltrends.com; voicesummit.ai; one4studio.com] The two-pane *desktop-style* diff-review workbench is implicitly a pre-cook and post-cook tool, not an in-cook tool — that's fine and should be stated as an explicit design decision (the gate happens at the counter/laptop, not at the stove), not left implicit, or reviewers will dock UX coherence points for an unaddressed gap.
- **[MEDIUM] Multi-day session continuity.** The event-sourced draft (§8.3) is the right answer to "iterate against the cooked version," but nothing in §6 specifies how the *steering conversation* (not just the draft) persists/resumes across a multi-day gap — conversational context for a code-review tool can be ephemeral because the diff is self-explanatory; for a "why did I choose this flavor direction three days ago" recall, conversational memory matters more. Worth one sentence of design intent.
- **[LOW] Verb surface area.** Six verbs (accept/edit/regenerate/alternatives/redirect/take-over) is more than Cursor's effectively-binary accept/reject-per-hunk or Notion's check/X. More verbs = more cognitive load per gate, compounding the approval-fatigue risk above. Not wrong, but worth a one-line acknowledgment that this is a deliberate richness/fatigue trade-off.

## 4. Beats-ChatGPT analysis — steelman both sides

**Steelman for the workbench:** ChatGPT has no durable, diffable, versioned artifact — every "iterate on this dish" conversation re-litigates context from scratch or relies on fragile chat-history scrollback; there is no accept/reject primitive, no branch-and-compare, no machine-checked arithmetic (ChatGPT can and does hallucinate quantities/costs), and no provenance distinguishing a grounded claim from a plausible-sounding one. For a *multi-day, iterate-against-what-you-actually-cooked* workflow specifically, raw chat is a genuinely worse tool, independent of model quality — this is a structural, not a quality, gap.

**Steelman for "just ask ChatGPT":** ChatGPT already serves the JTBD adequately for a single-session "explain why searing works" or "give me a riff on this dish" ask — evidence: ChatGPT is explicitly characterized as already "the go-to for the science behind the food," and users report it's most useful to people "already somewhat familiar with the topic," which is precisely this persona. [makeuseof.com; GMA "Can ChatGPT make dinner easier?"] For the common case — a single iteration, no need to resume in three days, no need for a defensible cost/nutrition number — the workbench's gate-and-versioning machinery is overhead with no payoff, and a cold-start user may simply not feel the gap until they hit the second or third iteration.

**Where this lands**: the workbench's case is strongest exactly at the moment the design doc gestures at but underweights as a *product* argument — durability and resumability across the gap between cook sessions, plus trustable numbers. It is weakest for single-shot "why" questions, where ChatGPT is already good enough and the gate adds friction for no visible benefit. This is good news for the flagship framing (§3.2 already says this correctly) — but the wk-0 test (below) needs to specifically probe the *multi-iteration, multi-day* case, not a single proposal, or it will systematically underestimate the workbench's advantage and overestimate ChatGPT's.

## 5. Concrete wk-0 user-test protocol

**Goal:** cheapest credible signal on "would you cook this and iterate, over just asking ChatGPT?" — per NN/g, 5 users in a homogeneous group surfaces ~85% of usability/value issues for qualitative read, which is the right bar for a go/no-go, not a quant claim. [nngroup.com/articles/5-test-users-qual-quant]

- **Recruit (half a day):** 5 people who self-identify as "I cook from technique, not just recipes" — post in r/AskCulinary (flair-holders/frequent answerers are the highest-signal subset, not random subscribers) and 1–2 cooking Discords; supplement with personal network if culinary-adjacent. Screening question: "Have you ever changed a recipe and re-cooked it because the first version wasn't right?" — yes required.
- **Protocol (30–40 min/person, async-friendly):**
  1. Show a single seed prompt (e.g., "I want a riff on carbonara using miso") run through *both* raw ChatGPT and a manually-simulated workbench session (a Figma/markdown mock of 2–3 gated moves with a real diff, rationale, citation, and an `[unverified]` tag — doesn't need working code).
  2. Let them "accept/edit/redirect" at least one proposal in the mock.
  3. Show a second-iteration step: feed in synthetic "I cooked it, the miso was too salty" feedback to both, and show how each responds (ChatGPT: re-prompt from scratch; workbench: re-proposal against the cooked version).
  4. Ask directly: "Would you cook this version? Would you come back and iterate, or would you just re-ask ChatGPT?" and "What did the diff/citations/[unverified] tag add or get in the way of?"
- **Read it as:** count how many of 5 say they'd return for iteration #2 *because of* the versioned/gated mechanism specifically (not just "the dish looked good") — that's the riskiest-risk signal (§14). A 0/5 or vague "sure, either way" result is a real no-go signal on Mode A as scoped; don't rationalize it away. Capture verbatim objections — they're the cheapest design-spec input you'll get.
- **Cost:** one afternoon, no code, matches the doc's own estimate (§14, §15 v0) exactly — this protocol just makes it executable.

## 6. Top 5 recommendations

1. **Pull a minimal autonomy-dial into P0** (auto-advance on deterministic-only moves) — directly defuses the single best-documented failure mode (approval fatigue) of this interaction model, at low cost.
2. **State the "gate happens at the counter, not the stove" boundary explicitly** in §6.4 ("what it is not") — turns a silent gap into a deliberate, defensible scoping decision.
3. **Cite Magentic-UI (arXiv 2507.22358) as architectural prior art** in §4/§13 — it's a closer and more rigorous analogue for the *interaction model* than anything currently listed, and strengthens the engineering-literature-command signal §2 explicitly wants.
4. **Run the wk-0 test on the multi-iteration case, not single-shot** — the design's real edge over ChatGPT is durability/resumability across days, and a single-proposal test will under-measure it.
5. **Add one sentence on steering-conversation persistence across the multi-day gap** in §8.3 — cheap to write now, awkward to retrofit later, and closes the one genuine "cooking is not coding" gap in an otherwise well-transplanted interaction model.

Overall: the product surface is sound and *helps* the engineering signal — it's a legible, well-precedented interaction model (diff-review + gate, with real analogues in Cursor/Notion/Magentic-UI) wrapped around a genuinely different artifact (a dish, not code), which is exactly the kind of "distinctive but not gimmicky" surface a portfolio flagship wants. The main risk is not that the product idea is wrong, but that the gate-everywhere literalism (six verbs, no granularity distinction) could read as under-thought UX if a reviewer happens to know the approval-fatigue literature — cheap to fix, worth fixing before this is public-facing.

---

### Sources
- [r/AskCulinary subreddit profile](https://thehiveindex.com/communities/r-askculinary/)
- [r/Cooking subreddit stats](https://gummysearch.com/r/Cooking/)
- [ChefSteps Community Grows to 400,000 Cooking Enthusiasts (2014)](https://www.prweb.com/releases/chefsteps_community_grows_to_400_000_cooking_enthusiasts/prweb12201041.htm)
- [Serious Eats — Wikipedia](https://en.wikipedia.org/wiki/Serious_Eats)
- [J. Kenji López-Alt — Wikipedia](https://en.wikipedia.org/wiki/J._Kenji_L%C3%B3pez-Alt)
- [The Untold Truth Of Serious Eats — Mashed](https://www.mashed.com/618233/the-untold-truth-of-serious-eats/)
- [Cooking Discord server (DISCODUS listing)](https://discord.com/invite/YXrt32pyvc)
- [Let's talk about chefs, baby: comparing three types of home cooks — ScienceDirect, 2023](https://www.sciencedirect.com/science/article/abs/pii/S1878450X23000410)
- [Claude Code vs Cursor vs Copilot field report — DX Heroes](https://dxheroes.io/insights/claude-code-vs-cursor-vs-copilot)
- [Battle of the AI agents: Cursor vs. Copilot — Nearform](https://nearform.com/digital-community/battle-of-the-ai-agents/)
- [Human in Loop · Collab AI UX Pattern — AI UX Playground](https://www.aiuxplayground.com/pattern/human-loop)
- [Magentic-UI: Towards Human-in-the-loop Agentic Systems — arXiv 2507.22358](https://arxiv.org/abs/2507.22358)
- [Notion Help Center — Suggested edits](https://www.notion.com/help/suggested-edits)
- [AI design review assistant — Figma](https://www.figma.com/solutions/ai-design-review-assistant/)
- [Approval Fatigue — Encyclopedia of Agentic Coding Patterns (citing Franklin et al., AI Agent Traps, DeepMind 2025)](https://aipatternbook.com/approval-fatigue)
- [Cooking apps and dirty-hands pain points — Digital Trends](https://www.digitaltrends.com/phones/app-attack-in-the-kitchen/)
- [Vule hands-free cooking mode — One4Studio](https://www.one4studio.com/blog/hands-free-cooking-mode-voice-commands-vule)
- [Can ChatGPT Teach You How to Cook Healthy Meals? — MakeUseOf](https://www.makeuseof.com/can-chatgpt-teach-you-cook-healthy-meals/)
- [Can ChatGPT make dinner easier? — Good Morning America](https://www.goodmorningamerica.com/food/story/chatgpt-make-dinner-easier-put-culinary-test-97992302)
- [How Many Test Users in a Usability Study? — NN/g](https://www.nngroup.com/articles/how-many-test-users/)
- [5 Users: Okay for Qual, Wrong for Quant — NN/g](https://www.nngroup.com/articles/5-test-users-qual-quant/)
