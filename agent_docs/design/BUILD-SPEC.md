# CapyCook redesign — build spec (persisted)

> Imported 2026-07-07 from Claude Design project `d76b16c2-a4ff-44e2-8ab9-7ccba9359e61`
> (companion to `CapyCook-Redesign.dc.html`, imported from the same project).

## Deliverable
Interactive prototype, ONE Design Component `CapyCook Redesign.dc.html`. Top chrome: Direction switcher (A / B) + global toggles (theme light/dark, autonomy dial "auto-apply safe steps", technical view). Clickable through the hero loop with mock miso-carbonara data + simulated token streaming (setInterval). Covers all four states + narrow-screen + technical view.

## Two IA directions (both honor every §9 non-negotiable)
- **A — "Line of Development" (unified stage + timeline spine).** Direct execution of §8. Persistent vertical development timeline = left spine (each trial = node w/ rationale, taste notes, provenance, cook markers, branch). Dish = center stage. Current proposal renders ON the dish (diff inline). Gate = quiet inline culinary decision: **Use it · Tweak it · Try another way** (+ keyboard A/E/G/L/R/T; "More" reveals all six verbs incl. Take over). Intent-first bar: "What do you want to try?" free text → maps to MoveType; deterministic actions (scale/units/recompute) = explicit chips (dial can auto-apply). Trust layer: compact "sure about / guessing" strip.
- **B — "The Cook's Notebook" (single chronological narrative).** No two-column split. One flowing journal you read top→bottom: each move = dated entry (seed, first draft, your steer, model rationale streaming, accepted trial, safety hold, "you cooked v2", tasting notes, rework). LIVE dish = pinned/sticky summary (top on mobile, right rail on wide). Proposals = inline reviewable entries w/ decision inline. Develop-over-time IS the document.

## Shared core (logic class)
State machine: dishState = idle|proposing|awaiting_gate|blocked.
Draft{title, concept, flavor_rationale[], ingredients[], steps[], constraints, analysis{cost(approx, missing[]), nutrition(USDA, unverified[])}}. Versions timeline (trials; some cooked; one branch). pendingProposal / pendingProposals (alternatives = 2). streaming rationale text. Flags: autonomyDial, theme, technicalView, direction(a|b), screen(intake|workbench), narrow.
Handlers (mock): startDish; proposeMove(streams tokens ~via setInterval → proposal-ready → awaiting_gate); gate(accept→new trial + promote; edit; regenerate; alternatives→2 proposals; redirect; take_over); triggerSafetyHold→blocked; cookVersion→tastingNotes→rework(iterate_feedback); promote; selectTrial(read-only snapshot); deterministic scale/recompute (auto-advance when dial on, else gate).

## Miso-carbonara sample content
Seed: "miso carbonara — umami-rich but silky, weeknight-fast". Constraints: cuisine western, skill intermediate, servings 2, dietary [], allergens [], equipment [large pot, skillet], on_hand [eggs, pecorino, black pepper]. Arc:
- T1 seed_expand → first draft (spaghetti 180g, egg yolks 4 + 1 whole egg, guanciale 90g, pecorino 45g, white miso 15g, black pepper). rationale: miso replaces some salt & adds glutamate depth; emulsion off-heat.
- T2 flavor_direction "push umami" ACCEPTED + COOKED (add kombu-dashi splash / toasted).
- Post-cook steer: "too salty, want more umami without more salt" → iterate_feedback rework: cut pecorino & miso a touch, add toasted dried-shiitake powder (glutamate+guanylate synergy) — net saltier-tasting, less sodium.
- Alternatives example: two reworks (A: shiitake powder; B: kombu dashi reduction).
- Safety hold example: a proposed room-temp garlic-in-oil infusion step → BLOCKED rule `anaerobic-garlic-oil` (botulism). Only Regenerate / Ask-for-changes.
Ingredients carry fdc_id/foodon_id. Nutrition USDA-verified (sodium high — ties to salt story); cost approximate w/ 1 missing (guanciale unpriced). One [unverified] flavor claim (shiitake+guanciale glutamate synergy).

## DS + theming
Helmet loads (paths _ds/acne-design-system-adc861a8-7673-4c6a-85cb-806c1f887f88/): fonts.css, tokens.css, base.css, components.css, styles.css, _ds_bundle.js. Use DS classes where they fit (.btn .btn--*, .panel, .card, .badge .badge--*, .field .label .input .textarea .select .check, .divider, .eyebrow, .chip, .segmented, .alert .alert--*, .dot, .table, .link) + tokens (var(--space-*), var(--font-*)).
DS is LIGHT-ONLY. Add own CapyCook token layer in helmet <style> scoped to `.cc-root`, `[data-theme=dark]` override → inline styles reference var(--cc-*) (static ref paints immediately; theme swaps via attribute, not a hole). Square corners, hairlines, NO shadows/gradients, uppercase micro-labels, mono numerics (matches Acne + current CapyCook).

cc LIGHT: --cc-bg #FBF9F4; --cc-panel #FFFFFF; --cc-panel-2 #F4F0E8; --cc-ink #1C1A17; --cc-muted #6B6560; --cc-faint #9A938A; --cc-line #E7E1D6; --cc-line-strong #CEC6B7; --cc-accent #C05A2C; --cc-accent-ink #FFFFFF; --cc-accent-soft #F2E3D8; --cc-add #2C6E49; --cc-add-bg #E4EFE6; --cc-warn #B36200; --cc-warn-bg #FBEED9; --cc-crit #C4271C; --cc-crit-bg #FBE4E1.
cc DARK: --cc-bg #16130E; --cc-panel #201C15; --cc-panel-2 #26211A; --cc-ink #ECE5D8; --cc-muted #A79E90; --cc-faint #7C7364; --cc-line #322C22; --cc-line-strong #443C2E; --cc-accent #D2794D; --cc-accent-ink #17130E; --cc-accent-soft #33261C; --cc-add #7FB894; --cc-add-bg #1E2A20; --cc-warn #E0A552; --cc-warn-bg #2A2114; --cc-crit #E58A7F; --cc-crit-bg #2E1A17.

## Non-negotiables (§9) — keep ALL
Gate mandatory (no draft change w/o explicit verb; deterministic auto-advance only when dial on). All six verbs reachable: accept·edit·regenerate·alternatives·redirect·take_over. Safety block = own state (reason + killed change; only Regenerate/Ask) + 409 warn-and-confirm for human edits/take-over that trip safety. Honesty visible: [unverified], USDA nutrition vs APPROXIMATE cost, missing/unverified fields; confidence informational never gating. Every §4 field has a home. Streaming: rationale token-by-token, proposal whole; handle cancel, alternatives(2 sequential), silent deterministic auto-advance. a11y: skip links to gate+steering, roving-tabindex gate toolbar, polite live-region for gate transitions, managed focus, ≥24px targets, error summaries, reduced-motion, full keyboard, light/dark.

## Build order
1. Scaffold DC: helmet (DS + cc tokens + keyframes) + logic (state+data+handlers) + top chrome + intake + Direction A idle. Verify.
2. Direction A: proposing → awaiting_gate (gate on dish) → accept; alternatives; blocked hold; snapshot; final fiche; trust layer; technical view; timeline spine.
3. Direction B notebook full.
4. Narrow-screen responsive both.
5. a11y pass + verify.
