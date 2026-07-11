# B2 — Oracle harness + falsifiability self-test (working doc)

Slice plan and record, per conventions. Approved 2026-07-11. The contract
(`contract.md`, pinned `965c8eb`) is the spec of WHAT the oracle checks; this doc
covers HOW the harness is built. The oracle is B4's ground truth — a vacuous
assert poisons the loop, so falsifiability is a deliverable, not a nicety.

## Checklist

1. [x] Slice working doc materialized (this file)
2. [x] Stage 0 spine: registry (109 ids) + lib + CLI; `list` verified, parity
       derivation = contract snapshot (14 ids)
3. [x] Stage 1 area A pattern-setter; verified vs real app (the 6 marked
       criteria fail as predicted — first falsifiability signal)
4. [x] Stage 2 Go: budget metering + 4 stub fixtures + tests (review-flagged)
5. [x] `.gitignore`: `docs/02b-behavior-contract/evidence/` entry
6. [x] Stage 3 fan-out: areas B–I built + self-verified (2× stable runs each;
       6 genuine unmarked defects logged under Pre-census findings)
7. [ ] Stage 4 fresh-context critic pass clean (findings fixed or logged) — 10
       critics running
8. [ ] Stage 5 self-test exit 0 (artifact committed)
9. [ ] BC-H-4 budget profile demonstrated reachable (move-failed banner)
10. [ ] Guardrails green: freeze diff empty, suites pass, pin intact, operator DB = 6
11. [ ] B3 census: full run + judge merge → report posted to user
12. [ ] Ship ritual: milestone.md, handoff.md rewrite, log.md — same commit

## Pre-census findings (unexpected fails, investigated during B2 build)

- **BC-A-14 fails today (unmarked):** "Try next —" chips never render under
  instant generation. `setSuggestedNext` lives only in the SSE proposal-ready
  handler gated on `expectedMove.current` (`Workbench.tsx:151`); in fast mode
  the event can arrive before the POST response assigns the expected move id,
  and the resync/GET recovery path never populates suggestions. Reproduced
  deterministically in oracle runs 001/002; all other area-A fails match the
  contract's FAILS-TODAY markers exactly.

- **BC-G-14 fails today (unmarked):** focused skip links paint BEHIND the
  sticky header at 390/320 — `.skip-link` z-index 50 (`index.css:56`) vs the
  header's z-sticky 100 (`Workbench.tsx:445`). WCAG 2.4.11.
- **BC-G-12 fails today (unmarked):** at 320px the IntentBar "Try it →"
  button is clipped 49px off-screen (`#cc-intent` flex-1 won't shrink,
  `IntentBar.tsx:80`); invisible to doc-scrollWidth checks — caught by a
  per-control clip sweep. WCAG 1.4.10.

- **BC-B-5 fails today (unmarked, focus clause only):** after Stop→cancel,
  `document.activeElement === body` — `cancelMove()` (`Workbench.tsx:320-330`)
  never calls `focusDecision()`, unlike `runGate` (`:287`); the Stop control
  unmounts and focus drops. Same defect class as BC-A-5's marked clause.
  (Also noted: BC-B-4's trap 2 — alternatives — does NOT trip today; traps
  1/3/4 do.)

- **BC-C-17 fails today (unmarked, back-to-current clause):** "Back to
  current" drops focus to `document.body` — `Workbench.tsx:535`
  `setSnapshot(null)` restores no focus (the accept/tweak clauses pass).
  Same line as BC-D-2's missing return announcement; one fix serves both.
- **Stub-fixture gap (loop work, not a product defect):** no stub template
  emits a `remove` op or in-place step `replace`, so BC-C-16's removed-row /
  changed-step markup is UNDRIVABLE until the loop extends the stub
  repertoire (those render paths are unit-tested; the oracle asserts the
  drivable clauses and documents the gap).

- **BC-G-13 fails today (unmarked):** `--color-border-strong` (#CEC6B7 light /
  #443C2E dark) measures ~1.7:1 / ~1.56:1 as a component boundary — dial-OFF
  track/thumb (`DialToggle.tsx:13,17`) and the invalid seed-field border
  (`SeedSetup.tsx:49`, aria-invalid adds no recolor) sit below WCAG 1.4.11's
  3:1. Dial-ON (accent) and the hold border (critical) pass. G-10's expected
  fail is quantified: 98 text pairs below AA, both themes.
- **Lib wart (workaround in place):** `browser.mjs` re-seeds `capycook-theme`
  on every navigation, so cross-reload persistence checks (BC-G-2) verify as
  write + boot-read halves rather than one journey.

- **BC-C-16 fails today (unmarked, changed-STEP clause):** `StepRow`
  (`DishCard.tsx:250`) has no changed branch — no struck old value, no
  sr-only was/now; a changed step renders as a faint tint only (mergeDiff
  produces `row.old`, StepRow ignores it; no unit test covers it). Related:
  the sr-only "now:" label is absent even on changed ingredient rows.
  Surfaced by the critic-demanded `spring clean` fixture — the clause was
  previously undrivable and would have censused as PASS.
- **BC-G-14 second offender (unmarked):** the CookFlow "I cooked this →"
  trigger is obscured under the sticky header at the 390px idle stage — the
  `order:-1` reflow (`index.css:74`) makes DOM order ≠ visual order and there
  is no scroll-padding-top, so tabbing scrolls it under the z-100 header.
  Distinct root cause from the skip-link z-index defect.

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
