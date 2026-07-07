# End-to-End Build (Milestone 01) — Implementation Plan / Working Doc

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This is the milestone's working doc** (per the project's global conventions): keep
> the checklist current per commit; it is the resumption state for a cold session.
> Governing contract: `docs/superpowers/specs/2026-07-06-end-to-end-build-design.md`
> (spec §N references below). Behavior/invariants: `DESIGN.md`. Frozen methodology:
> `docs/PREREGISTRATION.md` (READ-ONLY — body and log).

**Goal:** Build CapyCook v0→v2 end-to-end in six phases on one branch (`e2e`): real
skeleton → data + deterministic services + safety gate → real DeepSeek + telemetry →
eval harness → styled UI + demo GIFs → fork kit + hand-back. Four human gates (A–D).

**Architecture:** Human-gated move/gate state machine over a versioned dish draft;
strict deterministic/generative split; single-call LLM generation with post-screen
rationale replay over SSE; append-only event log replayed by a hand-rolled eval
harness. Stub edges land in Phase 1 behind real interfaces and are swapped per phase.

**Tech Stack:** Go 1.26 (stdlib `net/http` 1.22 routing, `log/slog`),
`modernc.org/sqlite`, `sashabaranov/go-openai` (base-URL → DeepSeek), OTel-Go →
OTLP/HTTP → Langfuse; React + Vite + TS + Tailwind in `web/`.

## Global Constraints (spec §3 — every task inherits these)

- Branch **`e2e`**, never master. Commit per subsystem; `git tag phase-N-<name>` at each phase boundary.
- `go vet ./... && go test ./...` and `cd web && npm run test && npm run build` green at every subsystem boundary.
- **PREREGISTRATION.md is read-only** (body AND §9 log). Conflict → stop, hand back.
- **Never fabricate labels, gate decisions, or operator telemetry.** Synthetic test fixtures live in `internal/eval/testdata/` only — never `eval/fixtures/`.
- **No live LLM calls before Gate B.** After Gate B: `LLM_BUDGET_USD=10`, enforced in code, hard-stop + report at cap. Live tests only behind `CAPYCOOK_LIVE_TEST=1`.
- Dev prompt iteration only against `internal/llm/testdata/dev_seeds.json` — disjoint from benchmark seeds. Benchmark seeds commit to `eval/fixtures/` only after user ratification (Gate C).
- Allowed new deps: `modernc.org/sqlite`, `sashabaranov/go-openai`, OTel-Go SDK + OTLP/HTTP exporter. Anything else: note why in log.md.
- Wire enums (spec §4): verbs `accept|edit|regenerate|alternatives|redirect|take_over`; move types `seed_expand|flavor_direction|ingredient_change|technique_step|iterate_feedback|scale_servings|unit_convert|cost_recompute|nutrition_recompute`; arms `ungrounded|flavorgraph|grounded|none`; run kinds `operator|harness`.
- Keep + extend `web/src/components/{ProposalCard,GateBar,Workbench,DraftPane,SteeringPane}`; **delete** `GET /api/proposal`, `POST /api/gate`, old `api.ts` calls, and the dev state-toggle in Phase 1 Task 1.8.
- Docs discipline: first commit creates `docs/01-end-to-end/`; overwrite its `handoff.md` at every phase boundary; dated rationale lines to its `log.md`.

## Pinned contracts (single source for all tasks — spec §4)

