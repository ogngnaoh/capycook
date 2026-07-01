# Repo Scaffold (S0.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a compiling, runnable Go skeleton matching SPEC §6 layout — `make build/run/test` work, `GET /healthz` returns 200 — plus the project `CLAUDE.md` and milestone/slice/handoff docs. Scaffold-only; no domain logic.

**Architecture:** Two packages carry real (minimal) logic — `internal/config` (env → `Config`) and `cmd/server` (stdlib `net/http` server with `/healthz` + graceful shutdown). The eleven `internal/*` domain packages are `doc.go` stubs mapping to their P0 item. `web/`, `data/`, `eval/fixtures/` are documented placeholder dirs. Docker is a multi-stage skeleton with the web stage as a commented TODO.

**Tech Stack:** Go 1.26.4 (Homebrew), stdlib `net/http` (1.22+ pattern routing), `log/slog`, `make`, Docker multi-stage (distroless static runtime).

## Global Constraints

- Module path: `github.com/ogngnaoh/capycook` (verbatim).
- Go toolchain: **go1.26.4**; `go.mod` declares `go 1.26`.
- Package layout must match SPEC §6 exactly — every `internal/*` package maps to a P0 item.
- No functional domain logic, no interface contracts frozen, no DeepSeek/Langfuse calls this slice (deferred → S0.2+).
- `internal/config` treats missing secrets as **warn, non-fatal** — `make run` must serve `/healthz` with zero env set.
- Makefile recipes are **tab-indented** (not spaces).
- Commit after each task. End commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Prepend `export PATH="/opt/homebrew/bin:$PATH"` (or ensure `go` is on PATH) for every `go`/`make` command — Go was installed via Homebrew this session.

---

### Task 1: Milestone & slice orientation docs

Orientation artifacts that make the milestone/slice structure real before code lands. No code.

**Files:**
- Create: `docs/milestones.md`
- Create: `docs/00-scaffold/milestone.md`
- Create: `docs/00-scaffold/01-repo-scaffold.md`

- [ ] **Step 1: Write `docs/milestones.md`** (numbered index, active marker)

```markdown
# Milestones

Execution order. The `← active` milestone is current. Only the active milestone's folder is materialized; future folders appear when their work begins.

00. scaffold        → docs/00-scaffold/       ← active
01. loop            → docs/01-loop/           — planned  (v1, Pillar 1 — the gated loop)
02. measure-deploy  → docs/02-measure-deploy/ — planned  (v2, Pillar 2 — eval + iterate + deploy)
03. depth           → docs/03-depth/          — planned  (v3 — live retrieval, branching, sandbox)

Mapping: milestones follow SPEC §6 rollout / DESIGN §15 phases (v0→v3).
```

- [ ] **Step 2: Write `docs/00-scaffold/milestone.md`**

```markdown
# Milestone 00 — Scaffold + pre-register (v0)

**Goal.** Stand up the repo skeleton and the eval-harness shell so the 3-arm ablation runs an empty baseline and tracing emits one replayable event — with pre-registration already frozen.

**Scope.**
- Compiling Go skeleton matching SPEC §6 layout; runnable `/healthz`.
- Project `CLAUDE.md`, Makefile, Dockerfile skeleton, config loader.
- `store` / `eventlog` / `eval`-shell / `telemetry` logic (S0.2).
- Vendored FlavorGraph + USDA/FoodOn subset; versioned benchmark fixtures (S0.3).

**Non-goals.**
- No gated loop, Proposal contract, or version chain (that is milestone 01).
- No DeepSeek or Langfuse calls beyond the tracing wire-up in S0.2.
- No Vite frontend build (deferred; `/web` is a placeholder until v2).
- No data-vendoring in S0.1 (that is S0.3).

**Slices.**
- `01-repo-scaffold.md` — compiling skeleton + docs + CLAUDE.md. **in-progress**
- `02-eval-harness-shell` — store + eventlog + eval shell + telemetry; 3-arm empty baseline + one replayable traced event. **planned**
- `03-data-vendoring` — vendor FlavorGraph, load USDA/FoodOn subset, seed `eval/fixtures`. **planned**

**Integration notes.** `internal/config` is consumed by `cmd/server` now and by `telemetry`/`llm` later. `eventlog` + `eval` (S0.2) are the two surfaces the DESIGN §15 v0 exit criterion is measured against. `eval/fixtures` (S0.3) is the git-tracked benchmark source of truth (PREREGISTRATION §6).

**Exit criteria (milestone).** The 3-arm harness runs an empty baseline; tracing emits one replayable event; README/PREREGISTRATION pre-registers the ablation (already frozen, `6465455`). S0.1's own exit is the acceptance check in its slice doc.
```

