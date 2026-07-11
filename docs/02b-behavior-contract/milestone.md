# Milestone 02b — Behavior Contract + Autonomous Oracle Loop

**Goal** — Ratify a comprehensive, frozen UX behavior contract for the workbench, then run a fully autonomous build→judge loop against that contract until every criterion passes, so H2 operator sessions and the S8 publish happen on a workbench that survives live latency.

**Why now** — The first live-latency operator session (2026-07-11) surfaced UX gaps
nobody hit in stub-instant demos: silent empty-intent no-op, no auto first pass,
rationale replayed only after generation completes, and a focus-on-Stop Enter trap.
Rather than patch one-by-one, apply the project's preregistration ethos to UX:
the check (the contract) is ratified before the work begins.

**Scope**
- A comprehensive product behavior contract (`contract.md`): all user-facing behavior —
  every move type, branching/promote, autonomy dial, technical view, themes,
  error/edge states, stub AND live-latency parity. Criteria carry stable
  `BC-<area>-<n>` IDs, tagged `assert` (deterministic puppeteer) or `judge`
  (fresh-context agent over captured evidence), each with a check recipe.
- A hybrid headless oracle harness (`web/tools/oracle/`) in the demo.mjs mold:
  fresh temp DB + stub (`CAPYCOOK_STUB_LLM=1`) + `CAPYCOOK_STUB_LATENCY_MS` per
  scenario; zero API spend; emits `oracle-report.json` + evidence dir.
- An autonomous fix→judge loop over the full stack (web/ + Go) on worktree branch
  `02b-behavior-contract`, human gates only at contract ratification, stall points,
  and final approval.

**Non-goals**
- Any edit to the 7 instrument paths frozen at `32afe54` (instrument touch = abort).
- Any edit to `PREREGISTRATION.md` (user-paste-only, §9 amendment log).
- Langfuse OTLP 401 investigation (out of scope; user checks keys/host).
- New product features beyond what the contract demands (03-depth items stay in 03).
- Real-DeepSeek spend in the oracle (stub-only; live-mode parity uses injected latency).

**Slices** (plan of record: `docs/superpowers/specs/2026-07-11-behavior-contract-oracle-loop-design.md`)
- B1 — milestone docs + spec + contract draft → **USER ratification gate** — shipped (2026-07-11: draft hardened by a 49-round fresh-context UX/a11y review loop, verdict APPROVE; USER ratified as-is same day, both ⚖ criteria in force)
- B2 — oracle harness + falsifiability self-test — shipped (2026-07-11: ~44 scenarios/12 files via 10-builder fan-out + 10 fresh-context critics [3 CRITICALs fixed] + 27/27 self-test incl. 10 mutation flips; stub fixtures + stub-mode budget metering; plan+record `b2-oracle-plan.md`)
- B3 — census run against current UI (informative, non-blocking) — shipped (2026-07-11: run-073, 79 pass / 43 fail / 1 parked over 123 rows; every fail explained — 27 marked + 10 unmarked genuine defects + explained derivatives; guardrails all green; posted to USER)
- B4 — autonomous fix→judge loop to all-green ×2 or stall report — active
- B5 — exit: USER approval gate, GIF re-check, merge → `measure-run`, ship ritual — pending

**Integration notes**
- **Contract pin (RATIFIED 2026-07-11, as-is):**
  `965c8ebf5dd752c2a9d23bb2a796a7935fcff6d9` — `contract.md` at HEAD must stay
  byte-identical to that commit's version (BC-J-3, verified every iteration).
  109 criteria (99 assert / 10 judge). Both ⚖-flagged criteria were ratified in
  force: BC-C-26 (in-app safety disclaimer) and BC-D-12 (persisted move
  rationale — schema/wire change is in-scope loop work). The loop never edits
  the contract; changes go through a user ruling in `log.md` (stall-valve path).
- Freeze guard, every iteration: `git diff 32afe54..HEAD -- internal/llm/prompts
  eval/fixtures/seeds.json internal/eval/runner.go data/safety
  eval/fixtures/move_script.json internal/llm/evidence.go internal/eval/mapping.go`
  must be empty.
- H2 cleanliness: oracle scenarios use fresh temp DBs only; `data/capycook.db`
  operator event count is recorded before 02b and re-verified at exit.
  **Baseline (2026-07-11, before any 02b code):** 1313 events total —
  `run_kind=operator` 6, `run_kind=harness` 1307; 87 dishes; 395 versions.
  At 02b exit the operator count must still be exactly 6 (unless the user ran
  more H2 sessions themselves, which they log).
- Stall valve: 3 failed fix→judge cycles on one criterion (or a criteria conflict)
  parks it; loop finishes what it can, then stops with an evidence report + proposed
  ruling. Hard cap: 12 build iterations → checkpoint report regardless.

**Exit criteria**
- Ratified contract pinned; pin hash recorded here; contract byte-unchanged since.
- Final `oracle-report.json` all-green across 2 consecutive full runs (asserts +
  fresh-context judges), evidence dir preserved for the final run.
- Freeze diff vs `32afe54` empty; `make test`, `make vet`, `cd web && npx vitest run`
  green; PREREGISTRATION.md byte-untouched.
- README GIFs whose scenes changed re-captured (≤15s, 800px, 15fps, <5MB each);
  09-eval-run untouched.
- USER approval of census-to-green evidence + diff → merge `02b-behavior-contract`
  → `measure-run` (unpushed; D7 holds).