```go
// internal/draft — the shared artifact (DESIGN §8.3 + spec §5 schema split)
type Ingredient struct {
    Name      string  `json:"name"`
    FDCID     *string `json:"fdc_id"`     // nullable — USDA resolution
    FoodOnID  *string `json:"foodon_id"`  // nullable — FoodOn resolution
    Qty       float64 `json:"qty"`
    Unit      string  `json:"unit"`
}
type Step struct {
    Text         string   `json:"text"`
    Technique    string   `json:"technique"`      // enum: saute|roast|boil|simmer|bake|grill|fry|raw|cure|ferment|can|infuse_oil|sous_vide|other
    InternalTempC *float64 `json:"internal_temp_c"` // nullable; REQUIRED by prompt for high-risk proteins
    Why          string   `json:"why"`
}
type FlavorClaim struct {
    Claim          string  `json:"claim"`
    Provenance     *string `json:"provenance"`      // nil => [unverified]
    CuisineContext string  `json:"cuisine_context"` // copies constraints.cuisine
}
type Constraints struct {
    Dietary   []string `json:"dietary"`
    Allergens []string `json:"allergens"` // FDA Big-9 enum values only
    Equipment []string `json:"equipment"`
    Skill     string   `json:"skill"`     // beginner|intermediate|advanced
    Servings  int      `json:"servings"`
    OnHand    []string `json:"on_hand"`
    Cuisine   string   `json:"cuisine"`   // enum, v0: "western"
}
type Analysis struct {
    Cost      CostAnalysis      `json:"cost"`      // per-dish + per-serving, [approximate]
    Nutrition NutritionAnalysis `json:"nutrition"` // per-serving panel (spec §5)
}
type Draft struct {
    Title           string        `json:"title"`
    Concept         string        `json:"concept"`
    FlavorRationale []FlavorClaim `json:"flavor_rationale"`
    Ingredients     []Ingredient  `json:"ingredients"`
    Steps           []Step        `json:"steps"`
    Constraints     Constraints   `json:"constraints"`
    Analysis        Analysis      `json:"analysis"`
}

// internal/proposal — diff + contract (spec §4; full DESIGN §8.2 shape)
type Op struct {
    Op    string          `json:"op"`             // add|remove|replace
    Path  string          `json:"path"`           // RFC-6901 JSON Pointer
    Value json.RawMessage `json:"value,omitempty"`
    From  json.RawMessage `json:"from,omitempty"` // old value on replace
}
type Citation struct{ Source, Ref, Date string }
type Safety struct {
    Status  string   `json:"status"` // pass|blocked
    Reasons []string `json:"reasons"`
    RuleIDs []string `json:"rule_ids"`
}
type Proposal struct {
    ID            string     `json:"id"`
    MoveID        string     `json:"move_id"`
    MoveType      string     `json:"move_type"`
    TargetFields  []string   `json:"target_fields"`
    Change        []Op       `json:"change"`
    Rationale     string     `json:"rationale"`
    Citations     []Citation `json:"citations"`
    Confidence    float64    `json:"confidence"` // deterministic moves: 1.0
    Unverified    []string   `json:"unverified"`
    Safety        Safety     `json:"safety"`
    SuggestedNext []string   `json:"suggested_next"`
}
func ComputeDiff(old, new Draft) []Op   // Go owns the diff (LLM emits full Draft)
func (d Draft) Apply(ops []Op) (Draft, error)

// internal/llm — the swappable edge (spec §4 single-call design)
type ThreadTurn struct{ Role, Text string } // role: cook|system; rebuilt from move_requested/gate_* events
type Evidence struct {
    Pairings    []grounding.Pairing    // flavorgraph + grounded arms
    Resolutions []grounding.Resolution // grounded arm only
}
type MoveRequest struct {
    Draft    draft.Draft
    MoveType string
    Steer    string
    Thread   []ThreadTurn // last 50, replayed from eventlog
    Evidence Evidence     // arm-dependent grounding block (spec §7 matrix)
}
type LLM interface {
    GenerateMove(ctx context.Context, req MoveRequest) (proposal.Proposal, error)
}

// internal/grounding
type Pairing struct{ Ingredient string; Score float64 }
type Grounding interface {
    Suggest(ingredients []string) []Pairing        // top-10 FlavorGraph
    Resolve(name string) (Resolution, bool)        // normalized exact + alias table
}
type Resolution struct{ FDCID, FoodOnID *string; Canonical string }

// internal/services
type Nutrition interface{ Compute(d draft.Draft) (draft.NutritionAnalysis, error) }
type Cost interface{ Compute(d draft.Draft) (draft.CostAnalysis, error) }
type SafetyGate interface {
    Screen(current draft.Draft, ops []proposal.Op) proposal.Safety // runs on proposals AND human edits
}

// internal/eventlog — spec §4 schema
// events(id INTEGER PK, dish_id TEXT, session_id TEXT, seq INTEGER,
//        type TEXT, payload_json TEXT, arm TEXT, run_kind TEXT, created_at TEXT)
// types: dish_created | move_requested | proposal_ready | proposal_blocked |
//        move_cancelled | move_failed | gate_accept | gate_edit | gate_regenerate |
//        gate_alternatives | gate_redirect | gate_take_over | move_auto_advanced |
//        safety_warning_overridden | branch_promoted
type Event struct{ DishID, SessionID string; Seq int64; Type string; Payload json.RawMessage; Arm, RunKind string; CreatedAt time.Time }
type EventLog interface {
    Append(ctx context.Context, e Event) error
    Replay(ctx context.Context, dishID string) ([]Event, error) // dishID "" => all
}
```

