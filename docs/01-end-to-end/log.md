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
- **2.1 ingredient-universe procedure:** union of the five USDA MyPlate food-group example lists + the Food Network Kitchen pantry/fridge/freezer essentials checklist (both verified via dated Wayback snapshots — live MyPlate deep links now redirect to the homepage and foodnetwork.com/fsis.usda.gov 403 automated clients), normalized to lowercase-singular canonicals with alias/category rules, plus builder-curated additions covering the plan's mandated high-risk-protein/Big-9-carrier/demo set → 246 rows, `big9_flags` left empty for the 2.4 FoodOn closure; snapshot URLs in `data/README.md`.

## 2026-07-07

- **2.5 cost-table procedure (two-tier, per the sanctioned split):** tier A (80 rows)
  from live official series — BLS Average Price snapshot (all used series at 2026-05,
  U.S. city average; discontinued series like canned tuna/peanut butter deliberately
  skipped rather than presenting 2017 prices as current) preferred over USDA ERS
  Fruit & Vegetable Prices (2023 Circana scanner data; vintage cross-checked against
  the per-commodity workbook); tier B (166 rows) uniform builder-judgment estimates,
  tagged as such per row. Volume-priced series (milk/gal, wine/L) convert to $/100g
  via the food's own vendored USDA portion density — never an assumed density; egg is
  the one per_unit row ($/doz ÷ 12, unit count recovered via the 50.3 g whole-egg
  portion). Artifact pins + substitution list in `data/cost/PROVENANCE.md`;
  `scripts/vendor_cost.py` re-runs the extraction and preserves tier-B rows.
- **2.8 wiring decisions:** (a) grounding resolution is applied to every change set
  BEFORE the safety screen (proposal ops, edit ops, and take_over drafts are
  re-diffed with resolver-filled fdc/foodon ids) — required, not cosmetic: the
  fail-closed allergen check deliberately does no alias resolution, so the stub's
  "flat-leaf parsley" would false-block any dish with a declared allergen without it
  (spec §5 pins resolution as the step feeding the allergen rule). commitVersion also
  re-resolves, so every snapshot keys nutrition/allergen on ids regardless of path.
  (b) Deterministic recomputes compute over the resolved draft and cite exactly what
  they used: nutrition = wiring-supplied USDA provenance (Foundation 2026-04-30 +
  SR Legacy 2018-04) plus one `fdc:<id>` citation per resolved ingredient; cost = the
  cost-table provenance (assembled 2026-07-07, per-row as_of). Citation metadata rides
  orchestrator Deps so stub-mode/tests fall back to generic refs — never a fabricated
  provenance. (c) Data assets reach the container OUTSIDE the /data volume
  (`/srv/data` + `DATA_DIR` env; volume mounts would shadow baked files), and wire()
  now fails at startup when the CSVs are absent (tested) — an image without data
  cannot silently run. (d) Cost keeps its no-alias name lookup: "flat-leaf parsley"
  stays an unpriced footnote (never $0) — honest, and visible in the UI.

## 2026-07-07
- **Gate A cleared:** user reviewed safety rules, cost table, ingredient universe +
  provenance and approved as-is ("looks good"), no redirects. Phase 3 begins.
- **3.1 live-docs verification (api-docs.deepseek.com, fetched 2026-07-07):**
  `deepseek-v4-pro` confirmed live (1M context; legacy `deepseek-chat`/`deepseek-reasoner`
  deprecate 2026-07-24; a cheaper `deepseek-v4-flash` also exists). `/beta` strict
  tool-calling confirmed: strict:true, all properties required, additionalProperties:false
  — matches SPEC §4c exactly. `json_object` mode remains schema-unvalidated with the
  documented occasional-empty-content caveat (+ include-"json"-in-prompt, max_tokens).
  **No structural drift — Phase 3 proceeds.** Cosmetic drift: pricing now
  $0.435/M in ($0.003625/M cache-hit) / $0.87/M out (~4x cheaper than SPEC's stale
  $1.74/$3.48); "5M free tokens" no longer documented. SPEC §2/§4c patched this commit.
