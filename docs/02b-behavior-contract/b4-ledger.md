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
| 1 | focus-at-dispatch + return | BC-A-5, BC-B-1, BC-B-5, BC-C-17, BC-D-2 | `Workbench.tsx` focus paths: cancelMove `:320-330` never calls focusDecision; `setSnapshot(null)` `:535` restores no focus + no announcement; proposing card can mount above viewport (b/one-window, top −126); A-5 also has a double-submit clause (scale_servings form) | 4/5 green @ 4256505 (iter 1); A-5 → cluster 2 |
| 2 | focus second wave + A-5 retry | BC-A-5 (retry), BC-B-4, BC-E-4 | A-5 focus clause: armMoment 'disappear' samples AT the unmount mutation — post-GET focus too late; fix = gated useLayoutEffect on ProposingCard mount (brief cluster-02); B-4 likely fixed by 4256505's retarget, verify 4 trap moments; CookFlow Cancel drops focus to body | 3/3 green @ cd422df (iter 2) |
| 3 | roles / live regions | BC-H-1, BC-H-7, BC-H-8, BC-H-9 | error card plain `<p>` + focus effect gated on loaded dish (`Workbench.tsx:423-431`); loading `<div>` no role (`:433`); list-failure `<p>` no live region (`App.tsx:73-75`) | 4/4 green @ 8093a4f (iter 3) |
| 4 | empty-guard validation | BC-A-4, BC-A-9, BC-C-13 (+@live-sim) | `IntentBar.tsx:32` silent return on empty intent; message not programmatically associated; content-free tweak still fires gate POST | 3/3 green @ 89a5046 (iter 4) |
| 5 | typed-input preservation | BC-A-13, BC-C-21, BC-C-27, BC-E-5 | typed input discarded on failed/cancelled submissions across IntentBar, redirect form, take-over "Go back", tasting form | 4/4 green @ 24e6576 (iter 5; verified by invocation 3b audit + run-005) |
| 6 | first pass + suggestions | BC-A-3, BC-A-14 | no auto first pass on create; `setSuggestedNext` only in SSE handler gated on `expectedMove.current` (`Workbench.tsx:151`), race under fast mode, no GET-recovery population | A-3 green @ c0835af (iter 6); A-14 attempt 1 failed — chips work, but no proposing surface under instant completion → retry brief cluster-06b (iter 8) |
| 7 | streaming rationale | BC-B-3, BC-G-4, BC-B-10, BC-I-2 (judge), **BC-B-8 (judge, folded 2026-07-12)** | rationale replays only after generation completes (`internal/transport/hub.go`); no intermediate live-region values during 25s wait; the founding live-latency finding — Go+web token streaming allowed. B-8 folded in: the end-of-generation replay burst (~26 rapid updates + gate mount) delays the visible handoff paint past the ±3s window AND floods the screencast; streaming during generation removes the burst by design | 4/4 green @ streaming commit (iter 9, run-009); B-8 HELD PASS |
| 8 | gate semantics + C-11 wording | BC-C-10 (+@live-sim), BC-C-20, BC-C-22, BC-C-28, BC-C-11 (judge, folded 2026-07-12) | card accessible names lack "Option A"; partial-alternatives shows committing verb; disclosure lacks aria-expanded; steps-deleted take-over saves silently (Go zero-value decode); REGENERATE label = model vocabulary (4 consecutive fresh-judge FAILs; oracle selects via data-verb, label rename safe) | 4/4 green @ 06e4c00 (iter 7); C-11 PASS ×2 post-rename |
| 9 | diff repertoire | BC-C-16 (+@live-sim) | `StepRow` (`DishCard.tsx:250`) had no changed branch; IngredientRow missed sr-only NOW; FlavorRow had no changed branch. CORRECTION (iter 10): the stub's springClean remove/replace template was ALREADY SHIPPED in B2 (7cabb0a) — the earlier 'stub gains templates' note was stale; builder verified read-only, no Go touched | 1/1 green @ c9ca959 (iter 10, run-010); D-7 de-risk landed (judge PASS run-011) |
| 10 | durable trial metadata | BC-D-12 (⚖), BC-F-3 (+@live-sim), BC-E-3 (judge) | persist move rationale (schema/wire change sanctioned); auto-applied trial lacks durable attribution marker; feedback→proposal connection not legible | 3/3 green (iter 11, run-011): additive migration + Origin field + feedback woven into rationale; E-3 judge PASS |
| 11 | contrast tokens | BC-G-10, BC-G-13 | 98 text pairs below AA both themes (`--color-faint` family); `--color-border-strong` ~1.7:1 on dial-OFF track (`DialToggle.tsx:13,17`) + invalid seed border (`SeedSetup.tsx:49`); token-level work, design bar applies | pending |
| 12 | viewport + backstops | BC-G-12, BC-G-14, BC-C-26 (⚖), **BC-A-12 (folded 2026-07-12 — census fail found unassigned to any cluster)**, A-8 seed-CTA de-risk | 320px IntentBar clip (`IntentBar.tsx:80` flex no-shrink); skip-link z-50 under z-100 header (`index.css:56` vs `Workbench.tsx:445`) + CookFlow `order:-1` no scroll-padding (`index.css:74`); in-app disclaimer absent; A-12: dish-create double-click fires two POST /api/dishes (SeedSetup lacks A-5-style dispatch lock); A-8 judges consistently flag the seed CTA cropped at the 1280×800 fold | pending — runs WITH cluster 11 as one combined builder run (iter 12) |

