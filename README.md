# CapyCook — Dish Development Workbench

> **Status (2026-07-07): mid-build — zero eval data exists.** The eval methodology is
> pre-registered and frozen ([`docs/PREREGISTRATION.md`](docs/PREREGISTRATION.md),
> registered 2026-07-01 — zero eval data existed at registration); the end-to-end build
> ([`docs/superpowers/specs/2026-07-06-end-to-end-build-design.md`](docs/superpowers/specs/2026-07-06-end-to-end-build-design.md))
> is in progress. The [Results](#results) section below is structure only — it fills
> when the human-led measurement campaign (milestone 02) completes. The
> pre-registration document satisfies the "register the methodology and hypothesis
> before any run" requirement (DESIGN §15 v0); this note records that substitution
> explicitly.

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

## Methodology

The evaluation is governed by the **frozen pre-registration**,
[`docs/PREREGISTRATION.md`](docs/PREREGISTRATION.md) (registered 2026-07-01, before
any eval run; changes only via its dated §9 amendment log). That document is the
source of truth — this section summarizes it and restates nothing.

- **Three arms**, same orchestrator and harness, only the grounding toggle differs:
  **ungrounded** (a modern 2026 LLM, no retrieval) · **FlavorGraph-only** (the
  contested flavor-pairing signal alone) · **grounded** (FlavorGraph + deterministic
  USDA/FoodOn resolution). The middle arm is what makes a null interpretable: it
  separates the flavor signal from the deterministic path.
- **H1 — provenance & hallucination** *(primary)*: the grounded arm is predicted to
  show higher claim-provenance and lower hallucination than ungrounded — with the
  pre-committed caveat that most of any gap belongs to the deterministic
  USDA/entity-resolution path, not the flavor-pairing signal.
- **H2 — gate dynamics** *(secondary)*: deterministic moves mostly accepted;
  creative moves draw proportionally more edits and redirects. **Single-operator
  caveat:** one human (the author) generates every gate decision, so this is
  autobiographical-design telemetry — always with an explicit N, never a bare %.
- **H3 — grounding ablation** *(supporting, openly hedged)*: grounding plausibly
  helps correctness (chiefly via the deterministic path); on creativity/quality a
  modest-or-null effect is predicted.
- **Pre-committed null interpretation:** a null on the creativity/quality ablation
  is scored as a *confirmed prediction* (the pairing hypothesis is contested and v0
  is Western-only), not a failure — and a correctness win driven by the
  deterministic path is never reported as a flavor-grounding win.
- **Reliability (κ) plan:** a second labeler double-labels 15–20% of the ~200-claim
  set; Cohen's κ + a confusion matrix are reported; κ < 0.4 flags the rubric as
  ambiguous and the provenance/hallucination numbers as unreliable.

## Results

> **No eval data yet — results land in milestone 02 after the human-led measurement
> campaign.** The table below is structure only. Per PREREGISTRATION §7a the three
> rates are computed over the checkable denominator; `grounded-mischaracterized`
> counts neither for nor against.

| Arm | Provenance/honesty rate | Mischaracterization rate | Hallucination rate |
|---|---|---|---|
| Ungrounded | — | — | — |
| FlavorGraph-only | — | — | — |
| Grounded | — | — | — |
| Gate dynamics (accept/edit/regenerate/reject/redirect; single-operator telemetry, explicit N) | — | — | — |

## Quickstart (fork & run)

Prerequisites: Go 1.26+, Node 20+ (frontend build only), `make`.

```sh
git clone https://github.com/ogngnaoh/capycook.git
cd capycook
cp .env.example .env   # every value optional — missing secrets warn, never fail
make build-all         # web (npm ci + vite build) + Go server -> bin/capycook
make run               # workbench + GET /healthz on :8080
```

- `make build` alone compiles the backend (API + `/healthz`) without Node; the
  embedded workbench UI needs `make build-all`.
- **Stub mode:** with no `DEEPSEEK_API_KEY` set, the server runs a deterministic
  stub LLM and the workbench shows a visible "stub mode — no model key" banner;
  the full loop still works for development and forks.
- **Docker:** `make docker-build` builds the backend image (`capycook:dev`). A
  `docker-compose.yml` fork kit (app + volume, optional self-hosted Langfuse
  profile) arrives in Phase 6.

## Documents

- [`DESIGN.md`](DESIGN.md) — product + system design (what/why, v0.4)
- [`docs/SPEC.md`](docs/SPEC.md) — the Go/React stack (how)
- [`docs/PREREGISTRATION.md`](docs/PREREGISTRATION.md) — **frozen** eval methodology
- [`docs/milestones.md`](docs/milestones.md) — execution order

## License

MIT (see [LICENSE](LICENSE)). Vendored data assets carry their own licenses and
provenance under `data/` (USDA FDC: CC0 · FoodOn: CC BY 4.0 · FlavorGraph: Apache-2.0).
