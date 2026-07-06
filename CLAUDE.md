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
- Persistence (end-to-end build, phase 1): SQLite via pure-Go `modernc.org/sqlite` behind a store interface; `DB_PATH` env.
- Model (end-to-end build, phase 3 — the first real-DeepSeek phase): DeepSeek-V4-Pro via OpenAI-compatible client, swappable `llm` iface; stub mode w/ banner when no key.
- Observability (end-to-end build, phase 3): OTel-Go → OTLP/HTTP → Langfuse (Cloud; self-host compose ships in repo). Eval is hand-rolled Go (SPEC §5).
- Frontend: React + Vite + Tailwind in `web/`; graybox workbench (S0.4), styled in end-to-end build phase 5 — Acne structural system + Anthropic warm palette (see the 2026-07-06 end-to-end spec §8; process background in docs/superpowers/specs/2026-07-01-frontend-ui-strategy-design.md).

## Repo structure
- `cmd/server` — HTTP entrypoint. `internal/*` — one package per P0 item (see SPEC §6/§3).
- `data/` — pinned FlavorGraph + USDA/FoodOn subset (vendored in end-to-end build phase 2).
- `eval/fixtures/` — versioned benchmark set (PREREGISTRATION §6; seeds drafted phase 4, committed only after user ratification; synthetic test fixtures live in `internal/eval/testdata`, never here).
- `docs/` — DESIGN, SPEC, PREREGISTRATION, milestones, per-milestone slices/handoff.

## Config / secrets
Env vars (see `.env.example`; `.env` is gitignored): `PORT`, `DEEPSEEK_API_KEY`,
`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`. Missing secrets warn
but are non-fatal — `make run` serves `/healthz` with none set.

## Gotchas
- **Go is Homebrew-installed** — ensure `/opt/homebrew/bin` is on PATH for `go`/`make`.
- **⚠ Verify-before-build:** before the first real-DeepSeek phase (end-to-end build
  phase 3), re-check the model id, `/beta` strict mode, `json_object` caveat, and
  pricing/context figures against live `api-docs.deepseek.com` (SPEC §4c). Cosmetic
  drift: proceed + patch SPEC + log. Structural drift: stop at Gate B.
- **PREREGISTRATION.md is frozen** — eval-methodology changes go through its §9
  amendment log, never a silent edit.
- Makefile recipes are tab-indented.