Meta: BC-I-1 and the four @live-sim parity twins clear when their fast twins
clear. BC-J-6 stays parked by design (B5-only). BC-G-4 is the B-3 derivative.

## Attempts

Only criteria whose count moved (id · attempts · status). Everything else: 0.

| id | attempts | status |
|----|----------|--------|
| BC-A-5 | 2 | GREEN (iter 2, run-002 — layout-effect dispatch focus) |
| BC-B-1 | 1 | GREEN (iter 1, run-001; held runs 002) |
| BC-B-4 | 1 | GREEN (iter 2, run-002 — verified covered by 4256505 retarget, pinning test added, no product edit) |
| BC-B-5 | 1 | GREEN (iter 1, run-001; held runs 002) |
| BC-C-17 | 1 | GREEN (iter 1, run-001; held runs 002) |
| BC-D-2 | 1 | GREEN (iter 1, run-001; held runs 002) |
| BC-E-4 | 1 | GREEN (iter 2, run-002) |
| BC-H-1 | 1 | GREEN (iter 3, run-002) |
| BC-H-7 | 1 | GREEN (iter 3, run-002) |
| BC-H-8 | 1 | GREEN (iter 3, run-002) |
| BC-H-9 | 1 | GREEN (iter 3, run-002) |
| BC-A-4 | 1 | GREEN (iter 4, run-004) |
| BC-A-9 | 1 | GREEN (iter 4, run-004) |
| BC-C-13 | 1 | GREEN (iter 4, run-004) |
| BC-A-13 | 1 | GREEN (iter 5, run-005 — verified via 3b audit) |
| BC-C-21 | 1 | GREEN (iter 5, run-005) |
| BC-C-27 | 1 | GREEN (iter 5, run-005) |
| BC-E-5 | 1 | GREEN (iter 5, run-005) |
| BC-A-3 | 1 | GREEN (iter 6, run-006) |
| BC-A-14 | 2 | GREEN (iter 8, run-008 — optimistic proposing at dispatch) |
| BC-B-3 | 1 | GREEN (iter 9, run-009 — live token streaming) |
| BC-B-10 | 1 | GREEN (iter 9, run-009) |
| BC-G-4 | 1 | GREEN (iter 9, run-009) |
| BC-I-2 | 1 | GREEN (iter 9, run-009 — judge PASS on full-journey screencast; THE founding finding) |
| BC-C-16 | 1 | GREEN (iter 10, run-010) |
| BC-D-12 | 1 | GREEN (iter 11, run-011 — additive migration, legacy-DB regression test) |
| BC-F-3 | 1 | GREEN (iter 11, run-011 — durable Origin badge) |
| BC-E-3 | 1 | GREEN (iter 11, run-011 — judge PASS, feedback echo visible) |
| BC-C-10 | 1 | GREEN (iter 7, run-007) |
| BC-C-20 | 1 | GREEN (iter 7, run-007) |
| BC-C-22 | 1 | GREEN (iter 7, run-007) |
| BC-C-28 | 1 | GREEN (iter 7, run-007) |