- [ ] **Step 3: Write `docs/00-scaffold/01-repo-scaffold.md`** (slice doc)

```markdown
# Slice S0.1 — Repo scaffold

**Goal.** A compiling, runnable Go skeleton matching SPEC §6 exactly — `make build/run/test` work and `GET /healthz` returns 200 — plus project `CLAUDE.md` and the milestone/slice/handoff docs. No domain logic.

**Plan.** See `docs/superpowers/plans/2026-07-01-repo-scaffold.md` (full task breakdown) and `docs/superpowers/specs/2026-07-01-repo-scaffold-design.md` (design).

**Tasks.**
- [ ] Milestone/slice orientation docs
- [ ] Module + Makefile + config loader (TDD)
- [ ] HTTP server `/healthz` + graceful shutdown (TDD)
- [ ] Domain package `doc.go` stubs (11 packages)
- [ ] Placeholder dirs + Dockerfile skeleton + ignore files
- [ ] Project `CLAUDE.md` + handoff + slice-ship bookkeeping

**Acceptance.** On a clean checkout: `go build ./...` compiles all 13 packages; `make build` → `bin/capycook`; `make run` serves `/healthz`→200 with no secrets; `make test` green; `make vet`/`make fmt` clean.

**Notes.** doc-comment stubs, not interface-signature stubs (interfaces shaped in v1 against real code). Module path `github.com/ogngnaoh/capycook`. `docs/HANDOFF.md` becomes a pointer to `docs/milestones.md` + active handoff.
```

- [ ] **Step 4: Commit**

```bash
git add docs/milestones.md docs/00-scaffold/
git commit -m "docs: materialize milestone/slice structure for scaffold (S0.1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Module + Makefile + config loader (TDD)

**Files:**
- Create: `go.mod`
- Create: `Makefile`
- Create: `internal/config/config.go`
- Create: `internal/config/config_test.go`
- Create: `.env.example`

**Interfaces:**
- Produces: `config.Config` struct with fields `Port, DeepSeekAPIKey, LangfusePublicKey, LangfuseSecretKey, LangfuseHost string`; `config.Load() Config`. Consumed by `cmd/server` (Task 3).

- [ ] **Step 1: Init the module**

Run: `go mod init github.com/ogngnaoh/capycook`
Expected: creates `go.mod` with `module github.com/ogngnaoh/capycook` and `go 1.26`.

- [ ] **Step 2: Write `Makefile`** (tabs, not spaces, in recipe bodies)

```makefile
BINARY := bin/capycook
PKG := ./...

.PHONY: build run test vet fmt tidy docker-build clean

build:
	go build -o $(BINARY) ./cmd/server

run:
	go run ./cmd/server

test:
	go test $(PKG)

vet:
	go vet $(PKG)

fmt:
	gofmt -l -w .

tidy:
	go mod tidy

docker-build:
	docker build -t capycook:dev .

clean:
	rm -rf bin
```

- [ ] **Step 3: Write the failing test** — `internal/config/config_test.go`

```go
package config

import "testing"

