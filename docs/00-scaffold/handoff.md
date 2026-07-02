# Milestone 00 (scaffold) — Handoff

_Overwrite each session. Last updated: 2026-07-01._

## Load at session start
- `DESIGN.md` (v0.4), `docs/SPEC.md`, `docs/PREREGISTRATION.md` (frozen).
- `docs/00-scaffold/milestone.md` + this handoff.

## Completed this session
- **Slice S0.4 shipped** — walking skeleton: graybox two-pane workbench (React+Vite+TS+
  Tailwind, `web/`), the `ProposalCard`/`GateBar` signature components + four gate states,
  Go `web` package embedding the SPA (`//go:embed`) with SPA fallback, stub
  `GET /api/proposal` + `POST /api/gate` in `cmd/server`, and a multi-stage Dockerfile
  (Vite → Go embed → distroless nonroot). Serve verified locally **and** in-container
  (`/healthz`, `/api/proposal`, `/`). Design+plan under `docs/superpowers/`. Built on
  branch `s0.4-walking-skeleton`. Also: removed superseded `docs/DESIGN-v0.3.md` +
  `docs/HANDOFF.md`; pushed repo to `github.com/ogngnaoh/capycook`.

## Slice status across milestone
- S0.1 repo-scaffold → **shipped**
- S0.2 eval-harness-shell (store · eventlog · eval shell · telemetry) → planned
- S0.3 data-vendoring (FlavorGraph · USDA/FoodOn · fixtures) → planned
- S0.4 walking-skeleton (graybox workbench · serve · Docker) → **shipped**

## Current state
- `make build/run/test` green; `go vet` clean; 8 web tests pass. `/healthz` → 200 and the
  graybox workbench serves from the Go binary (native + container). `make web` builds the
  SPA; `make build-all` does both. Still no domain logic, no DeepSeek/Langfuse calls.

## Next session start here (literal first action)
1. **Slice S0.2** — implement `store` (modernc sqlite behind interface), append-only
   `eventlog`, the `eval` shell (3-arm empty baseline + replay), and `telemetry`
   (OTel→OTLP→Langfuse). Exit: 3-arm harness runs an empty baseline; tracing emits one
   replayable event (DESIGN §15 v0 exit).
2. **Fold in S0.4 Phase C** — once `eventlog` exists, make `POST /api/gate` (accept) append
   a gate event; the seam is staged at the marker comment in `cmd/server/api.go`.
3. **⚠ Before any DeepSeek code (milestone 01):** re-verify API specifics against live
   `api-docs.deepseek.com` (SPEC §4c).

## Active concerns
- PREREGISTRATION is frozen — amendments via its §9 log only.
- Second labeler still needed for Cohen's κ (PREREGISTRATION §6).
- Scope discipline: R1/R2 stay P1+; v0 = one deep loop + eval harness.
- Frontend is graybox only; the visual design language is applied per-slice from milestone 01.

---
_Log:_ Slice S0.4 shipped 2026-07-01 (`8ad278d`…`a8e666b`).