previouslyGreen (cumulative --only regression set): BC-B-1, BC-B-5, BC-C-17,
BC-D-2, BC-A-5, BC-B-4, BC-E-4, BC-H-1, BC-H-7, BC-H-8, BC-H-9, BC-A-4,
BC-A-9, BC-C-13, BC-A-13, BC-C-21, BC-C-27, BC-E-5, BC-A-3, BC-C-10,
BC-C-20, BC-C-22, BC-C-28, BC-A-14, BC-B-3, BC-B-10, BC-G-4, BC-I-2,
BC-C-16, BC-D-12, BC-F-3, BC-E-3 (32).

## Check-change log (harness edits during B4)

- **2026-07-12 · after iteration 11:** `a-intake.mjs` — BC-A-8 seed-screen
  still settle bumped 600ms → 2400ms: run-011 fed a judge a black frame
  again; 600ms is inside the recorder watchdog's 1.5s freshness threshold,
  so a wedged initial blank frame is only force-refreshed after ~1.5s.
  Self-test re-run after commit: result in iteration records.

- **2026-07-12 · after iteration 9 (commit 55473e8):** `b-proposing.mjs`
  ensureIdle taught the BC-C-20 alternatives world — it knew only
  idle/proposing/gate/blocked, so the new partial/picker states spun it to
  the check deadline (B-4 trap-alternatives stall, runs 008/009, cascading
  into both redirect traps). Alternatives now drain: wait both cards, pick
  A, accept. Detection ordered before 'proposing' so the second option's
  card is not Stop-cancelled into a stranded state. Self-test re-run after
  commit: result in iteration records.

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
- **2026-07-12 · after iteration 7 (commit 23246b4):** four scenario files
  adapted to contract-mandated product changes — the product was RIGHT, the
  scenarios pre-dated it: `d-versions.mjs` createDishViaUI now absorbs
  BC-A-3's auto-fired first pass to the gate (d/timeline + BC-D-10 drop
  their manual first drives; fixes the D-2 `#cc-intent` timeouts ×2);
  `b-proposing.mjs` trap-2 arms on the partial-alternatives surface BC-C-20
  now correctly renders instead of the withheld single gate (fixes the B-4
  deadline stall in run-007); `g-modes.mjs` g/reduced-motion switches to an
  API-created dish so its manual-dispatch timing baseline survives auto-fire
  (latent — would have broken at the exit full runs); `a-intake.mjs` A-8
  stills get a paint settle + deeper mid-proposing capture (run-006 black
  frame, run-006/007 near-identical frames). Self-test re-run after commit:
  result in iteration records.
- **2026-07-12 · after iteration 3 (commit 007123a):** `lib/record.mjs` —
  screencast freshness watchdog. Chrome pauses the screencast when a
  fire-and-forget ack is lost mid-paint-flood; the writer loop then re-stamps
  the stale buffer every 200ms. Runs 001/002 fed BC-B-8's judges a frozen
  pre-handoff frame labeled t=26–29s while the renderer instrument shows
  'Proposal ready' at 25817ms — both B-8 FAILs adjudicated as harness
  artifacts (NO strikes). Watchdog restarts the screencast after 1.5s without
  a fresh frame. Self-test re-run after commit: result recorded in iteration
  records.

## Iteration records

