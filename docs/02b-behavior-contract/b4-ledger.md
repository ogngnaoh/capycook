# B4 loop ledger — attempts, clusters, iteration records

Working ledger for the B4 autonomous fix→judge loop. The LEAD (session) owns this
file; it is rewritten/extended every iteration and committed on
`02b-behavior-contract`. Baseline census: run-073 (79 pass / 43 fail / 1 parked).

**Rules in force**
- One Workflow invocation = 1–N clusters, each: builder → guardrail gate →
  cumulative-`--only` oracle run → fresh-context judge fan-out. Batch starts at 1
  cluster, grows to 2–3 once the loop proves out.
- Cumulative `--only` set = current batch's criteria + every criterion previously
  flipped green in B4 (regression net). Full runs only for the ×2 all-green exit.
- 3 failed fix→judge cycles on a criterion → parked (stall valve). Hard cap **12
  builder runs** → checkpoint report to USER regardless.
- Runs refuse to start unless `evidence/selftest-report.json` is ok:true **at the
  current harness commit**; any harness edit requires a self-test re-run first and
  an entry in the check-change log below.
- Frozen: 7 instrument paths @ `32afe54`, `PREREGISTRATION.md`, `contract.md`
  (pin `965c8eb`). Instrument touch = abort.

## Cluster map

Order = planned execution order; lead re-adjudicates between invocations.
Root causes reference run-073 + `b2-oracle-plan.md` "Pre-census findings".

| # | Cluster | Criteria | Root cause pointers | Status |
|---|---------|----------|---------------------|--------|
| 1 | focus-at-dispatch + return | BC-A-5, BC-B-1, BC-B-5, BC-C-17, BC-D-2 | `Workbench.tsx` focus paths: cancelMove `:320-330` never calls focusDecision; `setSnapshot(null)` `:535` restores no focus + no announcement; proposing card can mount above viewport (b/one-window, top −126); A-5 also has a double-submit clause (scale_servings form) | pending |
| 2 | focus traps, second wave | BC-B-4, BC-E-4 | regenerate re-entry parks focus on Stop (focusDecision trap windows 1/3/4); CookFlow Cancel drops focus to body | pending |
| 3 | roles / live regions | BC-H-1, BC-H-7, BC-H-8, BC-H-9 | error cards lack role="alert"; list-failure lacks live region; loading placeholder lacks role="status" (dish-load states) | pending |
| 4 | empty-guard validation | BC-A-4, BC-A-9, BC-C-13 (+@live-sim) | `IntentBar.tsx:32` silent return on empty intent; message not programmatically associated; content-free tweak still fires gate POST | pending |
| 5 | typed-input preservation | BC-A-13, BC-C-21, BC-C-27, BC-E-5 | typed input discarded on failed/cancelled submissions across IntentBar, redirect form, take-over "Go back", tasting form | pending |
| 6 | first pass + suggestions | BC-A-3, BC-A-14 | no auto first pass on create; `setSuggestedNext` only in SSE handler gated on `expectedMove.current` (`Workbench.tsx:151`), race under fast mode, no GET-recovery population | pending |
| 7 | streaming rationale | BC-B-3, BC-G-4, BC-B-10, BC-I-2 (judge) | rationale replays only after generation completes (`internal/transport/hub.go`); no intermediate live-region values during 25s wait; the founding live-latency finding — Go+web token streaming allowed | pending |
| 8 | gate semantics | BC-C-10 (+@live-sim), BC-C-20, BC-C-22, BC-C-28 | card accessible names lack "Option A"; partial-alternatives shows committing verb; disclosure lacks aria-expanded; steps-deleted take-over saves silently (Go zero-value decode) | pending |
| 9 | diff repertoire | BC-C-16 (+@live-sim) | `StepRow` (`DishCard.tsx:250`) has no changed branch (row.old ignored, no sr-only was/now); PLUS sanctioned harness work: stub gains remove-op / in-place-replace templates so the clause is drivable (self-test re-run required) | pending |
| 10 | durable trial metadata | BC-D-12 (⚖), BC-F-3 (+@live-sim), BC-E-3 (judge) | persist move rationale (schema/wire change sanctioned); auto-applied trial lacks durable attribution marker; feedback→proposal connection not legible | pending |
| 11 | contrast tokens | BC-G-10, BC-G-13 | 98 text pairs below AA both themes (`--color-faint` family); `--color-border-strong` ~1.7:1 on dial-OFF track (`DialToggle.tsx:13,17`) + invalid seed border (`SeedSetup.tsx:49`); token-level work, design bar applies | pending |
| 12 | viewport + backstops | BC-G-12, BC-G-14, BC-C-26 (⚖) | 320px IntentBar clip (`IntentBar.tsx:80` flex no-shrink); skip-link z-50 under z-100 header (`index.css:56` vs `Workbench.tsx:445`) + CookFlow `order:-1` no scroll-padding (`index.css:74`); in-app disclaimer absent | pending |

Meta: BC-I-1 and the four @live-sim parity twins clear when their fast twins
clear. BC-J-6 stays parked by design (B5-only). BC-G-4 is the B-3 derivative.

## Attempts

All 43 failing criteria at 0 attempts. Table appears here from iteration 1
onward: only criteria whose count moved (id · attempts · status).

## Check-change log (harness edits during B4)

- **2026-07-12 · iteration 0 (pre-loop housekeeping, handoff-sanctioned):**
  deduped `oracle.mjs`'s local `runScenario`/`loadScenarios` onto
  `lib/run.mjs` (the self-test's runner) so exactly one runner exists.
  `lib/run.mjs` adopted oracle.mjs's more precise crash-row enrichment
  (specific errors preserved; only "declared but never" rows overwritten) and
  now returns `scenarioError` for the run log. Declared per verification
  conventions: harness edited by this session → self-test re-run required
  before any oracle run (result recorded below).
- **2026-07-12 · iteration 0:** `selftest/selftest.mjs` — mkdir the artifact
  dir before writing `selftest-report.json`. Latent defect exposed by the
  fresh worktree: `evidence/` is gitignored so never checked out, and the
  first self-test ran all 27 probes then crashed at the write (ENOENT). Probe
  logic untouched.

## Iteration records

- **Iteration 0 (setup, no builder):** worktree `../CapyCook-02b` @
  `02b-behavior-contract` off `cb43431`; `make build-all` + `npm ci` green;
  runner dedupe + selftest mkdir fix (check-change log above);
  `oracle.mjs list` green (109/99/10, parity snapshot exact). First self-test
  attempt ran without `--report` (ok:false by design — known-broken layer
  needs a full-run report) and crashed at the artifact write (ENOENT above);
  re-run post-commit WITH `--report` = run-073's oracle-report.json (main
  checkout, read-only; code-identical commits cb43431≡e7a0ab9): _pending_.
