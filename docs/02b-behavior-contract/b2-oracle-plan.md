# B2 — Oracle harness + falsifiability self-test (working doc)

Slice plan and record, per conventions. Approved 2026-07-11. The contract
(`contract.md`, pinned `965c8eb`) is the spec of WHAT the oracle checks; this doc
covers HOW the harness is built. The oracle is B4's ground truth — a vacuous
assert poisons the loop, so falsifiability is a deliverable, not a nicety.

## Checklist

1. [x] Slice working doc materialized (this file)
2. [ ] Stage 0 spine: registry (109 ids) + lib + CLI; `list` verified, parity
       derivation = contract snapshot (14 ids)
3. [ ] Stage 1 area A pattern-setter; `--area A` run vs real app (A-3/A-4/A-9/
       A-12/A-13/A-5 must FAIL — first falsifiability signal)
4. [ ] Stage 2 Go: budget metering + 4 stub fixtures + tests (review-flagged)
5. [ ] `.gitignore`: `docs/02b-behavior-contract/evidence/` entry
6. [ ] Stage 3 fan-out: areas B–I built + self-verified (dedicated ports 8110+)
7. [ ] Stage 4 fresh-context critic pass clean (findings fixed or logged)
8. [ ] Stage 5 self-test exit 0 (artifact committed)
9. [ ] BC-H-4 budget profile demonstrated reachable (move-failed banner)
10. [ ] Guardrails green: freeze diff empty, suites pass, pin intact, operator DB = 6
11. [ ] B3 census: full run + judge merge → report posted to user
12. [ ] Ship ritual: milestone.md, handoff.md rewrite, log.md — same commit

## Decisions (user, 2026-07-11)

- B2 + B3 land directly on `measure-run`; B4 branches off later.
- Stub/server fixture extensions happen in B2 (BC-C-15, BC-C-25, BC-D-10, BC-H-4).
- Execution: structured subagent fan-out + critic pass; lead owns lib/registry.
- Verified pre-flight: BC-H-4 unreachable in stub mode (`cmd/server/main.go:110-114`
  wires `llm.Stub` with no `UsageMeter`) — fixed in Stage 2.

## Stub fixture interface (Stage 2 ↔ scenario builders)

Steer-keyword branches in `internal/llm/stub.go`, mirroring the existing
`"garlic oil"` branch (case-insensitive contains on `req.Steer`, any LLM move type):

| Steer contains | Stub emits | Drives |
|---|---|---|
| `peanut` | op adding ingredient "peanut butter" (Big-9: peanuts) | BC-C-15 allergen hold (seed declares peanuts) |
| `rare chicken` | op adding a chicken step with `internal_temp_c` 55 (< 74 min) | BC-C-15 min-temp hold |
| `moonshot` | creative proposal with `Confidence: 0.15` | BC-C-25 low-confidence gate parity |
| `saffron` | op adding an ingredient absent from the pricing table (builder verifies which; saffron is the candidate) | BC-D-10 unpriced listing after "Recompute cost" |

Budget (BC-H-4): stub branch opens `OpenUsageMeter(cfg.DBPath+".budget.json",
cfg.LLMBudgetUSD)`; new `internal/llm/metered.go` wrapper runs `meter.PreCheck()`
before `GenerateMove`; stub `llmStatus` gains `BudgetSpentUSD`. Budget profile =
`LLM_BUDGET_USD=0` → first call refused pre-call → move-failed banner (never a
hold). Frozen paths untouched; `make test`/`make vet` green; oracle temp-DB
cleanup also removes `<db>.budget.json` sidecars.

## Harness architecture (summary; contract is per-criterion source of truth)

- `web/tools/oracle/oracle.mjs` — CLI: `run | self-test | merge-judgments | list`.
  Flags: `--area --only --profile --port --report-dir --guardrails fast|all|off
  --headful --keep-tmp`. Exit codes: 0 all-pass · 1 fails · 2 harness error ·
  3 guardrail abort (immediate, pre-scenario) · 4 self-test failure.
- `registry.mjs` — completeness spine: all 109 ids ×
  `{tag, area, scenarios, profiles, failsToday, generationSeam}`. BC-I-1 parity
  set derived from the rule at runtime; drift vs the contract's 14-id snapshot is
  flagged for human review (rule wins).
