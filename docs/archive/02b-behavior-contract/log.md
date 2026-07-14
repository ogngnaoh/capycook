# Log — milestone 02b (behavior-contract)

> **ARCHIVED HISTORICAL LOG — 2026-07-14.** Milestone 02b and milestone 02 are
> shipped. Chronological references below to resuming H2, S8, GIF work, publishing,
> or worktree removal record past decisions and are not current instructions. H2 is
> final, all nine GIFs are current, GitHub is the complete showcase surface, and the
> Task 7 private/public release gates remain in force.

- **2026-07-11 — 02b opened.** Motivated by the first live-latency operator session:
  four root-caused UX gaps (IntentBar silent empty no-op, no auto first pass,
  post-completion-only rationale replay, focus-on-Stop Enter trap), none visible in
  stub-instant demos. Design ratified in principle the same day (session plan →
  spec): comprehensive behavior contract → USER ratification → hybrid headless
  oracle (puppeteer asserts + fresh-context judges) → fully autonomous fix→judge
  loop, full-stack-minus-frozen, pause-and-report stall valve, hard cap 12
  iterations, USER final approval. 02b inserted before S8 publish (02a pattern);
  H2 operator sessions resume on the improved workbench. B1 (docs + spec +
  contract draft) started.
- **2026-07-11 — contract draft survived a 49-round fresh-context review loop
  (user-requested), verdict APPROVE.** Protocol: each round spawned a fresh
  adversarial critic (serious-home-cook UX persona + WCAG 2.2 AA specialist,
  no drafting context), REVISE findings were code-verified and folded in, next
  round re-reviewed from scratch. Contract grew 66 → 109 criteria (99 assert /
  10 judge). The loop's own material discoveries, all traced in shipped source
  before encoding: silent wrong-shape take-over commit (Go zero-value decode
  wipes deleted keys, BC-C-28); partial-alternatives premature gate (option B
  silently dropped, BC-C-20); override "Go back" discarding the typed edit
  (BC-C-27); typed-input discard on failed/cancelled submissions across three
  components (BC-A-13/BC-C-21/BC-E-5); measured WCAG contrast failures in the
  `--color-faint` token pairs (2.7–4.0:1, BC-G-10); SR silence during the 25s
  wait (BC-B-10) and on dish-load states (BC-H-1/7/9); an unfalsifiable check
  in the original BC-B-4 (sampled the wrong moment — rewritten to the actual
  `focusDecision` trap windows). Two criteria deferred to the user as
  ⚖ RATIFICATION DECISIONS: BC-C-26 (in-app safety disclaimer vs README-only)
  and BC-D-12 (persist move rationale — schema change). Round 49: APPROVE,
  two nits, both applied. Awaiting USER ratification.
- **2026-07-11 — CONTRACT RATIFIED (USER gate cleared), B1 SHIPPED.** Ratified
  as-is; both ⚖ criteria kept in force (BC-C-26 in-app disclaimer, BC-D-12
  persisted rationale). Pin: `965c8ebf5dd752c2a9d23bb2a796a7935fcff6d9`
  (recorded in milestone.md; BC-J-3 verifies it every iteration). The contract
  is now frozen — loop may never edit it; amendments only via user ruling
  logged here. B2 (oracle harness + falsifiability self-test) active.
- **2026-07-11 — B2 + B3 SHIPPED.** Oracle built at `web/tools/oracle/` (~44
  scenarios, 12 files) by a 10-builder fan-out; Go stub gained 5 fixture
  branches + stub-mode budget metering (BC-H-4 reachable). 10 fresh-context
  critics reviewed every file against contract text only — 3 CRITICALs found
  and fixed (invisible-disclaimer vacuity, untested changed-step clause,
  unswept Stop control), 5 files revised + re-verified 2×. Falsifiability
  self-test 27/27: contrast math vs hand-computed WCAG pairs, deadline/
  report-refusal plumbing, 10/10 mutation sabotages flip their targets; two
  evaluator vacuities hardened en route (A-10 row-match, B-1 real Visible
  clause). B3 census run-073 (full, guardrails + suites green): **79 pass /
  43 fail / 1 parked**, every fail explained — all ~27 contract-marked
  FAILS-TODAY reproduce, plus **10 unmarked genuine defects** root-caused to
  file:line (A-14, B-1, B-5, C-16 changed-step, C-17, E-3 judged, G-12,
  G-13, G-14 ×2 offenders). Judges 7 PASS / 2 FAIL (I-2 = the founding
  finding). One judge mis-fail traced to a stale pre-paint evidence frame →
  harness freshness fix, re-capture, re-judge (PASS). B4 active.
