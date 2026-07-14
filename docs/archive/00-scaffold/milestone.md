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
- `02-eval-harness-shell` — **superseded 2026-07-06**: re-homed into milestone 01 (store/eventlog → phase 1; telemetry → phase 3; eval shell → phase 4) per the end-to-end build spec.
- `03-data-vendoring` — **superseded 2026-07-06**: re-homed into milestone 01 phase 2 (benchmark-seed ratification at Gate C).
- `04-walking-skeleton.md` — graybox workbench, Go-served + containerized (thin UI→serve→Docker; persistence deferred). **shipped**

**Integration notes.** `internal/config` is consumed by `cmd/server` now and by `telemetry`/`llm` later. `eventlog` + `eval` (S0.2) are the two surfaces the DESIGN §15 v0 exit criterion is measured against. `eval/fixtures` (S0.3) is the git-tracked benchmark source of truth (PREREGISTRATION §6).

**Exit criteria (milestone — amended 2026-07-06, shipped as rescoped).** As shipped: compiling skeleton + `/healthz` (S0.1); graybox workbench served natively + in-container (S0.4); PREREGISTRATION frozen pre-run (`6465455`), satisfying DESIGN §15's pre-run registration requirement. The original "3-arm harness runs an empty baseline" and "tracing emits one replayable event" criteria are **re-homed to milestone 01 phases 4 and 3 respectively** (end-to-end build spec §2/§3).