func TestLoadReadsEnv(t *testing.T) {
	t.Setenv("DEEPSEEK_API_KEY", "dk")
	t.Setenv("LANGFUSE_PUBLIC_KEY", "pk")
	t.Setenv("LANGFUSE_SECRET_KEY", "sk")
	t.Setenv("LANGFUSE_HOST", "https://lf.example")
	t.Setenv("PORT", "9090")

	c := Load()

	if c.DeepSeekAPIKey != "dk" || c.LangfusePublicKey != "pk" ||
		c.LangfuseSecretKey != "sk" || c.LangfuseHost != "https://lf.example" {
		t.Fatalf("secrets not read into Config: %+v", c)
	}
	if c.Port != "9090" {
		t.Fatalf("Port = %q, want 9090", c.Port)
	}
}

func TestLoadDefaultsPort(t *testing.T) {
	t.Setenv("PORT", "")
	if got := Load().Port; got != "8080" {
		t.Fatalf("default Port = %q, want 8080", got)
	}
}

func TestLoadMissingSecretsNonFatal(t *testing.T) {
	t.Setenv("DEEPSEEK_API_KEY", "")
	c := Load() // must not panic / must not exit
	if c.DeepSeekAPIKey != "" {
		t.Fatalf("expected empty DeepSeekAPIKey, got %q", c.DeepSeekAPIKey)
	}
}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `go test ./internal/config/`
Expected: FAIL — `undefined: Load` / package has no non-test Go files.

- [ ] **Step 5: Write minimal implementation** — `internal/config/config.go`

```go
// Package config loads runtime configuration from the environment
// (SPEC §7). Missing LLM/Langfuse secrets warn but are non-fatal so the
// server can start (e.g. for /healthz) without them.
package config

import (
	"log/slog"
	"os"
)

// Config holds runtime configuration read from the environment.
type Config struct {
	Port              string
	DeepSeekAPIKey    string
	LangfusePublicKey string
	LangfuseSecretKey string
	LangfuseHost      string
}

// Load reads configuration from environment variables. Absent secrets are
// logged at warn level and left empty rather than failing.
func Load() Config {
	c := Config{
		Port:              getenvDefault("PORT", "8080"),
		DeepSeekAPIKey:    os.Getenv("DEEPSEEK_API_KEY"),
		LangfusePublicKey: os.Getenv("LANGFUSE_PUBLIC_KEY"),
		LangfuseSecretKey: os.Getenv("LANGFUSE_SECRET_KEY"),
		LangfuseHost:      os.Getenv("LANGFUSE_HOST"),
	}
	for _, k := range []string{
		"DEEPSEEK_API_KEY", "LANGFUSE_PUBLIC_KEY",
		"LANGFUSE_SECRET_KEY", "LANGFUSE_HOST",
	} {
		if os.Getenv(k) == "" {
			slog.Warn("config: environment variable not set", "key", k)
		}
	}
	return c
}

func getenvDefault(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `go test ./internal/config/`
Expected: PASS (ok  github.com/ogngnaoh/capycook/internal/config)

- [ ] **Step 7: Write `.env.example`**

```
# Copy to .env (gitignored) and fill in. Missing values are non-fatal;
# /healthz runs without any of these set.
PORT=8080
DEEPSEEK_API_KEY=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_HOST=https://cloud.langfuse.com
```

- [ ] **Step 8: Commit**

```bash
git add go.mod Makefile internal/config/ .env.example
git commit -m "feat(config): module init, Makefile, env config loader

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: HTTP server `/healthz` + graceful shutdown (TDD)

**Files:**
- Create: `cmd/server/main.go`
- Create: `cmd/server/main_test.go`

**Interfaces:**
- Consumes: `config.Load()` from Task 2.
- Produces: `newRouter() http.Handler` (package `main`, tested via `httptest`); binary entrypoint at `./cmd/server`.

- [ ] **Step 1: Write the failing test** — `cmd/server/main_test.go`

```go
package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthzReturnsOK(t *testing.T) {
	srv := httptest.NewServer(newRouter())
	defer srv.Close()

	resp, err := http.Get(srv.URL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != `{"status":"ok"}` {
		t.Fatalf("body = %q, want {\"status\":\"ok\"}", string(body))
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `go test ./cmd/server/`
Expected: FAIL — `undefined: newRouter`.

- [ ] **Step 3: Write minimal implementation** — `cmd/server/main.go`

```go
// Command server is the CapyCook HTTP entrypoint (P0-11). This slice wires
// only config loading, a /healthz endpoint, and graceful shutdown; domain
// routes land with the transport package in later slices.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ogngnaoh/capycook/internal/config"
)

