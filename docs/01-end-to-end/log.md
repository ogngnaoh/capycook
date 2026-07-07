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
