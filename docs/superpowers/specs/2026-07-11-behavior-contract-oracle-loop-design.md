# Behavior Contract + Autonomous Oracle Loop (Milestone 02b) — Design

**Date:** 2026-07-11 · **Status:** ratified in principle 2026-07-11 (session plan → this spec); contract itself pends its own USER ratification gate
**Inserts:** milestone 02b before S8 publish (02a pattern). H2 operator sessions and S8 resume after 02b ships.

## Goal

Apply the project's preregistration ethos to UX: ratify a comprehensive, frozen
behavior contract for the workbench first, then run a fully autonomous build→judge
loop against that contract until every criterion passes — human gates only at
contract ratification, stall points, and final approval.

## Why

The first live-latency operator session (2026-07-11) surfaced four root-caused UX
gaps invisible in stub-instant demos:

1. **Silent empty-intent no-op** — `web/src/components/IntentBar.tsx:32` returns
   without feedback when "Try it" fires on empty intent.
2. **No auto first pass** — after dish creation nothing proposes; the user must
   guess that intent-then-Try-it is the move.
3. **Opaque 15–40s wait** — rationale/reasoning replays only after generation
   completes (`internal/transport/hub.go`); during live generation the UI shows no
   alive-signal beyond a spinner.
4. **Focus-on-Stop Enter trap** — `Workbench.tsx` `focusDecision` moves focus to
   Stop during proposing; a stray Enter cancels the move silently.

Verified the same day on an isolated stub+latency server: no auto-cancel bug
exists — the loop works when the wait is survivable. That survivability is what
the contract enforces.

## Decisions (locked with the user 2026-07-11)

| # | Decision | Choice |
|---|---|---|
| C1 | Scope | **Comprehensive product contract** — all user-facing behavior: every move type, branching/promote, autonomy dial, technical view, themes, error/edge states, stub AND live-latency parity |
| C2 | Sequencing | **Milestone 02b, inserted before publish** (02a pattern); H2 + S8 happen after 02b on the improved workbench |
| C3 | Oracle | **Hybrid headless** — deterministic puppeteer assertions where mechanically checkable; fresh-context agent judges over captured screenshots/screencasts for experiential criteria. Fully unattended, zero API spend (stub + `CAPYCOOK_STUB_LATENCY_MS`) |
| C4 | Change surface | **Full stack minus frozen** — web/ + Go (real token streaming allowed if a criterion demands it), EXCEPT the 7 instrument paths frozen at `32afe54`; freeze diff re-verified every iteration; instrument touch = abort. `PREREGISTRATION.md` stays user-paste-only |
| C5 | Stall valve | **Pause + report** — 3 failed fix→judge cycles on one criterion (or a criteria conflict) parks it; loop finishes what it can, stops with an evidence report + proposed ruling; user rules; loop resumes |

## Architecture

### The contract (`docs/02b-behavior-contract/contract.md`)

- Stable IDs `BC-<area>-<n>`; one observable statement per criterion; tag `assert`
  (deterministic) or `judge` (agent-evaluated); each with a check recipe naming the
  scenario, the observation, and the pass condition.
- Areas: **A** intake & first pass · **B** proposing state (progress-feedback tiers:
  something within 1s, alive-signal throughout; streaming reasoning; cancel explicit,
  never focus-stolen, always confirmed by visible state change) · **C** gate &
  decisions (verbs legible, keyboard map safe, safety-hold recovery, edit/take-over
  validation) · **D** versions & timeline (trial record, branch/promote, resume,
  deep-link reload, restart survival) · **E** post-cook loop · **F** autonomy dial
  (auto-apply visible + attributable) · **G** modes (technical view, themes, reduced
  motion, narrow viewport) · **H** errors & resilience (server down, SSE
  drop/reconnect, budget exhausted, 4xx surfaced, stub banner honesty) · **I**
  live-mode parity (every A–H criterion involving generation re-checked under
  20–30s injected latency) · **J** guardrails (freeze diff empty, existing suites
  green, README GIFs still accurate or re-captured, no dead criteria).
- **Ratification gate:** the user reviews/edits/ratifies. The ratified contract is
  committed and its hash pinned in `milestone.md`. The loop may never edit it; the
  oracle verifies the pin every iteration.

