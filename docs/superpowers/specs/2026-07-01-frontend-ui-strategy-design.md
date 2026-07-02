# Frontend / UI Strategy — Design Spec

> How CapyCook's user-facing UI gets designed and built across milestones. Governs
> the *process* (thin visual direction → per-slice integration) and its concrete
> artifacts. Subordinate to `DESIGN.md` v0.4 and `docs/SPEC.md`; where this touches
> DESIGN §15 phasing it proposes a specific amendment (§6 below).

| | |
|---|---|
| **Status** | Approved (brainstorming) — 2026-07-01 |
| **Type** | Process + UI-strategy design spec |
| **Drives** | A new `S0.4 walking-skeleton` slice, per-slice UI from milestone 01, a DESIGN §15 amendment, and a paste-ready Claude Design brief (§8) |
| **Governed by** | `DESIGN.md` §6.1 (two-pane workbench, the move/gate loop), `docs/SPEC.md` (React+Vite, Docker multi-stage) |

## 1. Problem

The frontend is currently a placeholder (`web/`), and the written plan (`DESIGN §15`,
`SPEC` P0-11) defers the *entire* UI to v2, bundled with deploy. That conflicts with
the project's own definition of a vertical slice (data → logic → **UI**, end-to-end)
and strands the riskiest integration — the Vite → Go `embed` → Docker → deploy path —
until the final weeks. We need a UI approach that (a) keeps slices end-to-end, (b)
de-risks build/deploy early, and (c) does not over-invest visual effort on what SPEC
calls "the low-stakes half of the stack" for a backend-signal portfolio piece.

## 2. Decision — thin visual direction, then per-slice integration

Establish a **thin** visual direction upfront, then build UI **per vertical slice**,
applying that direction as each user-visible slice lands.

Design **decentralizes; it does not stop.** One broad, low-fidelity pass now
(breadth, throwaway) → then just-in-time depth as each slice fleshes one region to
real fidelity. There is **no end-of-project polish pass** — the two failure modes we
are explicitly avoiding are (i) the retrofit tax of imposing a visual language across
many "finished" components late, and (ii) that late pass being the first thing cut
when a time-boxed build slips.

Rejected alternatives:
- **Full visual direction first** (hi-fi screen mockups before coding) — over-invests
  pixel effort for a backend-signal portfolio; risks mockups fighting the real
  `Proposal` data/state machine; re-introduces the fidelity/anchoring trap.
- **Functional first, design at the end** — retrofit tax + high risk the polish pass
  is cut by the timebox, leaving a prototype-looking demo for a v2 exit criterion.

## 3. Upfront artifacts (produced in Claude Design; low-fi, throwaway-friendly)

**(a) Workbench map.** Lays out the screens a v1 user touches:
- **Seed / constraints setup** — seed + dietary, allergens, equipment, skill,
  servings, on-hand (DESIGN §6.1 step 1).
- **Two-pane workbench** — *draft pane* (evolving dish + inline diff) · *steering
  pane* (conversation + streaming rationale).
- **The four gate states** the workbench walks through: *proposing → safety-blocked →
  awaiting-gate → accepted*.
- Later surfaces (provenance/`[unverified]` overlay, eval/results, version history,
  branch-compare, sandbox) appear as **labeled placeholder regions — not designed.**

**(b) Minimal design language — the durable output.**
- **Component library:** recommended **Tailwind CSS + shadcn/ui** (Radix primitives) —
  the "fast, boring default" matching SPEC's Vite rationale, accessible out of the box.
  *Finalize at plan time.*
- **~5 tokens:** color / type / spacing primitives.
- **The 3 signature components:** the **diff view**, the **gate bar**
  (accept · edit · regenerate · alternatives(branch) · redirect · take-over), and the
  **citation / `[unverified]` / confidence chip**.

**(c) `Proposal` user-facing contract** (backend-owned; pinned in Claude Code,
referenced by the map). A proposal renders as: **diff + rationale (streams
token-by-token) + citations + confidence + `[unverified]` flags + optional
safety-block reason.** The proposal is emitted as a complete batched structured object
(the safety gate needs the whole thing before screening); only `rationale` streams.
The panes are a view of this object — design them without it and the wrong regions get
mocked.

## 4. Hand-off (Claude Design → Claude Code)

Hand off **token values + a screenshot of the map + the library choice** — **not** the
Claude Design artifact's generated React. That generated code is throwaway: it will not
match the Go-served Vite structure (frontend built by Vite, embedded in / served by the
Go binary per SPEC Docker stage 2–3). Claude Code rebuilds against the real backend
using the design language.