- **Iteration 0 (setup, no builder):** worktree `../CapyCook-02b` @
  `02b-behavior-contract` off `cb43431`; `make build-all` + `npm ci` green;
  runner dedupe + selftest mkdir fix (check-change log above);
  `oracle.mjs list` green (109/99/10, parity snapshot exact). First self-test
  attempt ran without `--report` (ok:false by design — known-broken layer
  needs a full-run report) and crashed at the artifact write (ENOENT above);
  re-run post-commit WITH `--report` = run-073's oracle-report.json (main
  checkout, read-only; code-identical commits cb43431≡e7a0ab9): **27/27
  PASSED, ok:true @ 540a5cb** (incl. 10/10 mutation flips). Loop cleared to
  run.
- **Iteration 1 (invocation wf_e203b347-ab6, builder run 1/12):** cluster 1
  focus-at-dispatch, builder commit `4256505` (ProposingCard focusable
  heading + focusDecision retarget off Stop + scrollIntoView; moveInFlight
  ref lock in propose(); cancelMove→focusDecision; backToCurrent() announces
  + focuses #stage-heading; 4 new jsdom tests, web suite 207/207). Gate all
  green. Oracle run-001 (worktree numbering): **B-1, B-5, C-17, D-2 GREEN;
  A-5 attempt 1 FAILED** — focus clause only: armMoment('disappear',
  '#cc-intent') samples activeElement at the unmount mutation; the builder's
  post-GET focusDecision() fires too late. Adjudication: retry as part of
  cluster 2 with a layout-effect brief (cluster-02.md). No regressions.
  First invocation also flushed two script defects: Workflow args arrive as a
  JSON string (script now parses), and the builder's first run validated the
  gate ordering. Out-of-scope judge signal (shared scenarios): BC-B-2, BC-D-7
  PASS; **BC-B-8 FAIL evidenceSuspect=true** (screencast window ended before
  proposal-ready — capture artifact, no strike; WATCH: investigate if it
  repeats on fresh evidence); **BC-C-11 FAIL** ("REGENERATE" verb = model
  vocabulary; passed the census under a different fresh judge) — adjudicated
  as real drift risk at exit, folded into cluster 8 (verb wording; check
  oracle selectors before renaming).
- **Iterations 2–3 (invocation wf_543ecafa-b39, builder runs 2-3/12):**
  cluster 2 focus-second-wave @ `cd422df` — **A-5 (attempt 2), B-4, E-4 all
  GREEN** (run-002). A-5: dispatchFocusPending ref + useLayoutEffect calling
  synchronous focusDecisionNow() in the commit that unmounts #cc-intent,
  local-dispatch-gated (deep-link steals no focus); B-4: no product edit —
  all four trap moments traced to paths already retargeted by 4256505, grep
  confirms nothing can focus Stop, pinning regression test added; E-4:
  CookFlow triggerRef restore on close. Deviations accepted by lead: (1)
  Workbench-level layout effect instead of ProposingCard mount effect — same
  timing, also covers fast-profile idle→awaiting_gate jumps; (2) E-4 restore
  fires on submit-collapse too (contract names only Cancel) — better UX, same
  class, focus hands off to A-5's mechanism at dispatch. Cluster 3
  roles-live-regions @ `8093a4f` — **H-1, H-7, H-8, H-9 all GREEN**
  (run-002). Deviation accepted: error-card focus fires on cold-load
  deep-links too — H-7's own check IS a deep-link scenario; audit-#9's
  no-focus-on-cold-load rule read as scoped to successful loads. Gates all
  green both clusters; web suite 212/212 then +roles tests; **no regressions
  across the 11-strong green set**. Out-of-scope judge signal: B-2, D-7 PASS
  again; **B-8 FAIL ×2 adjudicated as harness artifact** (recorder stall —
  see check-change log, fix 007123a); C-11 REGENERATE wording FAIL repeats
  (consistent → cluster 8 confirmed); **E-3 FAIL with solid evidence** (WHY
  IT WORKS identical pre/post rework — real defect, already in cluster 10).
- **Iteration 4 + interrupted iteration 5 (invocation wf_4dffd1cc-dba, builder
  runs 4-5/12):** cluster 4 empty-guard @ `89a5046` — **A-4, A-9, C-13 all
  GREEN** (run-004; full 14-id set green, no regressions; gate green, web
  suite 224/224). Deviations accepted by lead: (1) `disabled:opacity-40` on
  GateBar's shared button class — redirect Send now also dims when empty,
  accepted surface change; (2) zero-editable-op tweak counted as content-free
  (Save disabled) — matches BC-C-13's intent. Cluster 5 typed-input builder
  COMMITTED `24e6576` (self-reported suite green) but the GATE AGENT died on
  the session usage limit → invocation aborted; cluster 5 is UNVERIFIED.
  Resume = invocation 3b: verify-complete builder (reads 24e6576's diff
  against brief cluster-05, fixes gaps only) → gate → oracle → judges.
  **B-8 re-adjudication:** run-004 FAILED again POST-watchdog (six
  byte-identical tail frames; renderer 'Proposal ready' at 25824ms) — the
  watchdog is insufficient, and the paint-side handoff plausibly really does
  lag past ±3s under the end-of-generation replay burst (census passed with
  ~2s lag — marginal). Folded B-8 into cluster 7, whose streaming work
  removes the burst by design; recorder freshness logging to be added when
  cluster 7 is prepped (harness edit → self-test re-run then). Attempts for
  B-8 stay 0 (out-of-cluster signal; never a strike so far).
- **2026-07-12 — workflow agents switched to Sonnet** (USER directive on
  resume): every agent() in `b4-iteration.workflow.mjs` now passes
  `model: 'sonnet'` (args-overridable). Lead unchanged.
- **Iterations 10–11 (invocation 6, wf_9887ba5a-dec, Sonnet agents, builder
  runs 10-11/12):** cluster 9 diff-repertoire @ `c9ca959` — **C-16 GREEN**
  (run-010; StepRow changed branch + IngredientRow sr-only NOW + FlavorRow
  changed branch; full row-kind × add/change/remove test matrix). Builder
  correctly flagged the ledger's stub-template note as stale (springClean
  shipped in B2 @ 7cabb0a) and verified read-only instead of re-building —
  accepted, ledger corrected. **B-4 PASS again post-ensureIdle-fix** — the
  55473e8 adjudication confirmed; full 28-id set green. D-7 branch note
  landed → judge PASS in run-011. Cluster 10 durable-trial-metadata —
  **D-12, F-3, E-3 GREEN** (run-011): additive SQLite migration persists
  accept-time rationale end-to-end (legacy-DB regression test included),
  shared Origin field drives a durable text-exposed 'Auto-applied' badge,
  stub's iterate_feedback weaves the tasting note into rationale +
  flavor_rationale → E-3 judge PASS. Judges: I-2, B-8, B-2, C-11, D-7, G-3
  all PASS; **A-8 still artifact-blocked** (seed-still black frame again —
  600ms settle < watchdog threshold; bumped to 2400ms, see check-change) +
  awaits cluster-12's CTA-fold fix. Zero regressions. **32 of 43 green.**