- `lib/` — adapted from demo.mjs/shots.mjs (those two are NOT refactored):
  server (temp-DB-under-tmpdir hard guard, healthz, SIGTERM→SIGKILL, SIGKILL
  variant for SSE drops, port-scoped cleanup, refuse :8099), browser (one Chrome,
  per-scenario incognito contexts, localStorage pinned pre-boot, dialog trap =
  auto-fail evidence), page (contract-appendix selectors), api (HTTP pre-seed),
  net (passive NetLog mark/count; separate opt-in faultInjector), record (CDP
  screencast — blocking screenshots deadlock mid-wait), instrument (in-page
  observers, renderer `performance.now()` stamps), contrast (pure WCAG math,
  node-probed AND page-injected), check, evidence, report, guardrails.
- `scenarios/` — 12 files by area, ~40 scenarios; one server + one page each;
  criteria evaluated via `ctx.check('BC-x-y', t => ...)`; check.mjs errors on
  undeclared/unevaluated criteria. Sub-check aggregation for criteria spanning
  profiles (BC-A-3, A-5, A-13): verdict = AND across scenarios.
- Profiles: fast · live-sim (25000ms) · budget (`LLM_BUDGET_USD=0`) · live-nokey
  (BC-H-6 half: stub flag unset, dummy key, no move submitted). Viewports are
  separate scenarios, never mid-scenario resizes.
- Key mechanisms: `setupFast` (pre-seed at latency 0, restart with latency on the
  same temp DB; POST counts from per-page NetLog only) · event-conditioned traps
  (BC-B-4 at real `focusDecision` moments; BC-C-20 via pre-armed in-page observer
  at first proposal-ready mount) · sweeps as data (real Tab keypresses —
  `.focus()` skips `:focus-visible`; one table per screen×theme×viewport shared
  by G-9/G-11/G-14) · renderer-side clocks for all fixed thresholds · per-check
  deadlines (30s/90s), `journeyCritical` failures mark downstream `fail/blocked`
  (explicit rows, no silent skips — BC-J-7) · `domcontentloaded` + element waits
  (`networkidle0` unusable: persistent EventSource) · SIGKILL for SSE-drop
  scenarios (SIGTERM drains gracefully; banner never fires).
- Report: per-id rows (status pass/fail/parked/pending-judgment, failureKind,
  subChecks with observed/expected, evidence, timing); parity twins `<id>@live-sim`
  (~123 rows); contract-pin verification embedded; `attempts`/`parked` are
  B4-owned inputs. BC-J-6 = explicit `parked` ("B5-only by design") row.
- Judges (10): fresh-context subagents, stills + verbatim contract text only;
  ≤20 sampled frames for screencast criteria (raw webm kept for B5);
  `judge-manifest.json` self-contained; `merge-judgments` flips rows.
- Wall-clock: full run ≈ 30–40 min (~45–55 × 25s windows; I-1 parity dominates).
  Mitigations: many criteria per window, Stop-early, `setupFast`, one Chrome,
  filters for B4's inner loop.

## Falsifiability self-test (three layers → `selftest-report.json`)

1. Known-broken leverage: the ~27 [FAILS TODAY] criteria must FAIL vs the current
   UI; an unexpected PASS demands a mutation probe (markers informative).
2. Mutation probes (`selftest/mutations.mjs`): sabotage just before the target
   check must flip it to FAIL (strip role="alert", zero focus outlines, inject
   low-contrast style, double-fire a POST, shrink a control, doctored pin hash).
3. Plumbing: deadline-timeout records fail (never hangs); dropped registry id →
   BC-J-7 validator refuses report; evidence files exist; parity derivation checked.

Self-test passes ⇔ every mutation flipped + every evaluator class has ≥1
demonstrated failure + plumbing green. B4 refuses runs without an `ok: true`
artifact for the current harness commit.

## Verification

- The deciding check (the contract) predates this work and is byte-pinned.
- Harness proven by the self-test + census, reviewed by the user with the B3
  report. Unit tests added in Stage 2 are review-flagged, not self-verifying.
- Every run: freeze diff vs `32afe54` empty; pin intact; PREREGISTRATION.md
  untouched; `data/capycook.db` operator events exactly 6; `make test`,
  `make vet`, `cd web && npx tsc -b && npx vitest run` green.