func newRouter() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	})
	return mux
}

func main() {
	cfg := config.Load()

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           newRouter(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info("server starting", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("graceful shutdown failed", "err", err)
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `go test ./cmd/server/`
Expected: PASS

- [ ] **Step 5: Verify build + run manually**

Run: `make build && ./bin/capycook &` then `curl -s localhost:8080/healthz` then `kill %1`
Expected: `{"status":"ok"}`; server logs a start line and a clean shutdown line.

- [ ] **Step 6: Commit**

```bash
git add cmd/server/
git commit -m "feat(server): /healthz endpoint + graceful shutdown

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Domain package `doc.go` stubs

Eleven compiling stubs so the SPEC §6 layout is real and traceable. Each is a package comment stating the P0 mapping + one-line responsibility (from SPEC §3), no logic.

**Files (create each `internal/<pkg>/doc.go`):** `orchestrator`, `proposal`, `draft`, `eventlog`, `store`, `services`, `grounding`, `llm`, `eval`, `transport`, `telemetry`.

- [ ] **Step 1: Create the eleven `doc.go` files**

`internal/orchestrator/doc.go`
```go
// Package orchestrator owns the hand-rolled move/gate state machine
// (P0-A, P0-1, P0-8; SPEC §3): the switch over the six verbs, idempotent
// accept, take-over reconciliation, and the minimal autonomy dial.
// Stub — no logic yet (lands in milestone 01).
package orchestrator
```

`internal/proposal/doc.go`
```go
// Package proposal holds the Proposal contract and structured-diff
// computation against the current draft version (P0-A; SPEC §3).
// Stub — no logic yet (lands in milestone 01).
package proposal
```

`internal/draft/doc.go`
```go
// Package draft is the git-style versioned dish draft: snapshot + diff +
// branch chain with parent pointers and an iteration log (P0-A; SPEC §3).
// Stub — no logic yet (lands in milestone 01).
package draft
```

`internal/eventlog/doc.go`
```go
// Package eventlog is the append-only move/gate event log — the one truly
// event-sourced surface, replayed by eval (P0-B; SPEC §3).
// Stub — no logic yet (lands in milestone 00, slice S0.2).
package eventlog
```

`internal/store/doc.go`
```go
// Package store is the persistence boundary: a store interface plus the
// pure-Go modernc.org/sqlite implementation (WAL, single-writer) that
// draft and eventlog persist through (supports P0-A/P0-B; SPEC §3).
// Stub — no logic yet (lands in milestone 00, slice S0.2).
package store
```

`internal/services/doc.go`
```go
// Package services holds deterministic, LLM-free functions: scaling, cost,
// nutrition, allergen check, and the safety gate blocklist/min-cook-temps
// (P0-5, P0-7b; SPEC §3).
// Stub — no logic yet (lands in milestone 01).
package services
```

`internal/grounding/doc.go`
```go
// Package grounding is the deterministic retrieval layer: in-memory
// FlavorGraph vector lookup plus USDA/FoodOn entity resolution and
// claim-type routing (P0-6, P0-7; SPEC §3).
// Stub — no logic yet (lands in milestone 01).
package grounding
```

`internal/llm/doc.go`
```go
// Package llm is the swappable model layer: the llm interface, the DeepSeek
// implementation (structured extraction + streamed rationale), and the
// ungrounded-baseline path over the same interface (P0-6; SPEC §3).
// Stub — no logic yet (lands in milestone 01).
package llm
```

`internal/eval/doc.go`
```go
// Package eval is the harness (hero artifact): replays eventlog into gate
// dynamics, computes the three provenance rates + Cohen's kappa, and runs
// the fixed 3-arm ablation (P0-B; SPEC §3, PREREGISTRATION §6/§7).
// Stub — no logic yet (lands in milestone 00, slice S0.2).
package eval
```

`internal/transport/doc.go`
```go
// Package transport is the SSE stream plus the separate cancel endpoint,
// driven by a single-goroutine select loop (P0-9; SPEC §3/§4a).
// Stub — no logic yet (lands in milestone 01).
package transport
```

`internal/telemetry/doc.go`
```go
// Package telemetry wires OpenTelemetry-Go through an OTLP/HTTP exporter to
// Langfuse; it must not duplicate eventlog's job (P0-B; SPEC §3/§5).
// Stub — no logic yet (lands in milestone 00, slice S0.2).
package telemetry
```

- [ ] **Step 2: Verify the whole module builds and vets**

Run: `go build ./... && go vet ./...`
Expected: no output, exit 0 — all 13 packages compile.

- [ ] **Step 3: Commit**

```bash
git add internal/
git commit -m "chore: doc.go stubs for the eleven internal domain packages

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Placeholder dirs + Dockerfile skeleton + ignore files

**Files:**
- Create: `web/README.md`, `data/README.md`, `eval/fixtures/README.md`, `eval/fixtures/CHANGELOG.md`
- Create: `Dockerfile`, `.dockerignore`, `.gitignore`

- [ ] **Step 1: Placeholder READMEs**

`web/README.md`
```markdown
# web/ — React + Vite frontend (placeholder)

Two-pane workbench UI (draft pane + steering pane, DESIGN §6.1). The Vite
app is not scaffolded yet; it lands in v2 (milestone 02). Until then this
directory is a placeholder so the SPEC §6 layout is complete.
```

`data/README.md`
```markdown
# data/ — vendored, pinned assets (placeholder)

FlavorGraph (Apache-2.0) + a USDA FoodData Central (CC0) / FoodOn (CC BY
4.0) subset, vendored and pinned (DESIGN §10, SPEC §6). Vendoring lands in
milestone 00, slice S0.3. Empty placeholder for now.
```

`eval/fixtures/README.md`
```markdown
# eval/fixtures/ — versioned benchmark set (placeholder)

The git-tracked source of truth for the benchmark set and replay fixtures
(PREREGISTRATION §6). Seeded in milestone 00, slice S0.3. See CHANGELOG.md
for the versioned change log required by the pre-registration.
```

`eval/fixtures/CHANGELOG.md`
```markdown
# Benchmark fixtures — changelog

Every change to the versioned benchmark set is logged here (PREREGISTRATION
§6). No fixtures yet — seeded in slice S0.3.
```

- [ ] **Step 2: Write `.gitignore`**

```
/bin/
.env
```

- [ ] **Step 3: Write `.dockerignore`**

```
.git
bin
.env
docs
web/node_modules
```

- [ ] **Step 4: Write `Dockerfile`** (multi-stage skeleton; web stage commented until `/web` exists)

```dockerfile
# syntax=docker/dockerfile:1

# --- Stage 1: static Go binary (CGO_ENABLED=0, pure-Go per SPEC §7) ---
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod ./
# COPY go.sum ./            # add when the first dependency lands
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/capycook ./cmd/server

# --- Stage 2: web assets (Vite) — TODO: enable when /web is scaffolded (v2) ---
# FROM node:22-alpine AS web
# WORKDIR /web
# COPY web/ .
# RUN npm ci && npm run build

# --- Stage 3: minimal runtime ---
FROM gcr.io/distroless/static-debian12
COPY --from=build /out/capycook /capycook
# COPY --from=web /web/dist /web/dist   # TODO with the web stage
EXPOSE 8080
ENTRYPOINT ["/capycook"]
```

- [ ] **Step 5: Verify the Docker build produces a backend image**

Run: `docker build -t capycook:dev .`
Expected: build succeeds through all uncommented stages; final image tagged `capycook:dev`. (If Docker is slow/unavailable, note it and rely on `make build` for the Go verification — the Dockerfile is a skeleton, not a slice deliverable gate.)

- [ ] **Step 6: Commit**

```bash
git add web/ data/ eval/ Dockerfile .dockerignore .gitignore
git commit -m "chore: placeholder dirs, Dockerfile skeleton, ignore files

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Project `CLAUDE.md` + handoff + slice-ship bookkeeping

Final task: the project `CLAUDE.md` (now that all commands are real and verified), the migrated handoff, the `docs/HANDOFF.md` pointer, and the slice-ship doc bookkeeping (status flips + slice-shipped log line) — all in one commit per the workflow convention.

**Files:**
- Create: `CLAUDE.md`
- Create: `docs/00-scaffold/handoff.md`
- Modify: `docs/HANDOFF.md` (replace with pointer)
- Modify: `docs/milestones.md` (no change to status yet — milestone stays active)
- Modify: `docs/00-scaffold/milestone.md` (flip S0.1 slice status → shipped)
- Modify: `docs/00-scaffold/01-repo-scaffold.md` (check all task boxes; freeze)

- [ ] **Step 1: Write `CLAUDE.md`** (repo root; < 120 lines)

```markdown
# CapyCook — Project Instructions

Dish Development Workbench: a human-gated, versioned dish-design loop with a
deterministic/generative split and a pre-registered eval harness. Canonical
docs: `DESIGN.md` (what/why, v0.4) · `docs/SPEC.md` (the Go/React stack) ·
`docs/PREREGISTRATION.md` (frozen eval methodology).

## Session start
- Read `docs/milestones.md`, the active `milestone.md`, and its `handoff.md`.
- The active milestone is marked `← active` in `docs/milestones.md`.

## Commands
- `make build` — compile the server to `bin/capycook`.
- `make run` — run the server (serves `GET /healthz` → 200).
- `make test` — `go test ./...`.
- `make vet` / `make fmt` — `go vet` / `gofmt -w`.
- `make tidy` — `go mod tidy`.
- `make docker-build` — build the backend image (`capycook:dev`).

## Stack
- Go 1.26 backend, stdlib `net/http` (1.22+ pattern routing), `log/slog`.
- Module path: `github.com/ogngnaoh/capycook`.
- Persistence (S0.2+): SQLite via pure-Go `modernc.org/sqlite` behind a store interface.
- Model (milestone 01): DeepSeek-V4-Pro via OpenAI-compatible client, swappable `llm` iface.
- Observability (S0.2): OTel-Go → OTLP/HTTP → Langfuse. Eval is hand-rolled Go (SPEC §5).
- Frontend (v2): React + Vite in `web/` (placeholder for now).

## Repo structure
- `cmd/server` — HTTP entrypoint. `internal/*` — one package per P0 item (see SPEC §6/§3).
- `data/` — pinned FlavorGraph + USDA/FoodOn subset (vendored in S0.3).
- `eval/fixtures/` — versioned benchmark set (PREREGISTRATION §6; seeded S0.3).
- `docs/` — DESIGN, SPEC, PREREGISTRATION, milestones, per-milestone slices/handoff.

## Config / secrets
Env vars (see `.env.example`; `.env` is gitignored): `PORT`, `DEEPSEEK_API_KEY`,
`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`. Missing secrets warn
but are non-fatal — `make run` serves `/healthz` with none set.

## Gotchas
- **Go is Homebrew-installed** — ensure `/opt/homebrew/bin` is on PATH for `go`/`make`.
- **⚠ Verify-before-build:** before any DeepSeek integration (milestone 01), re-check
  the model id, `/beta` strict mode, `json_object` caveat, and pricing/context figures
  against live `api-docs.deepseek.com` (SPEC §4c).
- **PREREGISTRATION.md is frozen** — eval-methodology changes go through its §9
  amendment log, never a silent edit.
- Makefile recipes are tab-indented.
```

- [ ] **Step 2: Write `docs/00-scaffold/handoff.md`** (migrated + updated for post-S0.1)

```markdown
# Milestone 00 (scaffold) — Handoff

_Overwrite each session. Last updated: 2026-07-01._

## Load at session start
- `DESIGN.md` (v0.4), `docs/SPEC.md`, `docs/PREREGISTRATION.md` (frozen).
- `docs/00-scaffold/milestone.md` + this handoff.

## Completed this session
- **Slice S0.1 shipped** — compiling Go skeleton matching SPEC §6: `cmd/server`
  (`/healthz` + graceful shutdown), `internal/config` (env loader, TDD), eleven
  `internal/*` doc.go stubs, Makefile, Dockerfile skeleton, placeholder
  `web/`·`data/`·`eval/fixtures/`, project `CLAUDE.md`, and the milestone/slice
  doc structure. Design + plan under `docs/superpowers/`.

## Slice status across milestone
- S0.1 repo-scaffold → **shipped**
- S0.2 eval-harness-shell (store · eventlog · eval shell · telemetry) → planned
- S0.3 data-vendoring (FlavorGraph · USDA/FoodOn · fixtures) → planned

## Current state
- Branch `master`; `make build/run/test` green; `GET /healthz` → 200. No domain
  logic, no DeepSeek/Langfuse calls yet.

## Next session start here (literal first action)
1. **Slice S0.2** — implement `store` (modernc sqlite behind interface), the
   append-only `eventlog`, the `eval` shell (3-arm empty baseline + replay), and
   `telemetry` (OTel→OTLP→Langfuse). Exit: 3-arm harness runs an empty baseline;
   tracing emits one replayable event (DESIGN §15 v0 exit criterion).
2. **⚠ Before any DeepSeek code (milestone 01):** re-verify API specifics against
   live `api-docs.deepseek.com` (SPEC §4c).

## Active concerns
- PREREGISTRATION is frozen — amendments via its §9 log only.
- Second labeler still needed for Cohen's κ (PREREGISTRATION §6).
- Scope discipline: R1/R2 stay P1+; v0 = one deep loop + eval harness.
```

- [ ] **Step 3: Replace `docs/HANDOFF.md` with a pointer**

```markdown
# CapyCook — Handoff (moved)

Handoffs now live per-milestone. Start here:
- `docs/milestones.md` — milestone index (the `← active` one is current).
- `docs/00-scaffold/handoff.md` — the active milestone's handoff.
```

- [ ] **Step 4: Flip S0.1 status → shipped in `docs/00-scaffold/milestone.md`**

Change the Slices bullet:
```markdown
- `01-repo-scaffold.md` — compiling skeleton + docs + CLAUDE.md. **shipped**
```

- [ ] **Step 5: Freeze the slice doc** — in `docs/00-scaffold/01-repo-scaffold.md`, check every `- [ ]` box to `- [x]`. No other edits.

- [ ] **Step 6: Final verification pass**

Run: `make fmt && make vet && make test && make build`
Expected: fmt lists nothing to change, vet clean, all tests PASS, `bin/capycook` built.

- [ ] **Step 7: Commit (slice ship)**

```bash
git add CLAUDE.md docs/
git commit -m "docs: project CLAUDE.md + handoff; ship slice S0.1

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage** (design doc §1–8):
- §1 goal / §3 acceptance → Tasks 2,3 (build/run/test, /healthz) + Task 6 final verification.
- §2 real vs stub → `config`/`server` real (Tasks 2,3); eleven stubs (Task 4); placeholder dirs (Task 5).
- §4 toolchain/Makefile/module path → Task 2.
- §5 Dockerfile skeleton → Task 5.
- §6 docs & CLAUDE.md (milestones, milestone.md, slice doc, handoff, HANDOFF pointer) → Tasks 1, 6.
- §7 out-of-scope → enforced (no domain logic, no data, no web build).
- §8 testing (one config test) → Task 2; plus health handler test (Task 3).
All covered.

**Placeholder scan:** No TBD/TODO-as-work-deferral in steps. The Dockerfile `# TODO` comments are intended artifact content (the web stage), not plan placeholders. Every code step shows complete code.

**Type consistency:** `config.Config` fields (`Port, DeepSeekAPIKey, LangfusePublicKey, LangfuseSecretKey, LangfuseHost`) and `config.Load()` used identically in Task 2 (def) and Task 3 (`cfg := config.Load()`, `cfg.Port`). `newRouter() http.Handler` defined in Task 3 impl and consumed by Task 3 test. Consistent.