- **2026-07-12 — B4 CHECKPOINT (hard cap reached): 41 of 43 census fails
  fixed in 12 builder runs; loop paused for USER ruling.** Evidence:
  oracle runs 001–012 (worktree evidence dir), every iteration adjudicated
  in b4-ledger.md, gates green throughout, zero product regressions (three
  apparent ones were stale scenarios, each traced and fixed with self-test
  re-proof: D-2, B-4, g/reduced-motion). Green now includes the founding
  finding (BC-I-2, live streaming during the 25s wait) and both ⚖ criteria
  (C-26 disclaimer, D-12 persisted rationale via additive migration).
  STILL FAILING (1 strike each): **BC-G-10** — 25 of 98 text-contrast pairs
  remain below AA on screens outside the builder's verification sweep;
  **BC-A-12** — only the "visibly disabled in flight" clause, observed with
  a single poll sample under an instant create (possibly harness sampling
  granularity — audit pending). OUT-OF-SCOPE SIGNAL needing lead harness
  work (no builder runs): the recorder wedge behind BC-B-8's intermittent
  false-FAILs (root cause identified: CDP screencast requested at ~30fps
  while 5fps is persisted — frame flood outruns acks; fix = lower
  everyNthFrame) and BC-G-6's missing 390px evidence states.
  **PROPOSED RULING:** grant +2 builder runs — (a) G-10 round 2 with the
  oracle's full 25-pair failing list quoted in the brief, (b) A-12 only if
  the scenario audit confirms a real product gap (if it is sampling
  granularity, the lead fixes the scenario and A-12 re-verifies free).
  Lead performs the recorder + G-6 harness fixes and the A-12 audit while
  awaiting the ruling (self-test re-proof each). Then the ×2 full-run exit
  gates as ratified. Alternative rulings: park G-10's remaining pairs with
  a documented exception list, or stop here and take the checkpoint to B5
  review as-is (2 criteria red).
- **2026-07-12 — USER RULING on the B4 checkpoint: +2 builder runs GRANTED**
  (G-10 round 2; A-12 conditional on the scenario audit), lead harness queue
  sanctioned. Session closed immediately after the ruling; next session
  executes. **Post-ruling lead finding (before closing):** the 25 remaining
  BC-G-10 pairs are ALL light-theme-only and ALL carry effective opacity
  0.45–0.66 on freshly-mounted content ("Trial 1" rgb(107,100,92) on white
  reads 1.95:1 at opacity 0.45 — the token pair itself clears AA). Prime
  hypothesis: the g/desktop-modes contrast walker samples the light theme
  first, DURING the cc-rise entrance animation (~300ms opacity 0→1); dark,
  walked after the theme toggle with animations settled, is fully clean.
  If verified, G-10 needs a walker settle-wait (harness fix + self-test),
  NOT a builder run — and the same instant-sampling class likely explains
  A-12's sawDisabled:false at 1 poll sample. The granted builder runs may
  go unused. Full pair list preserved (evidence is gitignored) at
  b4-briefs/g10-round2-pairs.json.
- **2026-07-12 — B4 CHECKPOINT EXECUTED (lead-solo harness queue; NO builder
  runs spent; both granted runs unused).** The post-ruling hypothesis held:
  both remaining reds were harness artifacts. Five lead harness commits
  (`3b48b1a`, `6255a66`, `823939a`, `982bcfa`, `be2a84b`), each committed then
  self-tested `ok:true` 27/27 (each own falsifiability sabotage still flips) —
  see b4-ledger.md check-change log. **BC-G-10 → GREEN** (the walker sampled
  mid-`.cc-rise` entrance fade; now zeros keyframe animations; positive control
  `low-contrast-ink` still flips → walker not blinded). **BC-A-12 → GREEN**
  (AUDIT: SeedSetup IS correct — renders `aria-disabled` + "Developing…"; the
  5ms poll sampled before React commits, then two stale-scenario bugs surfaced:
  error-summary focus artifact + a `<textarea>`-Enter timeout live since
  run-012). **BC-B-8 / BC-G-6** harness sources fixed (recorder frame-rate;
  g/narrow-390 reach-idle + still framing).
  **TWO GENUINE ISSUES SURFACED (reported, NOT fixed — checkpoint boundary):**
  (1) **BC-G-8 product regression** — the GateBar "Try another way" disclosure
  toggle is 104×20px (<24px WCAG 2.5.8) at 390px; census run-073 had BC-G-5/6/8
  all GREEN, so B4 regressed it; the g/narrow-390 abort had masked it. Needs a
  builder run (give the toggle ≥24px height). (2) **Loop blind spot** — B4's
  targeted `--only` runs never re-checked census-PASSING criteria, so B4 product
  changes silently regressed some (G-5/G-6/G-8 confirmed via g/narrow-390). The
  ×2 full exit runs are the first place ALL criteria are re-checked; MORE masked
  regressions may surface there. **PROPOSED for USER:** (a) authorize a product
  fix for BC-G-8; (b) run one full oracle pass (informative, not the exit gate)
  to enumerate every masked regression before committing to the ×2 all-green
  exit. Also noted: **BC-J-5 guardrail** fails in the worktree (`data/capycook.db`
  is a 0-byte file — no events table); the exit runs must point it at the real
  operator DB (pre-existing, runs 010–012 too). Per the chosen session boundary,
  STOPPED here for USER review before any ×2 exit run or builder run.
