# CapyCook — Dish Development Workbench

> **Status (2026-07-06): pre-build.** The eval methodology is pre-registered and frozen
> ([`docs/PREREGISTRATION.md`](docs/PREREGISTRATION.md), registered 2026-07-01 — zero
> eval data existed at registration); the end-to-end build is specced
> ([`docs/superpowers/specs/2026-07-06-end-to-end-build-design.md`](docs/superpowers/specs/2026-07-06-end-to-end-build-design.md))
> and not yet run. This README grows a methodology-first results section when the
> measurement campaign (milestone 02) completes. The pre-registration document
> satisfies the "register the methodology and hypothesis before any run" requirement
> (DESIGN §15 v0); this note records that substitution explicitly.

**Dish Development Workbench** — an open-source, self-hostable system that helps
serious home cooks *develop and understand their own dishes*, not just generate
recipes. Unlike a chatbot that hands you a finished recipe, it works as a
**human-in-the-loop co-development loop**: a hand-rolled, interruptible state machine
proposes dish moves, builds and scales the dish with **deterministic nutrition you can
trust (USDA FoodData Central) and a reasonable, clearly-approximate cost estimate**
(never the model's arithmetic), runs every proposal through a **deterministic
food-safety gate** that can block it, keeps a **versioned, branchable draft** so you
can iterate against the exact version you cooked — and every step pauses for your call.

**The flagship is the engineering and the evaluation methodology.** The repo ships a
reproducible eval whose headline metrics are *process* quality — claim-provenance/
hallucination rate (benchmark-based) and the accept/edit/reject dynamics of the gate,
reported as **operator telemetry with an explicit N** (a single-operator
autobiographical-design signal, never a bare %) — which hold their meaning whatever the
model does. As a supporting, openly-hedged experiment, it asks whether grounding a
model in a (contested, 2011-lineage, cuisine-specific) flavor-pairing signal actually
beats just asking a strong 2026 LLM — and reports the real answer, including a null.
Building the apparatus and measuring honestly is the point; the grounding number is a
footnote, not the pitch.

Related work: IBM Chef Watson; FoodPuzzle (KDD'25); FoodSky (Patterns'25); Magentic-UI
(arXiv 2507.22358) for the human-in-the-loop interaction model.

## Documents

- [`DESIGN.md`](DESIGN.md) — product + system design (what/why, v0.4)
- [`docs/SPEC.md`](docs/SPEC.md) — the Go/React stack (how)
- [`docs/PREREGISTRATION.md`](docs/PREREGISTRATION.md) — **frozen** eval methodology
- [`docs/milestones.md`](docs/milestones.md) — execution order

## License

MIT (see [LICENSE](LICENSE)). Vendored data assets carry their own licenses and
provenance under `data/` (USDA FDC: CC0 · FoodOn: CC BY 4.0 · FlavorGraph: Apache-2.0).
