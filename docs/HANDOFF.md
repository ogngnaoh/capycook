# CapyCook — Session Handoff

_Overwrite each session. Last updated: 2026-07-01._

## Load at session start
- `DESIGN.md` (canonical design, **v0.4**) — the PRD/design (stack-agnostic).
- `docs/SPEC.md` (**architecture spec** — the stack: Go/React, DeepSeek, Langfuse-augment) — the how.
- `docs/PREREGISTRATION.md` (**frozen** eval methodology) — hypotheses/arms/analysis plan.
- `docs/research/DESIGN-MEMO.md`, `07-pilot-interview.md`, `01–06`, `08` — background; reference by name.

## Completed this session
- **Froze `docs/PREREGISTRATION.md`** (committed `6465455`) — the pre-register half of the v0 phase.
- **Made the stack decision → `docs/SPEC.md`**, via 3 read-only research teammates (DeepSeek / Langfuse / Go-arch) + a lightweight Builder→Reviewer agent team (**Reviewer PASS**, all 6 acceptance criteria, no blocking defects; 4 non-blocking nits fixed). Locks: **Go backend + React/Vite**; **DeepSeek-V4-Pro** (OpenAI-compat via `go-openai`, swappable `llm` iface; structured Proposal = strict tool-calling primary / `json_object` buffer-validate fallback); **SQLite via `modernc`** (pure-Go) behind a store interface; version chain + append-only event log as the two durable surfaces; **eval = AUGMENT** (Langfuse OTel/OTLP tracing + prompt mgmt + judge-evals + dataset + single-pass annotation **vs.** hand-rolled Go event log + gate-dynamics + three rates + Cohen's κ — κ *forced* hand-rolled by Langfuse's multi-annotator gap); OTel→OTLP→Langfuse; stdlib `net/http`; hand-rolled `switch` state machine; pre-normalized in-proc cosine.
- Committed SPEC + this handoff together this session.

## Current state
- `DESIGN.md` v0.4; `PREREGISTRATION.md` frozen (`6465455`); `SPEC.md` committed this session. Still **discovery / scaffold phase — NO app code yet.** No `CLAUDE.md` (deferred to scaffold — real commands/structure then). No milestone/slice structure yet.

## Next session start here (literal first action)
1. **Scaffold the v0 harness skeleton** (v0 "Scaffold" half, DESIGN.md §15). Create the Go module + repo layout per SPEC §6; build the first packages: `store`, `eventlog`, `eval` (shell), `telemetry`, plus `/data` and `/eval/fixtures`. **v0 exit criterion:** the 3-arm harness runs an empty baseline; tracing emits one replayable event. This is the **first code** — set up a milestone/slice structure and a project `CLAUDE.md` (commands/stack) once there are real commands.
2. **⚠ Before any DeepSeek integration code:** re-verify the DeepSeek API specifics against live `api-docs.deepseek.com` per SPEC §4c (model id, `/beta` strict mode, `json_object` caveat, pricing/context/param figures).

## Active concerns
- **Pre-reg is FROZEN** — eval-methodology changes go through its §9 amendment log, never a silent edit.
- **Verify-before-build flags** live in SPEC §4c — honor them at build; the spec's DeepSeek-API knowledge predates the build.
- **Second labeler still needed** for κ (PREREGISTRATION §6 / DESIGN §9.4) — recruit before the labeling pass.
- **Scope discipline:** R1/R2 (multi-project workspace, per-project KB) stay P1+; v0 = one deep loop + eval harness.
- **Tooling gotcha:** spawn disk-writing async agents, not named mailbox teammates — the named `SpecBuilder` this session spun an idle-mailbox loop (reconfirms user memory `agent-team-disk-delivery`). Use `run_in_background` one-shots that write to disk.

## Candidate next builds
- v0 scaffold: `store` / `eventlog` / `eval`-shell / `telemetry` + `/data` + `/eval/fixtures` + project `CLAUDE.md`.
- Then v1 Pillar 1 loop: `orchestrator` / `proposal` / `draft` / `services` / `grounding` / `llm` / `transport`.
