# Log — Milestone 01 (end-to-end build)

Append-only. Dated rationale entries: the *why* a diff can't show, dead ends, gotchas.

## 2026-07-06
- Build session opened on branch `e2e`. Toolchain verified: Go 1.26.4, Node 22.18,
  Docker 29.2.1 — container oracles are runnable locally.
- **Import-cycle resolution (contracts):** the plan pins `Op` in `internal/proposal`
  but `Draft.Apply` in `internal/draft` — a cycle as written. Locked: `Op` lives in
  `internal/draft`; `proposal` re-exports it as a type alias. Wire shape unchanged.
- Dockerfile's `COPY go.sum` line activated when `modernc.org/sqlite` landed (1.1).
- **Orchestrator semantics decided in-build (1.6):** verb-idempotency memoizes the
  prior GateResult for ANY duplicate verb on a resolved proposalId; redirect emits no
  separate `move_cancelled` (gate_redirect records the transition); re-spawned moves
  append no second `move_requested` (gate_* event is the kickoff record — keeps thread
  replay double-count-free); alternatives = accept-one-of-two, un-chosen card goes
  stale; auto-enqueue of deterministic recomputes is satisfied by the in-accept
  analysis recompute (no double events).
- **Transport (1.7):** `move_auto_advanced` deliberately maps to NO SSE event — the
  pinned protocol lists exactly five events; deterministic moves resolve before the
  202 returns and the client re-syncs via GET. Cancel has two windows: orchestrator
  cancel (proposing) + hub cancel (mid-replay) — the endpoint calls both (1.8).
- **e2e script (1.11) deviations, both forced by the tested state machine:** (a) the
  plan's step order accept-after-block is unexecutable (moves 409 while awaiting_gate;
  creation stores no version) — script accepts the seed proposal first, then drives
  the garlic-oil block, redirect-clears, accepts → versions length 2; every
  individual assertion preserved. (b) docker restart check strengthened from
  stop+start to rm+fresh-run on the same named volume — stop/start false-passes via
  the container writable layer (this red-then-green also motivated the Dockerfile
  /data fix).
- **Phase 1 oracle green:** all suites + `scripts/e2e_check.sh` local AND docker
  (evidence/phase1/e2e_{local,docker}.txt); browser-driven UI check of the full loop
  (seed → stream → proposal → accept → garlic-oil block → redirect recovery →
  versions panel) — interactive via Chrome + committed PNGs captured headless with
  puppeteer-core (scratchpad-only tooling, not a repo dependency).