- **2026-07-12 — USER RULING on the exit path: SCOPE-FIRST.** Next session:
  (1) fix BC-J-5 (worktree DB) so guardrails are meaningful, (2) run ONE
  informative full oracle pass to enumerate ALL masked regressions (not the exit
  gate), (3) fix the batch (BC-G-8 + whatever surfaces) via builder runs, (4)
  then the ×2 consecutive full all-green runs → B5. Rationale: see the true
  regression scope before committing builder runs to the exit. Session closed at
  the checkpoint after the ruling; next session executes.
- **2026-07-13 — SCOPE-FIRST exit executed; B4 COMPLETE, checkpointed to B5
  (USER ruling).** BC-J-5 fixed (worktree DB symlink → real operator DB).
  Informative full run (run-023): 108/5/1 — 5 masked regressions triaged:
  BC-G-8 + BC-H-4 (B4 product regressions, fixed by builder `4080499`), BC-C-8
  (stale scenario — coupled to the pre-fix C-27 behavior), BC-C-10@live-sim
  (wait budget too short for 2× sequential gen), BC-I-1 (derivative). Then the
  ×2 exit surfaced the **judge-capture tail**: four transient-state stills were
  captured unreliably by the CDP screencast (A-8 seed missing, G-3 dark→light
  then light→idle, G-6 toast overlap, B-8/I-2 handoff-moment wedge). Fixed every
  fixable one (screenshot fallback, setTheme+judgeShot, toast wait, resolved-gate
  judgeShot). A **machine-overload episode** (runaway Slack + NotificationCenter →
  load 14 → Chrome/CDP crashes + agent stalls + `d/restart` jetsam OOMs) was
  cleared by the USER freeing memory; full runs then completed clean (**113/0
  asserts on run-027/030/034/036**). But the fresh-context judge fan-out never
  reached 9/9 in one run: **irreducible judge variance** on the two
  motion/transition criteria (BC-B-8, BC-I-2 — the screencast can't capture the
  handoff *moment*) + a D-7 stub duplicate-text artifact; different criteria
  failed each run, none a product defect. **USER ruled: checkpoint to B5.** The
  product is thoroughly verified (113/0 ×4 clean runs; every individual UI state
  judged correct); B5's USER-approval gate adjudicates the 3 documented evidence
  artifacts. This session edited the checks/capture — the exit is EVIDENCE for
  B5, NOT a self-verification; the ×2-all-green criterion was not mechanically
  met (judge variance). Guardrails clean at HEAD `efa9c0d` (freeze empty, pin
  intact, PREREGISTRATION untouched, operator DB = 6, self-test 27/27).
- **2026-07-13 — B5 SHIPPED; 02b COMPLETE.** The USER exercised the B5
  approval gate after an **independent runtime verification by a fresh session
  that did NOT write the B4 checks** (the doctrine-clean verifier): the app was
  rebuilt from B4 source (`9266155`) and driven in a real browser (stub mode,
  temp DB, injected latency) — auto-first-pass (BC-A-3), empty-intent guard +
  `aria-describedby` association (BC-A-4/A-9), focus-not-body at dispatch/gate/
  hold (BC-A-5/B-1), changed-row diff markup (BC-C-16), feedback echo (BC-E-3),
  the safety hold (garlic-oil → held, rule cited, dish unmutated), the in-app
  disclaimer (BC-C-26), in-wait SR announcements, and deep-link state persistence
  were all confirmed; verdict **PASS**. Observed and confirmed the D-7 stub
  clutter is a fixture wart, not a product defect. On that basis the USER
  **accepted the assembled B4 evidence and waived the 3 open judge artifacts**
  (BC-B-8/I-2 transition-capture variance, D-7). Pre-merge guardrail gate green
  (freeze diff vs `32afe54` empty · pin `965c8eb` byte-intact · PREREGISTRATION
  untouched since `cb43431` · operator DB still 6/1307 · go vet clean · go test
  ./... ok · tsc clean · vitest 273/273). **Merged `02b-behavior-contract` →
  `measure-run` (no-ff, UNPUSHED — D7 holds).** GIF re-check **DEFERRED to pre-S8**
  (USER ruling): scenes 01/04/07 changed under B4 and need a `demo.mjs` rig fix
  (`seedToTrial1` manually dispatches after create, which BC-A-3 auto-first-pass
  broke); the GIFs are public only at S8, so they are re-captured then. 02b folder
  archival to `docs/archive/` also deferred to the milestone-02 ship (S8 and the
  GIF work still reference the handoff + gitignored evidence in place). Next:
  resume milestone 02 S8 (H2 sessions + publish).
