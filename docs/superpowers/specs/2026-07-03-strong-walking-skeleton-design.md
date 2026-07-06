# Strong Walking Skeleton — Design Spec

> Build a **complete-but-shallow** end-to-end version of the whole app in one push:
> every architectural layer real and connected, the domain edges (model, deterministic
> services, grounding) stubbed behind their real interfaces. Then deepen each stubbed
> edge via the normal slice methodology. Intended to be executed by a strong model
> (Fable 5) as one large, autonomously-run unit — on verification rails.

| | |
|---|---|
| **Status** | Absorbed as Phase 1 of the end-to-end build spec (2026-07-06 — `docs/superpowers/specs/2026-07-06-end-to-end-build-design.md`); its §7 milestone mapping and §9 goal prompt are superseded by that spec |
| **Type** | System design spec (whole-app strong skeleton) |
| **Governed by** | `DESIGN.md` §6.1 (the move/gate loop), §8 (deterministic/generative split), §15 (v0→v2); `docs/SPEC.md` (Go/React stack, §3/§4a/§6/§7) |
| **Supersedes (build order)** | The granular S0.2 → S0.3 → milestone-01 sequence — see §7 |

## 1. Decision & scope answers

Build the strong skeleton all at once, then iterate via slices. Locked scope:
- **Move engine:** a **stub orchestrator behind the real `llm` interface** — deterministic/templated proposals, rationale streamed token-by-token. Real DeepSeek is a later slice (carries the ⚠ verify-before-build gate).
- **Depth:** **real spine, stub edges** (see §3).
- **UI source:** from **existing `DESIGN.md` §6.1 + the graybox workbench** already in `web/`. No new design artifact blocks the build.
- **Execution unit:** **one large goal**, run autonomously, on rails (see §6).

## 2. Execution model (capability-scaled)

Unit size scales with the model; gates scale with risk. Therefore:
- **Large unit:** the whole skeleton is one goal, not a chain of tiny slices.
- **Rails, kept tight:** TDD per subsystem; `go vet ./... && go test ./...` and `npm run test` + `npm run build` green at each subsystem boundary; an end-to-end serve check (local binary **and** container) proving the full loop; commit per subsystem.
- **One human gate:** stop for review **before merging to `master`**. Do not auto-merge.
- **Branch:** build on `strong-skeleton` (never on `master`).

## 3. Scope — real spine vs stub edges

**Real spine (build for real, TDD):**
1. **`store`** — SQLite via pure-Go `modernc.org/sqlite` behind a `Store` interface. Entities: `dishes`, `versions` (the draft version chain), `events`.
2. **`eventlog`** — append-only move/gate log: `Append(Event)`, `Replay(dishID) []Event`. The one truly event-sourced surface (SPEC §3).
3. **`draft`** — the `Draft` type (title, ingredients, steps, cost, nutrition) + snapshot/diff/apply. Accept creates a new immutable version linked to its parent (git-style chain, P0-1).
4. **`proposal`** — the `Proposal` type (diff · rationale · citations · confidence · `unverified` · `safetyBlock`) + structured diff against the current draft.
5. **`orchestrator`** — the gated state machine (P0-A): seed → move → safety screen → gate → verb → apply → repeat; interruptible.
6. **`transport`** — SSE stream (rationale tokens + `proposal-ready`) plus a separate cancel endpoint, single-goroutine select loop (P0-9, SPEC §4a).
7. **HTTP API** (in `cmd/server`, handlers may live in an `internal/httpapi` package) — see §5.
8. **Full two-pane workbench UI** (`web/`) — seed-setup screen + workbench wired to the real API over fetch + SSE; version history, inline diff, streaming rationale, the six gate verbs, all four states with real transitions.

**Stub edges (canned, behind their real interfaces — swappable later):**
- **`llm.LLM`** — `GenerateMove(ctx, draft, steer) (stream, Proposal)`. Stub returns deterministic/templated proposals and streams the rationale word-by-word.
- **`services`** — `Nutrition`, `Cost`, `SafetyGate` interfaces with trivial impls (placeholder nutrition/cost numbers; a tiny hardcoded safety blocklist that can actually block one seeded case).
- **`grounding.Grounding`** — `Suggest(ingredients) []pairing`; stub returns canned pairings.
- **`telemetry`** — thin tracer behind an interface (slog spans / no-op); real OTel→Langfuse is a later slice.

## 4. Data model (SQLite)

- `dishes(id, seed, constraints_json, current_version_id, created_at)`
- `versions(id, dish_id, parent_version_id, draft_json, created_at)` — the version chain
- `events(id, dish_id, seq, type, payload_json, created_at)` — append-only

