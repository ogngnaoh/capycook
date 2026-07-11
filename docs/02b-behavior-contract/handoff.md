# Handoff — milestone 02b (behavior-contract)

## Next session start here
B2: build the oracle harness at `web/tools/oracle/`, per the spec's architecture
section (`docs/superpowers/specs/2026-07-11-behavior-contract-oracle-loop-design.md`).
Read `contract.md` first — it is RATIFIED and FROZEN (pin below); it is the whole
oracle. Harness shape: third sibling of `web/tools/demo.mjs`/`shots.mjs` (they
already own the stub-server lifecycle — spawn `bin/capycook` on :8098, fresh temp
DB, `CAPYCOOK_STUB_LLM=1`, per-scenario `CAPYCOOK_STUB_LATENCY_MS`, port-scoped
cleanup). Evaluate the 99 asserts in-process; capture screenshots/screencasts for
the 10 judges; emit `oracle-report.json` (id → pass/fail/parked + evidence path)
into `docs/02b-behavior-contract/evidence/run-NNN/` (gitignore all but the final
run). **Before trusting it: the falsifiability self-test** — known-good and
known-broken fixtures must prove the asserts can fail. Prove BC-H-4's budget
profile is reachable in stub mode (contract says it may not be skipped). Then B3:
one full census against the current UI → post PASS/FAIL to the user → B4 loop
starts (worktree branch `02b-behavior-contract`, builder subagents, 3-strike
stall valve, hard cap 12 iterations, progress persisted here every iteration).

## Current state
- **Contract RATIFIED 2026-07-11 as-is**, pinned at
  `965c8ebf5dd752c2a9d23bb2a796a7935fcff6d9` (recorded in milestone.md). 109
  criteria (99 assert / 10 judge), ~27 expected-fails marked, including both ⚖
  criteria kept in force: BC-C-26 (in-app safety disclaimer) and BC-D-12
  (persisted move rationale — schema/wire change allowed, frozen paths never).
  BC-J-3: `contract.md` at HEAD must stay byte-identical to the pin.
- B1 shipped (draft + 49-round fresh-context review loop → APPROVE). B2 active.
- Branch `measure-run`, clean. No servers running. H2 baseline: 6 operator
  events in `data/capycook.db` (must still be 6 at 02b exit).

## Open concerns
- Oracle must never touch `data/capycook.db` — fresh temp DBs only.
- The stub needs fixture extensions for several criteria (allergen + min-temp
  holds BC-C-15, low-confidence BC-C-25, unpriced ingredient BC-D-10,
  suggested_next BC-A-14, budget knob BC-H-4) — `internal/llm/stub.go` is NOT
  frozen; the 7 frozen paths (BC-J-1, diff vs `32afe54`) must stay untouched.
- B4 worktree isolates files only: docs/log/handoff updates must land on
  `measure-run`, not die in the worktree.
- Langfuse OTLP 401 remains out of scope (user checks keys/host).