**HTTP API (spec §4; handlers in `internal/httpapi`):**
`GET /healthz` · `GET /api/dishes` (index: id, title, updated_at) ·
`POST /api/dishes {seed, constraints}` → dish + empty draft ·
`GET /api/dishes/{id}` → `{draft, state, pendingProposal?}` ·
`POST /api/dishes/{id}/move {moveType?, steer?}` → `202 {moveId}` | `409` in-flight ·
`POST /api/dishes/{id}/cancel` · `POST /api/dishes/{id}/gate {proposalId, verb, edit?, confirmOverride?}` ·
`GET /api/dishes/{id}/versions` · `POST /api/dishes/{id}/promote {versionId}`
(reassigns `current_version_id` + `branch_promoted` event) ·
`GET /api/dishes/{id}/stream` (SSE) · SPA at `/`. All mutating requests carry
`X-Session-Id` (client-minted, spec §4 session rule).

**SSE events:** `token{moveId,text}` · `proposal-ready{moveId,proposal}` ·
`proposal-blocked{moveId,reason,ruleId}` · `move-cancelled{moveId}` ·
`move-failed{moveId,reason}`. One persistent per-dish EventSource; rationale is
replayed token-cadence **after** the safety screen passes.

**Env/config (`internal/config`):** existing keys + `DB_PATH` (default
`./data/capycook.db`; container `/data/capycook.db`) · `LLM_BUDGET_USD` (default 10) ·
`CAPYCOOK_LIVE_TEST` · `CAPYCOOK_STUB_LLM` (stub mode w/ UI banner when no key).

---

## Phase 0 — session bootstrap (first commit)