### The oracle harness (`web/tools/oracle/`)

Third sibling of `web/tools/demo.mjs` + `shots.mjs` (puppeteer-core headless-Chrome
rigs that already own the stub server lifecycle: spawn `bin/capycook` on :8098,
fresh temp DB, `CAPYCOOK_STUB_LLM=1`, optional `CAPYCOOK_STUB_LATENCY_MS`,
port-scoped cleanup, CDP screencast without deadlocks).

- **Scenario runner:** one server per scenario (fresh temp DB; latency knob per
  scenario), drives the journey, evaluates `assert` criteria in-process, captures
  screenshots/short screencasts as evidence for `judge` criteria.
- **Report:** `oracle-report.json` (criterion id → pass/fail/evidence path) +
  evidence dir `docs/02b-behavior-contract/evidence/run-NNN/` (gitignored except
  the final run).
- **Judge pass:** fresh-context subagents — no builder reasoning in their context;
  they see the contract text and the evidence, nothing else. PASS/FAIL + one-line
  reason per criterion, merged into the report.
- **Falsifiability self-test:** known-good and known-broken fixtures prove the
  asserts can actually fail before the loop trusts the harness.

### The loop (worktree branch `02b-behavior-contract` off `measure-run`)

Per iteration:
1. **Builder** (subagent, isolated worktree) fixes the highest-value failing
   cluster. Full stack allowed except frozen paths.
2. **Guardrails:** `git diff 32afe54..HEAD -- internal/llm/prompts
   eval/fixtures/seeds.json internal/eval/runner.go data/safety
   eval/fixtures/move_script.json internal/llm/evidence.go internal/eval/mapping.go`
   empty; `make test`, `make vet`, `cd web && npx vitest run` green; contract pin
   intact.
3. **Oracle re-runs** (asserts + fresh judges). Per-criterion attempt counter
   increments on a fix→judge failure; at 3, park it (C5).
4. **Done** when all unparked criteria pass 2 consecutive full runs. Parked
   criteria ⇒ stop, write the stall report (evidence, attempts, proposed contract
   amendment or design ruling), hand to user; resume after ruling.
5. **Persistence:** progress written to `docs/02b-behavior-contract/log.md` +
   `handoff.md` every iteration — any future session resumes from disk.

Safety: hard cap **12 build iterations** → checkpoint report to the user regardless
of state.

### Sequence

1. **B1** — docs + this spec + contract draft → **USER ratification gate**.
2. **B2** — oracle harness + falsifiability self-test.
3. **B3** — census run against the current UI (informative, non-blocking): post the
   PASS/FAIL census to the user; loop starts immediately (user can interrupt).
4. **B4** — autonomous loop to all-green ×2 or stall report.
5. **B5** — USER approval of census-to-green evidence + diff → re-capture any README
   GIFs whose scenes changed (≤15s, 800px, 15fps, <5MB; 09-eval-run untouched) →
   merge → `measure-run` (unpushed, D7 holds) → ship ritual (02b shipped in
   milestones.md; 02 handoff updated: S8 unblocked, H2 next).

## Guardrails (bind every step)

- 7 instrument paths frozen at `32afe54`; any touch = abort + user gate.
- `PREREGISTRATION.md` user-paste-only; methodology changes only via §9.
- Oracle uses fresh temp DBs only — `data/capycook.db` H2 operator events stay
  exactly the user's own (event count recorded before B2, re-verified at 02b exit).
- Zero API spend: stub mode + injected latency everywhere, including live-mode
  parity (area I).
- Contract frozen post-ratification; changes require a user ruling recorded in
  `log.md` (stall-valve path), mirroring the §9 amendment ethos.

## Verification

- The contract IS the check, ratified before the builder starts (the check predates
  the work).
- Harness proven falsifiable via known-broken fixture before the loop trusts it.
- Every iteration: freeze diff empty, pre-existing suites green, contract pin
  unchanged.
- Exit evidence: final `oracle-report.json` all-green ×2 + evidence dir, reviewed by
  the user at the approval gate.

## Out of scope

- Langfuse OTLP export 401 (started 2026-07-11; campaign traces worked 2026-07-10)
  — likely key/host, only the user can check.
- New features beyond contract demands (milestone 03 keeps its scope).