## 5. HTTP API

- `POST /api/dishes` — create a dish from `{seed, constraints}`; returns the dish + empty draft.
- `POST /api/dishes/{id}/move` — orchestrator runs one move; emits a Proposal (post safety-screen).
- `GET  /api/dishes/{id}/stream` — SSE: rationale tokens, then a `proposal-ready` event carrying the structured Proposal.
- `POST /api/dishes/{id}/cancel` — cancel the in-flight move.
- `POST /api/dishes/{id}/gate` — `{proposalId, verb, edit?}`; applies the verb, appends an event, and on `accept` writes a new version.
- `GET  /api/dishes/{id}` — current draft + state.
- `GET  /api/dishes/{id}/versions` — version history.
- `GET  /healthz`; SPA served at `/` (reuse the existing `web` embed handler).

## 6. Acceptance criteria (end-to-end)

- A user enters a seed + constraints → workbench opens → requests a move → the rationale **streams in over SSE** → a Proposal appears (diff + citations + confidence + `[unverified]`) → **one seeded unsafe proposal is blocked** by the stub safety gate → the user **accepts** a safe one → the draft updates, a **new version** is recorded, and the **event is in the eventlog**.
- Repeat 2–3 moves; **version history shows the chain**; **cancel** aborts an in-flight move.
- All state persists in **SQLite**: restart the server, the dish and its history are still there.
- `go vet ./...`, `go test ./...`, `npm run test`, `npm run build` all green; local binary **and** container serve the full loop.

## 7. Milestone mapping (proposed)

- The strong skeleton becomes **milestone 01 — "strong walking skeleton"**, superseding the granular S0.2 → S0.3 → loop order.
- It folds in the *real* infra formerly scoped as S0.2 (store · eventlog · telemetry-thin).
- Deepening slices (milestone 02+): real DeepSeek (⚠ verify-before-build), real deterministic services, real grounding + data vendoring (old S0.3), the 3-arm eval harness, telemetry→Langfuse, v3 depth (branch-compare, sandbox, explainer, live retrieval).
- `docs/milestones.md` + a new `docs/01-strong-skeleton/` are updated when the build starts.

## 8. Non-goals

- No real DeepSeek/model calls. No real USDA/FlavorGraph data. No real cost tables or safety blocklist beyond one seeded case. No 3-arm eval harness. No v3 features. No production visual design (graybox, styled per-slice later). No auth / multi-user.

## 9. Goal prompt (paste-ready — for a fresh Fable 5 session)

> **Goal: build the CapyCook strong walking skeleton in one autonomous pass, on rails.**
>
> Read first, in order: this spec (`docs/superpowers/specs/2026-07-03-strong-walking-skeleton-design.md`), `DESIGN.md` §6.1 + §8 + §15, `docs/SPEC.md` §3/§4a/§6/§7, `CLAUDE.md`, and the existing graybox UI + Go serve/embed already in `web/` and `cmd/server`.
>
> Build a **complete-but-shallow end-to-end** version of the whole app per §3–§6 of the spec: **real** store (SQLite/modernc), eventlog, draft version chain, orchestrator gated loop, SSE+cancel transport, the full HTTP API (§5), and the full two-pane workbench UI wired to it. **Stub behind real interfaces**: the `llm` (deterministic/templated proposals, streamed rationale), the deterministic services (`Nutrition`/`Cost`/`SafetyGate`, with one seeded blockable case), grounding, and telemetry.
>
> **Rules (rails):**
> - Work on a `strong-skeleton` branch, never `master`.
> - TDD each subsystem; keep `go vet ./...`, `go test ./...`, `npm run test`, and `npm run build` green at every subsystem boundary; commit per subsystem with a clear message.
> - Match existing patterns (`net/http` 1.22 routing, `log/slog`, the `web` embed handler, Vite+React+TS+Tailwind graybox). No new heavy dependencies without noting why.
> - Prove the §6 acceptance criteria end-to-end: run the local binary **and** the container and drive the full loop (move → SSE stream → safety block → accept → new version → persisted event → restart-survives).
> - Do **not** call any real LLM, vendor any real data, or build real service logic — those are later slices (§7/§8).
> - **Stop and hand back for human review before merging to `master`.** Report what was built, the verification evidence, and anything you had to decide or defer. Do not auto-merge.
>
> When done: update `docs/milestones.md` + create `docs/01-strong-skeleton/` (milestone doc + handoff) per §7 and the project's milestone conventions.