- [x] **0.1** Create branch `e2e`; create `docs/01-end-to-end/milestone.md` (goal =
  spec §0 quote; slices = the six phases pointing at this plan as the working doc;
  integration notes = spec §4 contracts; exit = spec §3 oracles + Gate D),
  `docs/01-end-to-end/handoff.md` ("Next session start here: continue at the first
  unchecked box in this plan"), `docs/01-end-to-end/log.md` (empty, dated header).
  Commit: `docs(01): open milestone 01 — end-to-end build`.

## Phase 1 — Skeleton (absorbed skeleton spec §3–§6 + this spec's contracts)

- [x] **1.1 store** — Create `internal/store/{store.go,sqlite.go,migrate.go}`,
  `internal/store/store_test.go`. `Store` iface: CRUD for
  `dishes(id, seed, constraints_json, current_version_id, autonomy_dial, created_at)`,
  `versions(id, dish_id, parent_version_id, draft_json, created_at)`, events table
  (contract above). Migrations: ordered SQL gated on `PRAGMA user_version` (~40 lines,
  no deps); WAL on open; `DB_PATH` from config. TDD: open→migrate→user_version=N;
  dish/version round-trip; version chain via parent pointers; events monotonic seq
  per dish; re-open keeps data. Commit.
- [x] **1.2 draft** — Create `internal/draft/{draft.go,apply.go}` + tests. Types per
  contract; `Apply(ops)` returns new Draft (immutably), errors on bad pointer/op.
  TDD: apply add/remove/replace on ingredients + steps + scalar fields; bad path →
  error, draft unchanged. Commit.
- [x] **1.3 proposal** — Create `internal/proposal/{proposal.go,diff.go}` + tests.
  `ComputeDiff(old,new)` emits minimal ops with `From` on replace; round-trip
  property: `old.Apply(ComputeDiff(old,new)) == new` (table of cases incl. list
  insert/delete/edit). Commit.
- [x] **1.4 eventlog** — Create `internal/eventlog/{eventlog.go}` + tests on the store.
  Append assigns seq; Replay ordered; arm/run_kind persisted. Commit.
- [x] **1.5 stub edges** — Create `internal/llm/stub.go` (deterministic templated
  Proposals per move type; rationale text included; one seeded UNSAFE proposal:
  `technique:"infuse_oil"` garlic-in-oil when steer contains "garlic oil"),
  `internal/services/{nutrition_stub,cost_stub,safety_stub}.go` (safety stub blocks
  exactly the seeded case, returns `Safety{Status:"blocked", RuleIDs:["anaerobic-garlic-oil"]}`),
  `internal/grounding/stub.go` (canned pairings), `internal/telemetry/noop.go`
  (Tracer iface + no-op). All behind the pinned interfaces + table tests. Commit.
- [x] **1.6 orchestrator** — Create `internal/orchestrator/{orchestrator.go,verbs.go}`
  + tests (stub edges, in-mem store). State machine: idle→proposing→awaiting_gate→
  (accepted|blocked|cancelled|failed); single-flight per dish (second move → ErrInFlight);
  ALL verbs idempotent on proposalId (dup = no-op, no event); per-verb semantics
  spec §4 (edit/take_over → safety screen → warn requires `confirmOverride` →
  `safety_warning_overridden` event; alternatives → 2 stub generations → sibling
  versions on accept; redirect cancels + re-runs with steer joined to thread);
  accept: apply diff → recompute analysis (stub) into snapshot → new version → event;
  dial: per-dish bool default ON; deterministic move types auto-advance emitting
  `move_auto_advanced` (never gate_accept); pending proposal held in memory map;
  cancel = context cancel, discard, `move_cancelled`, nothing stored. TDD every
  transition + the races (accept-vs-cancel: first transition wins; double-accept: one
  version). Commit.
- [x] **1.7 transport** — Create `internal/transport/{sse.go,hub.go}` + tests
  (`httptest`). Per-dish hub, single-goroutine select loop (SPEC §4a pattern),
  15s heartbeat, Flush per write; rationale replayed word-by-word at ~30ms cadence
  post-screen; cancel endpoint wiring; client disconnect cleans up. Test: block case
  emits ONLY `proposal-blocked` (no tokens, no proposal payload). Commit.
- [x] **1.8 httpapi** — Create `internal/httpapi/{routes.go,handlers.go}` + tests;
  modify `cmd/server/main.go` to wire config→store→orchestrator→transport→httpapi;
  **delete** `cmd/server/api.go` stub endpoints + their tests. Full API surface per
  contract incl. `POST /promote` (pointer reassignment + `branch_promoted` event);
  status codes exact (202/409/404/400); `X-Session-Id` read onto every appended event.
  httptest coverage per endpoint incl. the 409 single-flight and gate idempotency.
  Commit.
- [x] **1.9 web workbench** — Modify `web/src/{App.tsx,api.ts,types.ts}`, create
  `web/src/screens/SeedSetup.tsx`, `web/src/components/{VersionHistory.tsx,SafetyBlock.tsx,DialToggle.tsx}`,
  extend ProposalCard/GateBar/Workbench; **delete dev state-toggle**. TS types mirror
  pinned contracts. Seed screen: typed constraints (Big-9 multiselect, cuisine enum
  fixed to western, skill select, servings number); URL-per-dish `/dishes/:id`
  (history API, no router dep) + recent-dishes list from `GET /api/dishes`;
  session-id minting (crypto-random in sessionStorage, rotated after 30 min idle,
  sent as `X-Session-Id` — this is H2's frozen "session" unit, spec §4);
  EventSource wiring + auto-reconnect + re-sync via GET; move button + steer textarea
  + suggested_next chips; all six verbs functional (edit = form over proposed values;
  take_over = draft editor; redirect = prompt; alternatives = card picker);
  inline per-field diff rendering (old struck-through, new highlighted) from ops;
  version history panel (chain list + clickable snapshot view + promote action);
  blocked state (reason + regenerate/redirect only); cancel button during proposing;
  error banner for move-failed distinct from safety block. Graybox styling only.
  Vitest: seed form validation, diff render from ops fixture, gate-bar verb dispatch,
  blocked-state affordances, EventSource message handling (mocked). Commit.
- [x] **1.10 CI + PREREG guard** — Create `.github/workflows/ci.yml`: jobs = go
  (vet+test, Go 1.26), web (npm ci+test+build, Node 22), docker build, and a guard
  step failing if `git diff origin/master...HEAD -- docs/PREREGISTRATION.md` is
  non-empty. Commit.
- [x] **1.11 Phase-1 oracle** — Create `scripts/e2e_check.sh`: drives skeleton-spec §6
  acceptance via curl against local binary AND `docker run -v capycook-data:/data`
  (create dish → move → SSE captures tokens+proposal-ready → seeded unsafe steer →
  proposal-blocked → accept safe → versions chain length 2 → restart container →
  dish + history survive). Modify `Dockerfile` (create `/data` owned by 65532,
  `VOLUME /data`) and `.env.example` (+`DB_PATH`, `LLM_BUDGET_USD`). Run script both
  modes; browser check of the workbench with screenshots saved to
  `docs/01-end-to-end/evidence/phase1/`. Overwrite handoff.md; log.md entry;
  `git tag phase-1-skeleton`. Commit.

## Phase 2 — Data + deterministic services + safety gate (spec §5–§6)

- [x] **2.1 ingredient universe** — Create `data/ingredients.csv` (~150–250 Western
  staples: name, aliases, category, big9_flags placeholder) + `data/README.md`
  provenance section. Draft via stated procedure (staple lists from named public
  sources), logged in log.md. Commit.
- [x] **2.2 USDA vendoring + nutrition** — Create `scripts/vendor_usda.py` (bulk CSV,
  Foundation primary/SR Legacy fallback, pinned release date; extracts universe rows +
  panel nutrients + foodPortion gram weights → `data/usda/{nutrients.csv,portions.csv,PROVENANCE.md}`);
  implement `internal/services/nutrition.go` (per-100g × grams; household units via
  portions; missing conversion → field-level `[unverified]` marker in
  NutritionAnalysis). Table-driven tests: known ingredient → known per-serving values
  (hand-checked fixtures); missing portion → unverified, not guessed. Commit.
- [x] **2.3 units** — Create `internal/services/units.go` + tests: metric↔US mass/
  volume; volume→mass ONLY via portions table; unknown unit → error surfaced as
  unverified. Commit.
- [x] **2.4 FoodOn + allergens** — Create `scripts/vendor_foodon.py` (foodon-base →
  ingredient→Big-9 transitive-closure CSV → `data/foodon/{allergens.csv,PROVENANCE.md}`);
  implement `internal/services/allergen.go`: declared allergens × resolved ingredients;
  **fail-closed** — unresolved ingredient + declared allergens → block reason
  "allergen status unknown for X". Tests: butter→milk closure; almond milk in nut-free
  → block; unresolved → block. Commit.
- [x] **2.5 cost** — Create `data/cost/prices.csv` (universe rows: usd_per_unit, unit
  basis, source, as_of) drafted from named public sources; implement
  `internal/services/cost.go`: pro-rated by quantity at $/100g basis (shared mass
  machinery with nutrition); missing ingredient → "unknown", excluded from total +
  footnote flag — **never $0**. Table tests. Commit.
- [x] **2.6 safety gate** — Create `data/safety/{min_temps.csv,anaerobic_lexicon.csv,PROVENANCE.md}`
  (FSIS-cited per row: poultry 74°C, ground meat 71°C, whole cuts 63°C+rest, eggs,
  fish; anaerobic technique/ingredient patterns); implement
  `internal/services/safety.go`: reads technique enum + internal_temp_c (structured,
  not keyword prose); high-risk protein with missing/low temp → block (fail-closed);
  anaerobic technique match → block; allergen check composed in. Screen() runs on the
  post-apply draft delta for proposals AND human edits (caller decides block vs
  warn-and-confirm). Table-driven test per rule row + the three DESIGN textbook cases.
  Commit.
- [x] **2.7 FlavorGraph + grounding** — Create `scripts/convert_flavorgraph.py`
  (pinned upstream commit SHA + SHA256 in `data/flavorgraph/PROVENANCE.md`; pickle →
  `data/flavorgraph/embeddings.csv`); implement `internal/grounding/{flavorgraph.go,resolve.go}`:
  pre-normalized dot-product top-k=10; Resolve = normalize (lowercase/singularize/
  strip qualifiers) + `data/aliases.csv`. Tests: known pairing fixture; resolution
  hits/misses; determinism. Commit.
- [x] **2.8 wire real services** — Modify orchestrator wiring: accept recomputes real
  analysis into snapshots; deterministic moves (cost/nutrition recompute, scale)
  compute via services with confidence=1.0 + deterministic citations; UI draft pane
  renders analysis + `[approximate]`/`[unverified]` chips (graybox). Re-run
  `scripts/e2e_check.sh`. Update evidence + handoff; `git tag phase-2-data-services`.
  Commit. **→ STOP: Gate A** — present `data/safety/*`, `data/cost/prices.csv`,
  `data/ingredients.csv` + provenance for user review. Apply redirects before
  proceeding.

## Phase 3 — Real DeepSeek + telemetry (spec §7)

- [x] **3.1 live-docs check** — WebFetch `api-docs.deepseek.com`: model id, `/beta`
  strict semantics, `json_object` caveat, pricing/context. Cosmetic drift → patch
  SPEC §2/§4c same commit + log.md line. **Structural drift → STOP (Gate B hand-back).**
  Record verified values in log.md. Commit.
- [x] **3.2 prompt pack** — Create `internal/llm/prompts/{system.tmpl,move.tmpl,evidence.tmpl}`
  + `prompts_test.go` (golden files in `internal/llm/testdata/golden/`), and
  `internal/llm/testdata/dev_seeds.json` (3–5 dev dishes, DISJOINT from benchmark).
  Template contract: cache-stable prefix (system+draft) → volatile steer suffix;
  citation/[unverified]/confidence elicitation rules; cuisine disclaimer block;
  temps required for high-risk proteins; **arm-parity: evidence block is the only
  arm-varying region**. Commit.
- [x] **3.3 deepseek client** — Create `internal/llm/{deepseek.go,budget.go}` + tests.
  Strict tool-call primary (tool schema = full Draft + rationale + citations +
  confidence + unverified + suggested_next; all-required, no additionalProperties);
  buffered `json_object` fallback w/ `DisallowUnknownFields`; 2 retries, 60s timeout;
  exhaustion → `move_failed` (never proposal_blocked); Go computes diff from returned
  Draft. Budget: usd counter from usage fields, hard-stop at `LLM_BUDGET_USD`.
  Record-replay: `internal/llm/testdata/recorded/*.json` fixtures; live recording +
  one smoke test behind `CAPYCOOK_LIVE_TEST=1`. No-key runtime → stub LLM + UI banner
  "stub mode — no model key". Tests run entirely on fixtures. Commit.
- [x] **3.4 evidence assembly (arm matrix)** — Create `internal/llm/evidence.go` +
  tests: builds Evidence per arm exactly per spec §7 matrix (ungrounded: empty;
  flavorgraph: pairings only; grounded: pairings + resolutions for citation-grounding).
  Arm comes from dish/run config; `none` for normal use = grounded behavior?  **No:**
  normal operator use runs the grounded path with `arm="none"` recorded on events
  (spec §4). Test all four. Commit.
- [x] **3.5 telemetry** — Implement `internal/telemetry/otel.go`: OTel-Go → OTLP/HTTP
  → `${LANGFUSE_HOST}/api/public/otel`, Basic auth base64(pk:sk),
  `x-langfuse-ingestion-version: 4`; spans wrap `llm` calls ONLY (domain events stay
  in eventlog — SPEC §5 no-double-tracing); `session_id`/`arm`/`move_type` attrs on
  every span; no-op without keys. Test with in-memory span exporter. Commit.
- [x] **3.6 Phase-3 oracle** — Re-run suites + `scripts/e2e_check.sh` (stub mode).
  **→ STOP: Gate B** — present live-docs verification, prompt pack, cost estimate;
  obtain DEEPSEEK + LANGFUSE keys and $10 confirmation. Then: one live smoke
  (`CAPYCOOK_LIVE_TEST=1`) driving seed→move→proposal with real model; verify one
  trace visible in Langfuse (screenshot to evidence/). Update handoff;
  `git tag phase-3-model`. Commit.

## Phase 4 — Eval harness (spec §7)

- [x] **4.1 replay metrics** — Create `internal/eval/{replay.go,rates.go}` + tests
  against synthetic fixtures in `internal/eval/testdata/`. Gate-dynamics fold: native
  verb/event distribution per move-category, `run_kind=operator` only, explicit N +
  session count (session_id boundaries); frozen-five roll-up via the spec §4 mapping
  table (`internal/eval/mapping.go`, exported as data). Three rates per PREREG §7a
  formulas over labeled-claim files. Known-fixture → known-numbers tests. Commit.
- [x] **4.2 kappa** — Create `internal/eval/kappa.go` + tests: Cohen's κ + confusion
  matrix over double-labeled subset; verify against a hand-computed 20-claim fixture.
  Commit.
- [x] **4.3 arm runner** — Create `internal/eval/runner.go` + tests (stub LLM): runs
  each benchmark seed through a fixed, versioned move script
  (`eval/fixtures/move_script.json`: N=5 moves, auto-accept policy) identically per
  arm; events tagged `run_kind=harness` + arm; exports unlabeled claims
  (structured entries: flavor_rationale[].claim + unverified[]) to
  `eval/out/claims_<arm>.jsonl` (gitignored). Test: 3-arm dry run on stub emits
  structurally-complete claims + a results table with all-zero rates (**re-homed
  "empty baseline" criterion**). Commit.
- [x] **4.4 cmd/eval CLI** — Create `cmd/eval/main.go`; Makefile `eval-*` targets.
  Subcommands: `run --arm=all|<arm> --live`, `replay`, `rates`, `kappa`,
  `report` (JSON + paste-ready markdown table incl. explicit Ns and the frozen-five
  derivation note). httptest-free CLI tests via package funcs. Commit.
- [x] **4.5 benchmark seeds (DRAFT — not in eval/fixtures yet)** — Create
  `docs/01-end-to-end/proposed-benchmark-seeds.json`: 12–15 Western dish seeds +
  constraints, drafted by stated procedure (documented inline); expected-claim
  arithmetic note (~200 total across arms). **Ratified at Gate C, only then copied to
  `eval/fixtures/seeds.json` + CHANGELOG entry.** Commit.
- [x] **4.6 labeling kit** — Create `eval/fixtures/{README.md,CHANGELOG.md}` updates:
  label schema (claim_id, arm, dish, text, source, label_r1, label_r2), CSV
  export/import via `cmd/eval export-labels|import-labels`, seeded stratified 15–20%
  double-label sampler. Hygiene rule stated in README (no synthetic data here, ever).
  Tests on synthetic files in `internal/eval/testdata/`. Commit.
- [x] **4.7 README methodology + T1 draft** — Modify `README.md`: methodology section
  (from PREREG, linked not restated), **empty results table** (structure only, "no
  data yet" banner), fork/setup quickstart. Create
  `docs/01-end-to-end/T1-amendment-draft.md`: the dated §9 entry text pinning
  instrument SHAs (prompts, seeds, extraction, safety rules, runner, matrix, verb
  mapping) — **for the USER to log at milestone-02 start; the builder never edits
  PREREGISTRATION.md.** Re-run suites; update handoff; `git tag phase-4-eval`. Commit.

## Phase 5 — Styled UI + demo materials (spec §8) — Gate C

- [ ] **5.1 design tokens** — Create `web/src/styles/tokens.css` + Tailwind config
  mapping: Acne structure (12px/0.3px uppercase UI, radius 0, hairline #F2F2F2/
  #C2C2C2 borders, no shadows, Inter + IBM Plex Mono, 5px-rhythm spacing) +
  Anthropic warm layer replacing the vibrant tier (ivory/oat surfaces ~#FAF9F5/#F0EFEA,
  slate text ~#191919, terracotta accent ~#CC785C fills/active — exact values ported
  from `/Users/hoangngo/Documents/personal-projects/acne-design-system/tokens.css`
  then re-tuned); Acne semantic status set kept; light + dark themes via CSS vars.
  Commit.
- [ ] **5.2 signature components** — Restyle diff view (old struck/new highlighted,
  per-field inline), gate bar (ghost buttons, fill-on-hover, uppercase), citation/
  `[unverified]`/confidence chips (square, semantic tints). Vitest snapshots update.
  Commit.
- [ ] **5.3 screens + flows** — Restyle seed intake, workbench, version history,
  blocked state, dial toggle, error/empty/reconnect states; **add post-cook flow**
  ("I cooked this" on a version → feedback textarea → POST move
  `{moveType:"iterate_feedback", steer:feedback, baseVersion:cookedId}` → one
  re-proposal against that version; iteration entries render in the thread). Commit.
- [ ] **5.4 convergence loop** — Iterate: run app → browser screenshots of every
  screen/state → self-critique against DESIGN-SYSTEM.md's Do/Don't (90% neutral,
  one accent block max, no shadows/rounding, 12px resting size) → refine → repeat
  until self-consistent. Save final screenshots to evidence/phase5/. **→ STOP:
  Gate C** — present screenshots + ratify benchmark seeds (task 4.5 → copy into
  `eval/fixtures/` + CHANGELOG). Loop on redirects until user calls it converged.
- [ ] **5.5 demo GIFs + full README** — Record GIFs via browser automation: (1) seed →
  streaming move → accept → history; (2) safety block on garlic-oil steer;
  (3) restart-survival; (4) post-cook iterate. Save to `docs/media/`, embed in
  README. Complete README: related-work positioning, self-host honesty note, safety
  disclaimer, demo script walkthrough. `git tag phase-5-ui`. Commit.

## Phase 6 — Fork kit + hand-back (Gate D)

- [ ] **6.1 fork kit** — Create `docker-compose.yml` (app + volume; optional
  `langfuse` profile with its self-host stack), `DEPLOY.md` (fork → .env → compose up;
  platform notes), `THIRD_PARTY_NOTICES.md` (FoodOn CC-BY attribution, FlavorGraph/
  KitcheNette Apache-2.0, USDA CC0). Oracle: `docker compose up` from clean checkout
  + only `.env` serves the full loop. Commit.
- [ ] **6.2 evidence + hand-back** — Re-run ALL phase oracles (suites, e2e script
  local+container, eval dry-run, compose check); assemble
  `docs/01-end-to-end/evidence/README.md` (per-oracle outputs); final handoff.md
  ("Next: user reviews → merge e2e → master; then milestone 02: log T1 amendment,
  operator sessions, labeling campaign"); log.md deviations/deferrals list.
  `git tag phase-6-handback`. Commit. **→ STOP: Gate D — do not merge.**

---

## Notes / deferrals (append as they arise)

- FoodPuzzle proxy: deferred to P1 — user logs the §9 amendment at T1 (spec §1.10).
- Compare-variations UI, live retrieval, sandbox, explainer: milestone 03 (v3).
- Multi-client concurrency: out of scope, last-write-wins documented (spec §4).
