# Design — S0.1 Repo Scaffold

| | |
|---|---|
| **Slice** | S0.1 — repo scaffold (milestone `00-scaffold`, DESIGN §15 v0) |
| **Status** | Approved 2026-07-01 |
| **Governs** | This is the *how* for the first code. Where silent or in tension, DESIGN.md v0.4, PREREGISTRATION.md (frozen), and SPEC.md govern. |
| **Source** | SPEC.md §6 (repo layout), §7 (cross-cutting), §3 (package responsibilities); DESIGN.md §15 (v0 phase) |

---

## 1. Goal

A compiling, runnable Go skeleton whose package layout is **SPEC §6 exactly**, wired just enough that `make build/run/test` work and `GET /healthz` returns `200` — with **no functional logic** in the domain packages yet. This is the first code; it also materializes the project's milestone/slice/handoff doc structure and the project `CLAUDE.md`.

This slice deliberately does **not** satisfy the DESIGN §15 v0 exit criterion (3-arm empty baseline + one replayable traced event). That functionality is slice **S0.2**.

## 2. Real code vs. stub

Only two packages carry logic; everything else is a self-documenting stub so `go build ./...` passes and the layout is traceable to a P0 item.

| Path | This slice |
|---|---|
| `cmd/server` | **Real (minimal):** load config → start stdlib `net/http` server → `GET /healthz` → `200 {"status":"ok"}`; graceful shutdown on SIGINT/SIGTERM via `context`. |
| `internal/config` | **Real (minimal):** read `DEEPSEEK_API_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST` via `os.Getenv` into a `Config` struct; the server's HTTP port has a default. Missing LLM/Langfuse keys **warn, non-fatal**, so healthz runs with no secrets set. |
| `internal/{orchestrator, proposal, draft, eventlog, store, services, grounding, llm, eval, transport, telemetry}` | **Stub:** each a `doc.go` with a package comment stating its P0 mapping + one-line responsibility, drawn from SPEC §3. Compiles; commits to no interface signatures. |
| `web/`, `data/`, `eval/fixtures/` | **Placeholder dirs**, each with a `README.md` naming what lands there and in which later slice (Vite app; vendored FlavorGraph + USDA/FoodOn subset; versioned benchmark set + changelog). No Vite scaffold, no data vendoring this slice. |

**Rationale for doc-comment stubs (not interface-signature stubs):** committing `store.Store`, `llm.Client`, or the `Proposal` shape now would pre-decide contracts that v1 slices should shape against real code and tests. Doc-comment stubs keep the layout honest and traceable without freezing interfaces a slice too early (YAGNI).

## 3. Verifiable end-state (the acceptance check)

On a clean checkout, all of the following pass:

- `go build ./...` — all 13 packages compile.
- `make build` — produces `bin/capycook`.
- `make run` — serves `GET /healthz` → `200 {"status":"ok"}` **with no secrets set**.
- `make test` — green (includes one `internal/config` test).
- `make vet` / `make fmt` — clean.

## 4. Toolchain & Makefile

- **Go** installed via Homebrew (native inner loop) — **go1.26.4** darwin/arm64. `go.mod` pinned to this toolchain (comfortably satisfies SPEC's Go 1.22+ pattern-routing requirement).
- **Module path:** `github.com/ogngnaoh/capycook`.
- **Makefile targets:** `build, run, test, vet, fmt, tidy, docker-build, clean`.

## 5. Dockerfile skeleton

Multi-stage per SPEC §7: stage-1 static Go build (`CGO_ENABLED=0` — the payoff of the pure-Go `modernc` choice, though no SQLite yet this slice); final minimal runtime image containing only the binary. The **web build stage is a commented TODO**, since `/web` isn't scaffolded yet — an honest skeleton where `docker build` still produces a working backend image.

## 6. Docs & project CLAUDE.md

- **`CLAUDE.md`** (repo root, new): commands (make targets), one-line stack summary + pointer to `docs/SPEC.md`, repo structure, env vars, and gotchas — Go via brew; the **DeepSeek verify-before-build flag** (SPEC §4c); pre-registration is frozen. Target < 120 lines.
- **`docs/milestones.md`** (new): numbered index of the four rollout phases mapped to SPEC §6 / DESIGN §15 — `00-scaffold ← active`, `01-loop`, `02-measure-deploy`, `03-depth`. Only the *active* milestone folder is materialized (per the "don't pre-create speculatively" convention).
- **`docs/00-scaffold/`** (new): `milestone.md`, slice doc `01-repo-scaffold.md`, and `handoff.md`.
- **`docs/HANDOFF.md` migration:** the global convention places handoffs per-milestone (`docs/00-scaffold/handoff.md`) with no global handoff. The content moves there; `docs/HANDOFF.md` is reduced to a 2-line pointer to `docs/milestones.md` + the active milestone's handoff, so the "read docs/HANDOFF.md" resume ritual still resolves.

## 7. Out of scope (deferred → S0.2+, tracked in `milestone.md`)

Vite app; data vendoring (FlavorGraph, USDA/FoodOn); real `store` / `eventlog` / `eval` / `telemetry` logic; the 3-arm empty baseline + replayable traced event; any DeepSeek or Langfuse calls. No interface contracts are frozen this slice.

## 8. Testing

One table-driven `internal/config` test (env set → expected `Config`; missing keys → warns, non-fatal). Domain-package tests arrive with their logic in later slices. This matches DESIGN §12's "deterministic services unit-tested against fixtures" discipline without over-testing stubs.
