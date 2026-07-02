# Milestone 00 — Scaffold + pre-register (v0)

**Goal.** Stand up the repo skeleton and the eval-harness shell so the 3-arm ablation runs an empty baseline and tracing emits one replayable event — with pre-registration already frozen.

**Scope.**
- Compiling Go skeleton matching SPEC §6 layout; runnable `/healthz`.
- Project `CLAUDE.md`, Makefile, Dockerfile skeleton, config loader.
- `store` / `eventlog` / `eval`-shell / `telemetry` logic (S0.2).
- Vendored FlavorGraph + USDA/FoodOn subset; versioned benchmark fixtures (S0.3).
- Graybox two-pane workbench skeleton, Go-served + containerized (S0.4).

**Non-goals.**
- No gated loop, Proposal contract, or version chain (that is milestone 01).
- No DeepSeek or Langfuse calls beyond the tracing wire-up in S0.2.
- No *styled/production* UI (that is per-slice work from milestone 01); v0 ships only the graybox walking-skeleton workbench (S0.4).
- No data-vendoring in S0.1 (that is S0.3).

**Slices.**
- `01-repo-scaffold.md` — compiling skeleton + docs + CLAUDE.md. **shipped**
- `02-eval-harness-shell` — store + eventlog + eval shell + telemetry; 3-arm empty baseline + one replayable traced event. **planned**
- `03-data-vendoring` — vendor FlavorGraph, load USDA/FoodOn subset, seed `eval/fixtures`. **planned**
- `04-walking-skeleton.md` — graybox workbench, Go-served + containerized (thin UI→serve→Docker; persistence deferred to S0.2). **shipped**

**Integration notes.** `internal/config` is consumed by `cmd/server` now and by `telemetry`/`llm` later. `eventlog` + `eval` (S0.2) are the two surfaces the DESIGN §15 v0 exit criterion is measured against. `eval/fixtures` (S0.3) is the git-tracked benchmark source of truth (PREREGISTRATION §6).

**Exit criteria (milestone).** The 3-arm harness runs an empty baseline; tracing emits one replayable event; README/PREREGISTRATION pre-registers the ablation (already frozen, `6465455`). S0.1's own exit is the acceptance check in its slice doc.