## 5. Build sequencing

- **S0.4 — walking skeleton** (new, milestone 00): the thinnest live end-to-end thread
  — a hardcoded/stub proposal → gate bar → accept → one persisted event — that links
  React/Vite UI → HTTP → Go handler → store → eventlog and proves the
  **Vite → Go `embed` → multi-stage Docker → deploy** path. No LLM, no grounding, no
  real move logic. Its job is to de-risk architecture + pipeline, not to preview
  features.
- **Milestone 01 onward:** every *user-visible* slice includes its UI region, styled
  with the design language, plugging into the seam the skeleton established.
- **S0.2 (store · eventlog · eval shell · telemetry) and S0.3 (data vendoring) are
  unaffected** — pure infra, no UI. This strategy switches on at S0.4 / milestone 01.

## 6. DESIGN §15 amendment (proposed)

DESIGN is editable (only PREREGISTRATION is frozen). The phasing changes so UI is no
longer wholly deferred to v2:
- **v0** gains the S0.4 walking skeleton (serve + deploy path proven early).
- **v1** builds the real two-pane workbench *through* the gated loop (it is the loop's
  interaction surface — v1's exit criterion, "a cook takes a seed to a finished dish
  entirely through gated moves," already requires it).
- **v2 / P0-11 re-scoped:** from "the frontend" to **"provenance/safety *overlays* +
  deploy hardening + the eval results surface,"** i.e., additions to an already-standing
  workbench, not the first line of frontend code.

## 7. Non-goals (YAGNI)

- No hi-fi mockups of every screen.
- No v2/v3 surfaces designed now (branch-compare, sandbox, technique explainer).
- No final color / typography locked upfront — that's per-slice.
- No design-at-the-end polish pass.
- No in-app design of the eval/results *report* — it is a README results table +
  generated figures (DESIGN §17), not an app screen, unless later decided otherwise.

## 8. Deliverable — Claude Design brief (paste-ready)

> **Build a low-fidelity, graybox design — NOT a polished UI. No final colors, no
> imagery, no production styling. Use plain gray boxes, labels, and placeholder text.
> The goal is a map of where things go plus a minimal design language, not a finished
> screen.**
>
> **App:** CapyCook — a dish-development workbench. A cook brings a seed idea; an
> interruptible orchestrator proposes changes to a dish draft; the cook approves each
> change through a gate. The interaction is the diff-review pattern from AI coding
> tools: propose → show an inline diff → cheap accept/reject.
>
> **Lay out these screens/regions (low-fi):**
> 1. **Seed & constraints setup** — inputs for: seed idea, dietary restrictions,
>    allergens, equipment, skill level, servings, on-hand ingredients.
> 2. **Two-pane workbench** (the core screen):
>    - **Draft pane** (left): the evolving dish (title, ingredients, steps, cost,
>      nutrition), with an **inline diff** showing the proposed change.
>    - **Steering pane** (right): a conversation thread; the orchestrator's
>      **rationale streams in token-by-token**.
>    - **Gate bar**: buttons — Accept · Edit · Regenerate · Alternatives (branch) ·
>      Redirect · Take over.
> 3. **A proposal card** in the draft pane showing: the diff, a rationale block,
>    **citations**, a **confidence** indicator, and **`[unverified]`** flags on
>    unsourced claims.
>
> **Show these four states of the workbench** (as separate frames or a toggle):
> - *Proposing* — a proposal is being generated (rationale streaming).
> - *Safety-blocked* — a deterministic safety gate has blocked the proposal before it
>   reaches the cook; show the block reason.
> - *Awaiting gate* — the proposal is complete and waiting on the cook's decision.
> - *Accepted* — the change has been applied to the draft.
>
> **Also define a minimal design language:** ~5 tokens (color, type scale, spacing)
> and the look of the 3 signature components — the **diff view**, the **gate bar**, and
> the **citation / `[unverified]` / confidence chip**. Assume Tailwind + shadcn/ui.
>
> **Draw, but do NOT design, labeled placeholder regions for:** a provenance/safety
> overlay, an eval/results view, version history, branch-compare, and a flavor
> sandbox. Just gray boxes with labels — these are future milestones.

## 9. Follow-ups when this ships

- Add slice doc `docs/00-scaffold/04-walking-skeleton.md` (S0.4) and register it in `docs/00-scaffold/milestone.md` when work begins.
- Apply the DESIGN §15 amendment (§6 above) and note it in the scaffold handoff.
- Update `CLAUDE.md` Stack line ("Frontend (v2)") once the skeleton lands.
- Finalize the component-library choice (§3b) in the implementation plan.
