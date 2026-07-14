# S0.4 — Walking skeleton (graybox workbench · serve · Docker)

_Shipped 2026-07-01. Frozen — see `handoff.md` for status._

**Goal.** Prove the thinnest end-to-end frontend pipeline — React/Vite UI → HTTP → Go binary → served → containerized — so every later user-visible slice has a real seam to plug into, and the deploy path is de-risked in v0 instead of v2.

**Plan (as built).**
- `web/` — Vite + React + TS + Tailwind SPA; a graybox two-pane workbench (`DraftPane` + `SteeringPane`), the `ProposalCard` + `GateBar` signature components, and the four gate states (proposing · blocked · awaiting · accepted). Renders a hardcoded stub `Proposal`; Vitest + Testing Library coverage.
- `web/embed.go` + `web/serve.go` — Go package `web` embeds `web/dist` (`//go:embed all:dist`) and serves it with SPA fallback.
- `cmd/server` — stub `GET /api/proposal` + `POST /api/gate`, wired into `newRouter()` beside `/healthz`; the embedded SPA is the `/` catch-all.
- `Dockerfile` — multi-stage: Vite build → Go build embedding the SPA → distroless nonroot runtime. `make web` / `make build-all` targets.
- Design spec: `docs/superpowers/specs/2026-07-01-frontend-ui-strategy-design.md`. Plan: `docs/superpowers/plans/2026-07-01-frontend-ui-strategy.md`.

**Tasks.**
- [x] Doc integration — DESIGN §15 amendment, CLAUDE.md, handoff
- [x] Scaffold Vite+React+TS+Tailwind+Vitest toolchain
- [x] `ProposalCard` + `GateBar` (TDD)
- [x] Two-pane `Workbench`, four gate states, API data layer (TDD)
- [x] Go embed + SPA-fallback handler (TDD)
- [x] Stub `/api/proposal` + `/api/gate`, wired router (TDD)
- [x] Multi-stage Docker + Makefile web targets; local + container serve verified

**Notes / deferred.**
- **Persistence leg (Phase C) deferred to S0.2.** Accept → append an event via `internal/eventlog` is not built — it depends on the S0.2 `eventlog`/`store` interfaces. The seam is staged: `handleGate` in `cmd/server/api.go` carries the marker comment. Fold into the S0.2 plan.
- **No seed-setup screen.** The skeleton opens directly on the workbench with a stub proposal; the seed/constraints screen lands with milestone 01.
- Graybox only — no final color/type; visual language is applied per-slice from milestone 01.