- **Iterations 8–9 (invocation 5, wf_d2285d3f-b4b, Sonnet agents, builder
  runs 8-9/12):** A-14 retry @ `cbe736b` — **GREEN (attempt 2)**: optimistic
  proposing state mounts synchronously at dispatch (baseVersion-less callers
  only — deliberate CookFlow exclusion accepted by lead: an optimistic
  unmount there would tear down BC-E-5's form-survival mechanism); the
  builder also caught and closed a focus-drop regression its own change
  would have introduced (auto-advance + failed-dispatch backstops).
  Cluster 7 streaming @ streaming commit — **B-3, B-10, G-4 GREEN and
  BC-I-2 (THE FOUNDING FINDING) judge PASS on the full-journey screencast**
  (run-009): stub offers the proposal early via a new optional
  MoveRequest.OnDraft hook and spends the latency window revealing rationale
  tokens live; orchestrator forwards them; never-a-token-for-blocked-moves
  proven with new orchestrator tests; Workbench throttled rotating progress
  announcements land in B-10's 2000-12000ms band. B-8 HELD PASS, B-2 PASS,
  C-11 PASS (3rd/4th consecutive post-rename). Gates green ×2 (Go + web).
  **B-4 apparent regression ×2 adjudicated as harness stall** (ensureIdle
  ignorant of the C-20 picker flow → fixed 55473e8, see check-change log;
  B-4 re-verifies next run). **New: D-7 judge FAIL** (stricter fresh judge:
  BRANCH badge lacks inline self-explanation vs COOKED's quote box; same UI
  passed 5+ earlier panels) — adjudicated as de-risk product work, folded
  into cluster 9 (TimelineSpine branch-origin note). **A-8 now fails on ONE
  clause only** with clean evidence: the seed CTA crops at the 1280×800 fold
  — real product issue, folded into cluster 12. **A-12 discovered UNASSIGNED**
  (census fail missing from every cluster — lead accounting gap): folded
  into cluster 12 (SeedSetup create needs an A-5-style dispatch lock).
- **Iterations 6–7 (invocation 4, wf_1eb15383-461, Sonnet agents, builder
  runs 6-7/12):** cluster 6 @ `c0835af` — **A-3 GREEN** (auto first pass via
  an in-memory justCreated ref through the existing propose() path; all four
  boundaries); **A-14 attempt 1 FAILED** on ONE clause: chips render/label/
  dispatch correctly, but no proposing surface mounts under instant
  completion (fast stub jumps idle→awaiting_gate in one commit) → retry
  brief `cluster-06b-a14-retry.md` (optimistic proposing at dispatch).
  Cluster 8 @ `06e4c00` — **C-10, C-20, C-22, C-28 GREEN** (run-007); C-11
  judge PASS in BOTH runs post-REGENERATE-rename. Gates green throughout.
  Apparent regressions adjudicated as HARNESS STALENESS, not product: D-2
  ×2 + B-4 ×1 (scenarios encoded pre-A-3/pre-C-20 app behavior; fixed in
  23246b4, re-verified next run). A-8 judge FAIL ×2 = evidence artifacts
  (black frame / near-identical frames / cut-off CTA); stills re-timed.
  WATCH: run-007's judge noted the seed CTA sits at the viewport fold —
  if A-8 still fails on that with clean evidence, it becomes cluster-12
  product work. Judge signal: B-8 PASS again (runs 006+007 — watchdog
  holding), B-2 FAIL in run-006 (single occurrence, PASS run-007 — noise,
  watch), E-3 FAIL (known, cluster 10).
- **Iteration 5 closed (invocation 3b, wf_8548db50-cf6, Sonnet agents):**
  verify pass on `24e6576` — implementation audited complete clause-by-clause
  against cluster-05, suites independently re-run (tsc clean, 240/240),
  NO gaps, no new commit. Oracle run-005: **A-13, C-21, C-27, E-5 GREEN;
  full 18-id set green, zero regressions.** Gate all green. Judge signal:
  **BC-B-8 PASS on fresh evidence** ("by t26.3s the header badge swapped to
  NEEDS YOUR CALL … holds through t29.1s") — run-004's post-watchdog FAIL
  was residual capture flake, not product paint-lag; B-8 stays folded in
  cluster 7 (streaming removes the flood that triggers the flake) and must
  hold at the ×2 exit runs. B-2, D-7 PASS again. **C-11 FAIL (4th
  consecutive fresh judge)** — REGENERATE wording + faint-gray label;
  wording → cluster 8 (folded), contrast → cluster 11. Verified: oracle
  addresses verbs by `data-verb` attribute only, so the label rename is
  selector-safe.
