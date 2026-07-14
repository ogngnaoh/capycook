# SPEC — Architecture Specification (Go Stack)

> Operationalizes DESIGN.md v0.4 into a concrete, buildable Go/React stack. Where this document is silent or in tension with DESIGN.md or PREREGISTRATION.md, those two govern — this is the *how*, not a second *what/why*.

| | |
|---|---|
| **Status** | Draft v0.1 — stack decision, first pass |
| **Applies to** | DESIGN.md v0.4 §8 (architecture), §11 (P0 requirements), §15 (roadmap); PREREGISTRATION.md (frozen eval methodology) |
| **Last updated** | 2026-07-01 |

---

## 1. Purpose & relationship to DESIGN.md v0.4 / PREREGISTRATION.md

DESIGN.md is the PRD + architecture doc and is deliberately stack-agnostic — it specifies the move/gate machine, the Proposal contract, the version chain, the deterministic/generative split, the safety gate, and the eval methodology in terms of *behavior and invariants*, not a language or framework. PREREGISTRATION.md is the frozen eval methodology (hypotheses, three arms, outcomes, analysis plan) — immutable after T0, amendable only via its own dated log.

This document does neither of those jobs. It answers one question only: **given those two documents, what concrete Go/React stack builds them, and why.** Every decision below is traceable to a DESIGN.md § or a locked v0-scope decision; none of them changes what is being built, only how. Where a stack choice would force a behavioral change (e.g., a persistence engine that couldn't support the event log's append-only replay), that is flagged as a constraint violation, not silently absorbed.

---

## 2. Stack at a glance

| Layer | Decision | 1-line rationale | Key tradeoff |
|---|---|---|---|
| Backend language | **Go** | The hard part — interruptible SSE with no-partial-write-on-cancel — is `context.Context`'s sweet spot; no perf-critical hot path exists (LLM API latency dominates every request) | Rust's perf ceiling is unused; accepted, since perf was never the constraint |
| Frontend | **React + Vite** | Two-pane workbench UI (draft pane + steering pane, DESIGN.md §6.1) is a standard SPA shape; Vite is the fast, boring default | None material — this is the low-stakes half of the stack |
| Model | **DeepSeek-V4-Pro**, OpenAI-compatible API | MIT-licensed, open weights, 1M context, $0.435/M in ($0.003625/M cache-hit) / $0.87/M out *(re-verified against live api-docs 2026-07-07; the earlier ≈$1.74/$3.48 + "5M free tokens" figures are stale — no free allowance is currently documented)*; fits the "open, self-hostable in principle" thesis (§7 licensing) | 1.6T params ⇒ self-hosting needs 2–4×H100; **demo runs the hosted API**, stated plainly (§7) |
| Go LLM client | **`sashabaranov/go-openai`** w/ base-URL override to `https://api.deepseek.com` | DeepSeek's API is OpenAI-schema-compatible; reuses a mature, widely-used Go client instead of a niche one | Alt: `go-deepseek/deepseek` (DeepSeek-specific) if the OpenAI-compat surface gaps on a feature |
| Structured Proposal delivery | **Strict tool-calling (`/beta`, `strict:true`) primary; `json_object` buffer/validate/retry fallback** | DeepSeek's plain `json_object` mode has no schema validation and docs warn of occasional empty content; strict function-calling is the closer analogue to a validated contract | `/beta` strict mode requires all properties required + no `additionalProperties` — a real constraint on the Proposal schema's shape (§4c) |
| Persistence | **SQLite via `modernc.org/sqlite`** (pure Go) behind a `store` interface | Static, reproducible cross-compiled Docker builds with no cgo toolchain; store interface makes the state machine + event replay unit-testable against fixtures | reported ~2× slower INSERT / 10–20% slower SELECT vs. cgo `mattn/go-sqlite3` (community benchmarks, unverified) — irrelevant at a few-thousand-record scale, reversible via the interface |
| Eval boundary | **AUGMENT** (Langfuse + hand-rolled Go) | Langfuse has no multi-annotator support and computes no κ (documented gap) — the inter-rater leg (PREREGISTRATION.md §6) is *forced* hand-rolled, not merely preferred | Two systems to keep honestly separated (§5) instead of one |
| Observability | **OTel-Go → OTLP/HTTP → Langfuse** | Langfuse's native integration path is OTLP/HTTP only (no gRPC, no Go SDK); this is the only supported wire path | Basic-auth header (`base64(pk:sk)`) + a required ingestion-version header, easy to get wrong once |
| HTTP routing | **stdlib `net/http` (Go 1.22+ pattern routing)** | `mux.HandleFunc("GET /path/{id}", …)` covers this API's shape with zero dependencies | `chi` only if regex paths or deep middleware nesting show up later — not expected for a bounded six-verb API |
| State machine | **Hand-rolled `switch`/`case`**, no FSM library | Six verbs, bounded, no durable-checkpoint need — DESIGN.md §8.2 explicitly rejects LangGraph for the same reason | None material; a library would add indirection with nothing to abstract over |
| Vector similarity | **Pre-normalized dot-product cosine, in-memory** | FlavorGraph is a similarity lookup, not multi-hop traversal (DESIGN.md §8.6) — no graph DB, no vector DB | Doesn't scale past an in-memory-sized corpus; FlavorGraph is small and pinned, so this is not a near-term constraint |
| Transport | **SSE + separate cancel endpoint**, single-goroutine `select` loop | Locked in DESIGN.md §8.6; matches OpenAI/Anthropic practice, materially simpler than bidirectional WS | Single-process, in-session cancel only — a stated choice, not a gap (§4a) |