- **3.3 budget persistence — sidecar JSON, not a store table:** cumulative LLM
  spend lives in `<DB_PATH>.budget.json` (atomic temp+rename writes), not in the
  SQLite store. The ledger is operational state, not domain data: keeping it out
  spares the pinned Store interface + migration chain, and a fork resets spend by
  deleting one file. Pre-call hard-stop semantics: a call is refused once spend
  ≥ cap, so the final in-budget call may overshoot slightly (per-call cost is
  unknowable in advance). Record-replay fixtures under
  `internal/llm/testdata/recorded/` are hand-authored `synthetic_*.json` until
  Gate B; real recordings (`recorded_*.json`) only ever come from the
  CAPYCOOK_LIVE_TEST=1 smoke test.
- **Gate B cleared (2026-07-07):** user directed "use what I have now (~$2)" —
  LLM_BUDGET_USD tightened 10 → 2 in .env (spec's $10 is the ceiling; tighter is
  safer). DeepSeek + Langfuse keys provided via .env by the user; Langfuse project
  is US-region (us.cloud.langfuse.com — the EU default 401'd; host fixed in .env).
- **Live-API drift found at the Gate-B smoke (undocumented):** v4-pro defaults to
  thinking mode, which 400-rejects a forced tool_choice ("Thinking mode does not
  support this tool_choice"). Fix: thinkingDisabledTransport injects DeepSeek's
  custom thinking:{"type":"disabled"} on every chat-completion call (go-openai has
  no vendor-extension field) — proposal extraction is a structured task and runs
  non-thinking, keeping the strict forced-tool-call path. TDD'd; the 400 error
  response is kept as a recorded fixture documenting the behavior.
- **Phase-3 oracle complete:** live smoke green (8 ops, conf 0.85, $0.0022; real
  wire fixture recorded_1783412942_01.json confirms the synthetic fixtures' assumed
  mapping — propose_move tool call, six arg keys, cache hit/miss usage fields);
  full server loop drove a real seed_expand (5 ops, conf 0.9, honest unverified on
  an evidence-less empty draft, $0.0027); OTel span exported and verified in the
  Langfuse CapyCook project BOTH via API (evidence/phase3/langfuse_trace.json —
  attrs session_id/arm/move_type present) and visually in the Tracing UI. Total
  live spend ≈ $0.005 of the $2 cap. Satisfies the re-homed "one replayable traced
  event" criterion.
- **Phase 4 shipped (eval harness, stub-only):** replay fold reports the NATIVE verb
  distribution per move-category (frozen-five as a stated derivation via the exported
  mapping table); three rates implement PREREG §7a verbatim (checkable denominator,
  mischaracterized counts neither way); κ verified against a hand-computed 20-claim
  fixture (κ=113/153); scripted arm runner drives the real orchestrator (run_kind=
  harness) with auto-accept, exports UNLABELED claims, 3-arm stub dry-run renders the
  all-zero table (re-homed "empty baseline" criterion); labeling kit pins a seeded
  (20260706) 18% per-arm-stratified double-label sampler with in-source Fisher–Yates;
  13 proposed benchmark seeds (195≈200 claim arithmetic) live in docs/ as an
  UNRATIFIED draft with a disjointness test against dev seeds; README carries the
  methodology + empty results table guarded by a docs-freeze test; T1 amendment text
  drafted for the USER to log at milestone-02 start. eval/fixtures holds only
  README/CHANGELOG/move_script.json; PREREGISTRATION diff verified empty.
- **5.3 post-cook contract (baseVersion):** the pinned `POST /move` body gains the
  spec-§8-sanctioned additive `baseVersion` field (plan API note updated). Design
  choice: generation AND gate resolution key on the pending move's base — the
  proposal's ops are relative to the base version's draft, so accept/edit apply
  against it and parent the new version to it (sibling branch when the base is not
  the trunk head), and regenerate/redirect/alternatives respawns inherit the base.
  `base_version` rides move_requested (and respawning gate_*) payloads for replay;
  invalid ids are 400 (`ErrUnknownBaseVersion`), distinct from 404s. take_over
  stays baseless — it edits the current draft by definition.
- **Gate C: REDIRECT (visuals not converged; seeds NOT ratified).** User verdict:
  "the UI looks good from a stylistic standpoint" but wants deeper **accessibility**
  and **information architecture** so the app "exudes a 'Michelin-star, agentic
  computational gastronomy, recipe development platform that cooks of all levels
  can use'". Benchmark seeds not ruled on — they remain an unratified draft in
  docs/ (nothing copied to eval/fixtures). Research fan-out (a11y audit, IA
  restructure, brand-feel references) dispatched; synthesized brief lands at
  agent_docs/2026-07-07-gate-c-redesign-brief.md for the next session. User may
  alternatively supply a design system — that would augment/override the brief.
- **2026-07-07 · Gate-C brief task 6, sanctioned additive API change (blocked ops).**
  The `proposal.blocked` SSE event and the GET `blocked` payload now additionally
  carry the held change's `ops` (`[]proposal.Op`) so the safety-hold pane can gray
  the blocked move as evidence — same additive-only precedent as the baseVersion
  entry above. Plumbed through `Outcome.Ops` / `Status.BlockedOps` / `blockedMove.ops`
  and the `proposal_blocked` event-log payload; the orchestrator captures the ops
  beside `firstBlock` (only-first-block preserved). Invariant kept per DESIGN §6.3:
  ops only — the blocked payload still never contains a `proposal` key or the
  proposal's rationale/citations/confidence (hub_test TestBlockedEmitsOnlyProposalBlocked
  still asserts no `proposal` key and passes). eval/replay ignores the unknown key,
  so events_gate_dynamics.json fixtures need no change and keep passing.
- **2026-07-07 · Vendored the evidence-screenshot tooling into `web/tools/` (reverses
  the Phase-1 "scratchpad-only tooling, not a repo dependency" call above).** The
  convergence loop recurs — the 5.4R rerun for the redesigned UI, the 5.5 restart/
  reconnect GIFs, and any future redirect pass all re-drive the same headless capture —
  and the scratchpad `phase5_shots.mjs` + its puppeteer-core copy nearly got GC'd out
  from under the next session. `web/tools/shots.mjs` (adapted to the redesigned IA:
  TrialStrip, two-level gate, renamed verbs, narrow RailTabs) + `web/tools/README.md`
  now live in-repo, with `puppeteer-core` a `web/` devDependency.
- **2026-07-07 · Gate C re-presented: visuals CONVERGED.** All 15 redirect tasks
  landed; 56-shot evidence set (23 desktop + 5 narrow × both themes) presented
  via artifact gallery; user verdict "looks good". Convergence sweep also
  surfaced + fixed two defects (SPA deep-link 301 loop in web/serve.go; narrow
  header overflow). Seed ratification asked as its own explicit decision —
  PREREGISTRATION discipline: a casual approval must not silently lock the
  benchmark set.
- **2026-07-07 · Gate C CLEARED (both decisions).** Visuals converged + all 13
  benchmark seeds ratified (bench-12 tree-nut stress seed explicitly
  confirmed via structured prompt). seeds.json committed at 0a92e5541e9d22f2f7e54e93f91ed237546cb0d6; T1
  amendment draft SHA refreshed to that commit (seeds.json exists at it, per
  the draft's own checklist). Next: 5.5 demo GIFs + README, tag phase-5-ui.
- **2026-07-07 · 6.1 fork kit; KitcheNette notice framing.** Compose ships app
  (default) + langfuse profile (verified isolated). THIRD_PARTY_NOTICES lists
  KitcheNette as "not bundled in this release" rather than attributing
  un-shipped data — v0 vendors FlavorGraph only (milestone non-goal); no
  distribution → no attribution obligation; entry flips to a real Apache-2.0
  attribution if a future release vendors it. Cost-table sources (BLS/ERS,
  public domain) added; safety rules noted as hand-authored from FSIS/CDC.
  Oracle: clean-worktree `docker compose up` + only .env served the full loop.
- **2026-07-07 · 6.2 deviations/deferrals ledger (hand-back).** Deferred:
  duplicate `proposal-heading` id in alternatives view (focus-protocol
  load-bearing); trial-pill delta summaries unwired (VersionItem carries no
  ops; `summaryOf` prop ready); gate shortcuts remappable via localStorage
  only (no UI); dashboard ~MIN segment omitted (no total-time in the model).
  Known stub limits (test-covered): near-identical alternatives; streaming/
  move-failed/reconnect visuals uncapturable. Not vendored: KitcheNette
  (notice records non-distribution). USER actions pending: log T1 amendment
  at milestone-02 start; Gate D merge decision.
- **2026-07-07 · Gate D CLEARED — merged.** User ruled "proceed to merge";
  e2e fast-forwarded into master at 30eee3e (tag phase-6-handback). Milestone
  01 shipped; milestone 02 (measure-run) now active. First milestone-02
  action is the USER's: log the T1 amendment (T1-amendment-draft.md) into
  PREREGISTRATION §9.