---

## 3. Component architecture

One subsection per `/internal/*` package. Each states the DESIGN.md P0 item(s) it satisfies and how it clears the **"not-a-wrapper" test** (DESIGN.md §2: *if removing the LLM leaves nothing engineered behind, it's a wrapper*).

**`orchestrator`** — P0-A (move/gate state machine), P0-1 (seed intake), P0-8 (iterate-on-feedback). Owns the hand-rolled `switch`/`case` over the six verbs, the minimal autonomy dial, idempotent-accept keying on proposal ID, and take-over reconciliation into the version log. *Not-a-wrapper:* delete the LLM and the state machine, idempotency logic, and verb transitions are all still there and still testable — the LLM only fills one node's output.

**`proposal`** — P0-A (Proposal contract). The `Proposal` struct + structured-diff computation against the current draft version. *Not-a-wrapper:* diff computation and schema validation are plain Go logic independent of what produced the content.

**`draft`** — P0-A (version chain, DESIGN.md §8.3). Snapshot+diff+branch chain with parent pointers; branch-as-tree (no merge); `iteration_log`. *Not-a-wrapper:* this is a real, testable data model (undo/compare/branch) that exists whether or not the content inside a snapshot came from a model.

**`eventlog`** — P0-B (tracing, the eval's hard dependency, DESIGN.md §8.6/§9.4). The one genuinely event-sourced surface: append-only `move_*`/`proposal_blocked`/`move_cancelled` events, replayed by `eval`. *Not-a-wrapper:* the replay mechanics and metric folding are pure Go over stored events; nothing here calls an LLM.

**`store`** — supports `draft` and `eventlog` persistence. `store` interface + the `modernc.org/sqlite` implementation, WAL mode, single-writer for the log. *Not-a-wrapper:* justified by testability (unit-test the state machine and replay against fixtures without a live DB), not speculative abstraction — it is not itself a P0 item, only the mechanism the two P0-A/P0-B persistence surfaces are built on.

**`services`** — P0-5 (scaling, cost, nutrition), P0-7b (safety gate: anaerobic-preservation blocklist, min cook-temps, allergen check). Plain deterministic functions, no LLM anywhere in this package by construction. *Not-a-wrapper:* this package passes the test trivially — it contains zero generative calls.

**`grounding`** — P0-6, P0-7 (FlavorGraph + USDA/FoodOn, toggleable). FlavorGraph in-memory vector lookup; USDA/FoodOn entity resolution; claim-type routing (not numeric fusion, DESIGN.md §8.5). *Not-a-wrapper:* retrieval and resolution are deterministic lookups; the LLM only consumes their output, it doesn't produce grounding.

**`llm`** — P0-6 (model layer, DESIGN.md §8.6 "abstracted/swappable"). The one package whose job *is* calling the model: the `llm` interface, the DeepSeek implementation (structured extraction + streamed rationale, §4c), and the ungrounded-baseline path that reuses the same interface. *Not-a-wrapper caveat, stated honestly:* this package alone, in isolation, would be a wrapper — it earns its place only because it's a thin, isolated, swappable adapter that every other engineered component (gate, services, grounding, eval) sits around and constrains, exactly the shape DESIGN.md §2 asks for.

**`eval`** — P0-B (hero artifact). Replays `eventlog` into gate-accept/edit/reject/redirect dynamics per move-category with explicit N (PREREGISTRATION.md H2); computes the three provenance rates + Cohen's κ over the labeled benchmark set (PREREGISTRATION.md §7); runs the fixed 3-arm ablation harness. *Not-a-wrapper:* this is the deepest non-wrapper component in the repo — none of its metrics depend on which model produced the traced calls.

**`transport`** — P0-9 (SSE + cancel). Per-move SSE stream + a separate `POST /moves/{id}/cancel` endpoint; single-goroutine `select` loop (§4a). *Not-a-wrapper:* the cancellation-race handling and no-partial-write guarantee are real concurrency engineering independent of the model.

**`telemetry`** — P0-B (tracing, hard dependency). OTel-Go setup, OTLP/HTTP exporter wired to Langfuse (§5). *Not-a-wrapper:* wiring and span-attribute discipline are infra work; also the one package that must *not* duplicate `eventlog`'s job (§5).

---

## 4. The three hard mechanisms

### (a) SSE + cancel race, no-partial-write

A move runs in a single goroutine per session that owns all writes for that move; cancellation closes that move's `context.Context`, and nothing is written to `store` until an `accept` verb — so cancel is **discard, not rollback** (DESIGN.md §8.6).

```go
func (o *Orchestrator) RunMove(ctx context.Context, m Move) {
    events := make(chan Event)
    go o.generate(ctx, m, events) // producer selects on ctx.Done() before every send

    heartbeat := time.NewTicker(15 * time.Second)
    defer heartbeat.Stop()

    for {
        select {
        case <-ctx.Done():
            return // discard: nothing was written to store pre-accept
        case ev, ok := <-events:
            if !ok {
                return // move complete; Proposal handed to safety gate
            }
            o.writer.Send(ev) // single writer serializes all SSE writes
        case <-heartbeat.C:
            o.writer.Ping()
        }
    }
}
```

The cancel endpoint holds the per-move `cancel func()` in a session-scoped map and calls it; the `select` loop's `ctx.Done()` branch fires, the goroutine returns, and no store write has occurred. `http.Flusher.Flush()` is called after every write; shutdown drains via the same context tree. This is the single-goroutine-`select`-loop pattern for interruptible SSE over `context.Context` cancellation ([oneuptime.com Go SSE / graceful-shutdown](https://oneuptime.com/blog) pattern family), applied to the constraint DESIGN.md §8.6 states explicitly: single-process, in-session cancellation, not durable execution.

### (b) Event-sourced log + replay

`eventlog` is a single append-only SQLite table (`events(id, session_id, seq, type, payload, ts)`), WAL mode, one writer. The eval harness's only read path into gate dynamics is a full sequential scan folded into counters — there is no second, mutable projection to drift out of sync:

```go
func Replay(rows RowScanner) GateMetrics {
    var m GateMetrics
    for rows.Next() {
        var ev Event
        rows.Scan(&ev)
        m.Fold(ev) // per-move-category accept/edit/reject/redirect/cancel counters
    }
    return m
}
```

This is the standard append-only-log-plus-replay pattern for event-sourced storage (general engineering knowledge; confirm SQLite-specific WAL/ordering specifics against `sqlite.org` docs at build) and is the *only* surface in the system DESIGN.md §8.6 calls "truly event-sourced" — the draft's version chain (§8.3, `draft` package) is deliberately not this pattern.

### (c) Structured Proposal extraction from DeepSeek

The Proposal (DESIGN.md §8.2) is a batched, complete structured object; only `rationale` streams. Primary path: strict function/tool-calling against the `/beta` endpoint with `strict: true`, a tool schema mirroring the `Proposal` struct (all properties required, `additionalProperties: false`) — the closer analogue to schema-validated output, since plain `json_object` mode has no such validation and DeepSeek's docs note occasional empty content:

```go
resp, err := client.CreateChatCompletion(ctx, openai.ChatCompletionRequest{
    Model: "deepseek-v4-pro", // ⚠ verify exact model name against live docs before build
    Tools: []openai.Tool{proposalToolSchema}, // strict:true, all-required, no additionalProperties
    ToolChoice: openai.ToolChoice{Type: "function", Function: proposalFn},
})
proposal, err := decodeStrict[Proposal](resp.Choices[0].Message.ToolCalls[0].Function.Arguments)
```

Fallback path (tool-calling unavailable or malformed): request `json_object` mode, buffer the full response (no partial parse), decode with `json.NewDecoder(...).DisallowUnknownFields()`, retry up to a fixed bound on failure, and emit `proposal_blocked` to the event log if retries exhaust — never surface a partially-parsed Proposal to the safety gate. The streamed `rationale` is a separate, ordinary OpenAI-style SSE chat completion call/channel, decoupled from the batched extraction call.

**⚠ Verify-before-build:** the exact `deepseek-v4-pro` model identifier, the `/beta` strict-mode endpoint semantics, the `json_object` empty-content caveat, **and the pricing / context-window / parameter-count figures cited in §2** must all be re-checked against live `api-docs.deepseek.com` when the harness is actually built — this spec's DeepSeek-API knowledge predates the harness build and may be stale. *(Verified 2026-07-07, milestone-01 Phase 3: `deepseek-v4-pro` exists (legacy `deepseek-chat`/`deepseek-reasoner` deprecate 2026-07-24); `/beta` strict tool-calling confirmed with strict:true + all-required + additionalProperties:false; `json_object` remains schema-unvalidated with the documented occasional-empty-content caveat plus include-"json"-in-prompt and max_tokens caveats; pricing re-pinned in §2 — no structural drift.)*

**2026-07-08 re-verify (live api-docs.deepseek.com):** generator deepseek-v4-pro confirmed current ($0.435/1M in miss · $0.87/1M out, 1M ctx); judge for Amendment-1 R2 = deepseek-v4-flash ($0.14/$0.28); legacy aliases deepseek-chat/deepseek-reasoner deprecate 2026-07-24 (codebase unaffected — already on v4-pro); json_object caveats confirmed (word "json" required in prompt, occasional empty content → bounded retry); no /beta strict-schema mode documented any longer — existing /beta strict tool-calling still works live (Gate B), noted as doc drift only.

---

## 5. Eval + observability

The eval boundary is **AUGMENT**, not replace: Langfuse is not asked to do anything it structurally cannot, and nothing is double-traced.

| Owns | Langfuse | Hand-rolled Go (`eventlog` + `eval`) |
|---|---|---|
| LLM-call tracing | ✅ (via OTel/OTLP) | — |
| Prompt management | ✅ | — |
| LLM-as-judge evals | ✅ available, but not used for v0 scoring | ✅ amended Tier-2 DeepSeek judge R2; zero eligible Tier-2 rows in v0 |
| Benchmark-dataset hosting | ✅ | `eval/fixtures` is the git-tracked source of truth; Langfuse may mirror it |
| Tiered claim verification | — | ✅ Tier-1 deterministic verifier (562 v0 rows) + Tier-2 blinded author R1 / DeepSeek judge R2 (zero v0 rows); the 18-row delegated-LLM blind-check covered only Tier-1 empty-source behavior and is not human validation |
| Move/gate event log | — | ✅ append-only, replayed |
| Gate-dynamics metrics (accept/edit/reject/redirect, per move-category, explicit N) | — | ✅ |
| Three provenance rates (honesty · mischaracterization · hallucination) | — | ✅ — Langfuse has no concept of this rubric |
| Cohen's κ + confusion matrix | — | ✅ — **forced**, not preferred: Langfuse annotation queues have no multi-annotator support and compute no κ; v0 had zero Tier-2 pairs, so κ was unmeasurable ([langfuse/discussions #4348](https://github.com/orgs/langfuse/discussions/4348)) |

**Wiring:** OTel-Go SDK → OTLP/HTTP exporter (gRPC is not supported by Langfuse's ingestion path) → `${LANGFUSE_HOST}/api/public/otel`, `Authorization: Basic base64(pk:sk)`, header `x-langfuse-ingestion-version: 4`. Trace-level attributes (`session_id`, `arm`, `move_type`) are attached to *every* span, not just the root — Langfuse's trace-level fields are read per-span ([langfuse.com/integrations/native/opentelemetry](https://langfuse.com/integrations/native/opentelemetry)).

**No double-tracing (stated explicitly, per DESIGN.md §8.6's event-log/traces separation):** `llm` package calls are wrapped in OTel spans → Langfuse only. Domain events (moves, gate verbs, cancellations, blocks) go to `eventlog`/SQLite only — never re-emitted as OTel spans. The event log is the source of truth the eval replays; traces are observability, not a second copy of the data the hero metrics depend on.

Self-hostable: Langfuse ships MIT-core and is self-hostable via `docker-compose` ([langfuse.com/self-hosting](https://langfuse.com/self-hosting)) — the demo documents and uses this path, distinct from the model-hosting caveat in §7.

---

## 6. Repo layout & rollout

```
/cmd/server                     main — HTTP server wiring, P0-11
/internal/orchestrator          move/gate state machine — P0-A, P0-1, P0-8
         /proposal               Proposal contract + structured diff — P0-A
         /draft                  version chain (snapshot/diff/branch) — P0-A
         /eventlog               append-only move/gate event log — P0-B
         /store                  store interface + modernc sqlite impl — supports P0-A/P0-B persistence
         /services               deterministic: scaling·cost·nutrition·allergen·safety — P0-5, P0-7b
         /grounding              FlavorGraph vectors + USDA/FoodOn resolution — P0-6, P0-7
         /llm                    model interface + DeepSeek impl — P0-6
         /eval                   harness: event-log replay + metrics (three rates, κ, gate dynamics) — P0-B
         /transport              SSE + separate cancel endpoint — P0-9
         /telemetry              OTel setup → OTLP/HTTP to Langfuse — P0-B
/web                             React + Vite frontend (draft pane + steering pane) — P0-11
/data                            vendored FlavorGraph + USDA/FoodOn subset (pinned) — §10 licensing
/eval/fixtures                   versioned benchmark set (git fixture) — PREREGISTRATION.md §6
Dockerfile · Makefile            build/deploy — P0-11
```

Every `/internal/*` package maps to a named P0 item above; no package is unmapped, and every P0 item in DESIGN.md §11 has a home.

**Rollout, mapped to DESIGN.md §15 phases:**

> **Amended 2026-07-06:** build order below is superseded by `docs/superpowers/specs/2026-07-06-end-to-end-build-design.md` (milestone 01, end-to-end build). Exit criteria stand and are re-homed by that spec; the phase rows no longer govern sequencing. Langfuse note (§5): self-hostable — a compose file ships in the repo; the author's own runs use Langfuse Cloud.

| Phase | Packages touched | Exit criterion (from DESIGN.md §15) |
|---|---|---|
| **v0 — Scaffold + pre-register (wk 0–1)** | `store`, `eventlog`, `eval` (shell), `telemetry`, `data/`, `eval/fixtures` | 3-arm harness runs an empty baseline; tracing emits one replayable event; README pre-registers (already frozen in PREREGISTRATION.md) |
| **v1 — Pillar 1: the loop (wk 2–6)** | `orchestrator`, `proposal`, `draft`, `services`, `grounding`, `llm`, `transport` | A cook takes a seed to a finished, grounded, costed, safety-screened dish entirely through gated moves; both ablation arms run through the same orchestrator; an unsafe proposal is blocked |
| **v2 — Pillar 2: measure + iterate + deploy (wk 7–10)** | `eval` (full), `orchestrator` (P0-8 iteration), `web`, `cmd/server`, Dockerfile | README results table led by process metrics; grounding ablation in a supporting section; live demo deployed |
| **v3 — Depth (wk 11–13)** | `grounding` (4th live-retrieval arm), `draft` (branching/compare), `llm`/`services` (technique explainer), `orchestrator` (flavor sandbox mode, full autonomy dial) | Live-retrieval arm reports; compare-variations works; flavor sandbox live under the safety gate |

*(DESIGN.md §15's "Stretch — P2" phase is intentionally omitted from this rollout map: P2 contains no P0 items, so there is nothing to map 1:1; it stays out of the v0 build.)*

---

## 7. Cross-cutting concerns

**Testing.** Deterministic services (`services`) and the safety gate are table-driven unit tests against fixtures (known ingredients → known cost/nutrition/allergen/block outcomes) — DESIGN.md §12's explicit requirement. `eventlog`/`eval` replay is tested against versioned fixture event logs with known expected metrics. `eval/fixtures` itself is a git-tracked benchmark fixture with a changelog (PREREGISTRATION.md §6), not a floating dataset.

**Config/secrets.** `DEEPSEEK_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` via environment variables, read through a small `internal/config` loader (stdlib `os.Getenv`, no secrets library needed at this scale); `.env.example` is committed, `.env` is not.

**Docker.** Multi-stage build: stage 1 builds a static Go binary (`CGO_ENABLED=0` — enabled by the pure-Go `modernc.org/sqlite` driver, §2); stage 2 builds `web/` via Vite; stage 3 is a minimal runtime image containing only the binary and the built static frontend assets (served by the Go binary via `embed` or a static file handler). No cgo toolchain is required anywhere in the build, which is the concrete payoff of the `modernc` choice.

**Licensing.** DeepSeek weights are MIT-licensed (the demo calls the hosted API, not the weights — see the self-host note below); Langfuse is MIT-core and self-hostable; data assets follow DESIGN.md §10 exactly: USDA FoodData Central (CC0), FoodOn (CC BY 4.0), FlavorGraph (Apache-2.0, vendored/pinned), KitcheNette (Apache-2.0, optional, pinned); Recipe1MSubs (CC-BY-NC) is benchmark-only and never shipped, matching §10's non-commercial constraint.

**Self-host honesty note.** DESIGN.md frames the project as "self-hostable." That claim is true of the *system* (Go binary + SQLite + Langfuse's own `docker-compose`) but not, in this build, of the *model*: DeepSeek-V4-Pro is 1.6T parameters and self-hosting it would need 2–4×H100-class hardware, so the demo calls the hosted DeepSeek API. The `llm` interface is deliberately kept swappable (§3) so a self-hosted model could be substituted without touching the rest of the system — but stating that the *demo as shipped* uses a hosted API, not a self-hosted model, is the honest version of this claim.

---

## 8. Alternatives considered

- **Rust** — rejected: no perf-critical hot path exists (LLM latency dominates every request), so Rust's advantages go unused while `context.Context`-based cancellation, Go's actual sweet spot, is lost.
- **TypeScript (full-stack, Node backend)** — rejected: possible, but a Go backend + React frontend split reads as stronger systems/backend signal for the target big-tech systems/SWE roles than an all-TS stack.
- **Postgres** — rejected: SQLite is sufficient at this scale (few-thousand records, single-user demo, not perf-sensitive) and avoids running a separate DB server for a portfolio deployment; reversible via the `store` interface if this changes.
- **cgo `mattn/go-sqlite3`** — rejected: faster, but requires a cgo toolchain, which breaks static, reproducible cross-compiled Docker builds (§7); the throughput gap it trades away is irrelevant at this scale.
- **Anthropic model** — rejected: DeepSeek-V4-Pro is MIT-licensed with open weights and a 1M context window at a fraction of the cost, and better fits the "open, self-hostable in principle" thesis, even though the demo runs the hosted API (§7).
- **Langfuse-replace-hand-rolled** (push κ / three rates / gate dynamics into Langfuse instead of hand-rolling) — rejected: Langfuse annotation queues have no multi-annotator support and compute no κ (documented gap, [langfuse/discussions #4348](https://github.com/orgs/langfuse/discussions/4348)); the inter-rater leg is *forced* hand-rolled, not a preference.
- **JSON-schema mode** — rejected as the primary path: DeepSeek offers `json_object` mode only, with no schema validation and documented occasional empty content; strict tool/function-calling is the closer analogue to validated structured output and is used as primary, with `json_object` demoted to a buffered fallback (§4c).
