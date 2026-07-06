# End-to-End Build — Design Spec (milestone 01)

> Build the complete CapyCook v0→v2 system in one phased, autonomously-run unit on
> verification rails: skeleton → data + deterministic services + safety gate → real
> DeepSeek → eval harness → styled UI + demo materials. Four risk gates are the only
> mandatory human stops. The autonomous terminus is "everything the human measurement
> campaign needs, ready to execute" — never the measurement itself.

| | |
|---|---|
| **Status** | Approved (brainstorming, 2026-07-06) — awaiting spec review before the build |
| **Type** | System design spec (whole-app end-to-end build) |
| **Governed by** | `DESIGN.md` v0.4 (behavior/invariants) · `docs/PREREGISTRATION.md` (frozen; read-only body) · `docs/SPEC.md` (stack) |
| **Absorbs** | `2026-07-03-strong-walking-skeleton-design.md` §3–§6 as Phase 1 (its §7/§9 doc-timing contradiction is resolved here: milestone docs are created at build **start**) |
| **Supersedes (build order)** | The skeleton-only milestone mapping; the granular S0.2→S0.3 sequence; SPEC §6 / DESIGN §15 **sequencing** (their exit criteria stand and are re-homed per §2) |

Precedence rule: for build **sequencing**, this spec wins; for **behavior and
invariants**, DESIGN.md wins; for **eval methodology**, PREREGISTRATION.md wins and its
body is never edited — conflicts stop the build and hand back.

## 1. Decisions locked this session (2026-07-06)

1. **Scope:** full v0→v2 in one phased build (not skeleton-only).
2. **Human gates — risk-only:** (A) safety-rule + vendored-data review · (B) real-API
   enablement (key + spend consent) · (C) visual/demo review · (D) master merge.
   Everything else is oracle-gated and outcome-reviewed (§3).
3. **DeepSeek spend cap:** $10 for the whole build, code-enforced (`LLM_BUDGET_USD`).
4. **Benchmark arm runs:** scripted arm runner (fixed seeds × fixed move script,
   identical across arms); H2 gate telemetry comes only from the author's live sessions.
5. **Deployment:** local-only. P0-11 is re-scoped: fork-friendly open-source repo +
   docker-compose + DEPLOY.md runbook + **demo GIFs/video for reviewers** instead of a
   hosted live demo. (DESIGN §11/§15 "deployed demo/live demo" is amended by this spec.)
6. **UI design language:** the Acne design system (`~/Documents/personal-projects/acne-design-system`)
   provides structure (12px uppercase UI, square corners, hairline borders, no shadows,
   Inter); **Anthropic's palette replaces the vibrant tier** (ivory/oat surfaces,
   book-cloth terracotta accent, light + dark themes); Acne's semantic status set kept.
   Frontend is built via a convergence loop (§8) judged at Gate C.
7. **Langfuse:** Cloud free tier for dev/eval — the user creates the project and
   provides `LANGFUSE_*` keys at Gate B alongside the DeepSeek key; repo also ships a
   self-host docker-compose + docs. SPEC §5's "demo uses self-hosting" wording amended
   to "self-hostable; author's runs use Langfuse Cloud".
8. **License:** MIT (LICENSE at root; per-asset licenses travel with vendored data;
   THIRD_PARTY_NOTICES.md).
9. **Instrument freeze (T1):** prompts, benchmark seeds, claim-extraction code, safety
   rules, arm driver, toggle matrix, and verb mapping are pinned by commit SHA in a
   dated PREREGISTRATION §9 amendment entry **before any counted run**. The builder
   drafts the entry; the **user** executes T1 at milestone-02 start. Dev prompt
   iteration is allowed only against dev seeds disjoint from the benchmark set.
10. **FoodPuzzle proxy:** deferred to P1 via a dated §9 amendment logged at T1
    (FlavorDB-derivation license check + LLM-judge machinery are out of v0 scope).

## 2. Milestone restructure + pre-launch hygiene

New `docs/milestones.md` index (applied before the build session):

```
00. scaffold           — shipped (rescoped 2026-07-06: S0.1 + S0.4 shipped; S0.2/S0.3
                          re-homed into milestone 01; original v0 exit criterion
                          re-homed to milestone 01 phases 4–5)
01. end-to-end-build   ← active  (this spec; docs/01-end-to-end/)
02. measure-run        — planned (human-led: T1 freeze, operator sessions, labeling
                          campaign + second labeler, κ, results table, README results)
03. depth              — planned (v3: live-retrieval 4th arm, branch-compare, sandbox,
                          technique explainer, full autonomy dial)
```

**Pre-launch hygiene (this session, on master):**
- Rewrite `docs/milestones.md` as above; amend `docs/00-scaffold/milestone.md` exit
  criteria to what shipped (the "empty baseline" and "one replayable traced event"
  criteria are re-homed to milestone 01 phases 3–4); overwrite
  `docs/00-scaffold/handoff.md` → "Next session start here: execute the goal prompt in
  this spec (§10) on branch `e2e`".
- Re-key project `CLAUDE.md` to milestone-neutral wording ("first real-DeepSeek phase",
  not "milestone 01"); the ⚠ verify-before-build gotcha keys to Phase 3.
- Add dated supersession notes to SPEC §6 and DESIGN §15 ("build order superseded by
  the end-to-end spec (2026-07-06); exit criteria stand").
- Patch two stale DESIGN lines that contradict locked decisions: §9.5's
  "grounded-mischaracterized counts FOR" (PREREG §7a governs: neither-for-nor-against)
  and §8.7 bullet 1's "mandatory safety-citation or refusal" (locked decision #3:
  hard-block in v0).
- Annotate DESIGN §8.6's "user profile (… taste history)" line as P1+/R2-scoped;
  v0 persists constraints per-dish only.
- Add `LICENSE` (MIT) + a root `README.md` stub (the §17 pitch verbatim + status banner
  + pointers to DESIGN/SPEC/PREREGISTRATION; a dated note that PREREGISTRATION.md
  satisfies DESIGN §15's pre-run README requirement).
- Make `.env` actually load: `-include .env` + `export` in the Makefile (no new deps).
- Flip the skeleton spec's status row to "Absorbed into the end-to-end spec (2026-07-06)".

## 3. Execution model — phases, gates, rails

One branch **`e2e`** off master; never build on master. Tag at each phase boundary
(`phase-1-skeleton`, …). Single merge to master at Gate D. Commit per subsystem.
TDD throughout; `go vet ./... && go test ./...`, `npm run test`, `npm run build` green
at every subsystem boundary.

**Resumption state (first commit of the session):** create `docs/01-end-to-end/`
(milestone.md + working doc with a per-phase checklist). Keep the checklist current per
commit; overwrite `docs/01-end-to-end/handoff.md` at every phase boundary; dated
rationale lines to `log.md`. A context break or session split must resume from docs +
git alone.

**Outcome-review waiver (conscious, per the user's global conventions):** this build is
gated on the named per-phase oracles and reviewed at the four gates by **outcome**, not
line-by-line diff review. Tests written during the span are part of the diff; the
external anchors are the pre-approved acceptance criteria below, the user-reviewed data
files (Gate A), and the user-driven exercises at Gates C/D.

| Phase | Contents | Oracle (pre-named) | Gate |
|---|---|---|---|
| **1. Skeleton** | Skeleton spec §3–§6 absorbed: store/eventlog/draft/proposal/orchestrator/transport/HTTP API/workbench (graybox-functional), stub edges — with §4–§6 contracts of this spec baked in. `DB_PATH` env (default `./data/capycook.db`; `/data/capycook.db` in-container, `VOLUME /data` owned by the nonroot uid). Minimal CI (vet+test+web+docker; PREREG-body guard). Migrations: hand-rolled `PRAGMA user_version` steps. | Scripted API-level e2e of skeleton-spec §6 acceptance + browser-driven UI check w/ screenshots; suites green; local binary **and** container (with a mounted volume) serve the loop; restart-survives in both. | — |
| **2. Data + services + safety** | Ingredient universe; vendor USDA/FoodOn/FlavorGraph + cost table; real scaling/nutrition/cost/allergen services; real safety-gate rules (§6). | Table-driven fixture tests against the reviewable data files; FSIS-cited rule tests; seeded garlic-oil case blocks; allergen fail-closed cases pass. | **A** — user reviews safety rules + data files (provenance-cited data, not code) |
| **3. Real DeepSeek + telemetry** | Live-docs verification (§7 protocol) → llm impl (strict tool-calling primary, buffered `json_object` fallback), prompt pack, token accounting, record-replay fixtures. Real OTel-Go → OTLP/HTTP → Langfuse wiring (spans on llm calls only; `session_id`/`arm`/`move_type` on every span; domain events stay eventlog-only per SPEC §5). | Contract tests replay recorded fixtures; one opt-in live smoke (`CAPYCOOK_LIVE_TEST=1`) within budget; budget hard-stop test; one real trace visible in the Langfuse project (satisfies the re-homed "replayable traced event" criterion). | **B** — user provides DeepSeek + Langfuse keys, confirms $10 cap (and prompt pack is presented for review) |
| **4. Eval harness** | `cmd/eval` CLI; scripted arm runner; benchmark seeds drafted for ratification; labeling files + κ/confusion-matrix; README methodology + empty results table; T1 amendment text drafted. | Harness replays synthetic fixture event logs to known metrics; dry-run of all 3 arms on the stub LLM emits a structurally-complete table (satisfies the re-homed "empty baseline" criterion); κ verified against a hand-computed fixture. | (benchmark seeds ratified at Gate C) |
| **5. Styled UI + demo** | Design-language port; all §8 surfaces; convergence loop; demo GIFs; full README draft. | Suites + build green; screenshot self-critique vs DESIGN-SYSTEM.md rules; then the human judgment at the gate. | **C** — user judges visuals/GIFs (and ratifies benchmark seeds), redirects until converged |
| **6. Hand-back + fork kit** | docker-compose (app; optional Langfuse self-host stack) + `DEPLOY.md` runbook; `THIRD_PARTY_NOTICES.md` finalized; verification evidence assembled; docs/handoff finalized; deviations + deferrals reported. | All prior oracles re-run green (local + container); `docker compose up` serves the loop from a clean checkout with only `.env` provided. | **D** — user reviews outcome, merges to master |

**Hard rails (verbatim in the goal prompt):**
- Never modify `docs/PREREGISTRATION.md` (body **or** log). On any conflict between it
  and implementation reality: stop, hand back.
- Never fabricate, simulate, or pre-fill labels, gate decisions, or operator telemetry.
  Synthetic test fixtures live only in `internal/eval/testdata` — never `eval/fixtures`.
- Stop-line (§7 of the eval phase): the session ends with unlabeled outputs exported
  labeling-ready. Milestone 02's measurement work is human-led.
- No real LLM calls before Gate B; after it, `LLM_BUDGET_USD=10` is enforced in code.
- Dev prompt iteration only against dev seeds disjoint from benchmark seeds.

## 4. Domain contracts

**Move taxonomy** (frozen enum; feeds PREREG H2's per-move-category reporting):
creative — `seed_expand`, `flavor_direction`, `ingredient_change`, `technique_step`,
`iterate_feedback`; deterministic — `scale_servings`, `unit_convert`, `cost_recompute`,
`nutrition_recompute`. Every move/event carries its type; eval reports fine-grained +
the deterministic/creative roll-up.

**Verb → frozen-category mapping:** the state machine's verbs are
`accept · edit · regenerate · alternatives · redirect · take_over` (wire values;
`take-over` in prose) plus `cancel` and `blocked` events. PREREG froze
`accept/edit/regenerate/reject/redirect`. The eval reports the **native** distribution
and derives the frozen five as a stated roll-up (`cancel`→reject; `alternatives`,
`take_over`, `blocked`, `auto_advanced` as additional labeled rows). Mapping table
lives beside the eval code; recorded in the T1 amendment entry.

**Proposal contract — full DESIGN §8.2 shape from Phase 1** (stub-filled until Phase 3):
`target_fields`, `change`, `rationale`, `citations[{source, ref, date}]`, `confidence`,
`unverified[]`, `safety{status: pass|blocked, reasons[]}`, `suggested_next[]`.
TS types mirror it. (The skeleton spec's reduced shape is superseded.)

**Diff format:** the LLM emits a **complete proposed DishDraft** under the strict
all-required tool schema; the `proposal` package **computes the canonical diff** —
RFC-6902-style ops `{op: add|remove|replace, path (JSON Pointer), value, from?}`.
`draft.Apply(diff)` produces the new version. Steps carry a **`technique` enum** and
optional **`internal_temp_c`** — the safety gate's structured detection surface.

**Single-call generation:** `rationale` is a field of the strict schema. Flow: extract
complete Proposal → deterministic safety screen → only then replay rationale to the UI
as a token-cadence SSE stream, then `proposal-ready`. No second call, no
proposal/rationale disagreement, and blocked content never reaches the client: a block
emits only `{reason, ruleId}` (blocked state enables regenerate/redirect). This
implements DESIGN §6.3's "only rationale streams" at the UI level while honoring
"blocked proposals never arrive".

**SSE protocol:** `POST /move` → `202 {moveId}` (409 if a move is in flight); one
persistent per-dish `EventSource` opened at workbench mount; events:
`token{moveId,text}`, `proposal-ready{moveId,proposal}`, `proposal-blocked{moveId,reason,ruleId}`,
`move-cancelled{moveId}`, `move-failed{moveId,reason}`. Cancel button replaces the gate
bar during *proposing*. Client auto-reconnect; state re-synced via `GET /dishes/{id}`.

**Concurrency & idempotency:** strict single-flight per dish (second `POST /move` →
409). **Every** gate verb is idempotency-keyed on proposalId — duplicates are no-ops
(a double-clicked regenerate must not be two paid calls). Verb-vs-cancel races resolve
by state machine (first transition wins). Multi-client is out of scope, documented.

**Verb semantics (per-verb, minimal, R2-respecting):** `accept` → apply diff, new
version, recompute analysis into the snapshot; `edit` → user modifies proposed values →
safety warn-and-confirm (below) → edited accept, new version; `regenerate` → pure
re-sample, no rejection memory (R2 deferral holds); `alternatives` → 2 parallel
generations → 2 proposal cards → accepting one creates a **sibling version** (same
parent); `redirect` → steer text joins the thread, in-flight move cancelled, fresh
move; `take_over` → user edits the draft directly → warn-and-confirm → synthetic diff,
new version.

**Branching (v0-minimal):** no branches table. Sibling versions = branches;
`dishes.current_version_id` is the trunk pointer; "promote" = a gate action reassigning
it + a `branch_promoted` event. Compare UI stays a labeled P1 placeholder.

**Safety on human-authored writes (asymmetric):** agent proposals **hard-block**;
`edit`/`take_over` payloads are screened and get **warn-and-confirm**, recorded as a
`safety_warning_overridden` event. README states the scope plainly.

**Move initiation & steering:** "Propose a move" button + optional steer textarea +
`suggested_next` chips; `POST /move {moveType?, steer?}`. Steer is persisted in
`move_requested` event payloads — the steering thread is reconstructed by replay
(satisfies DESIGN §8.3 verbatim persistence with no new table).

**Deterministic moves:** initiated by draft-pane controls (servings stepper, recompute
button) **and** auto-enqueued by the orchestrator after ingredient-touching accepts.
Autonomy dial = per-dish boolean, **default ON**, header toggle; dial state recorded on
gate events; auto-advances append `move_auto_advanced` (never conflated with accepts).
Deterministic proposals carry `confidence = 1.0` + deterministic citations (FDC ids,
cost-table version).

**Pending proposal:** held in server memory; `GET /dishes/{id}` returns
`{draft, state, pendingProposal?}`; survives refresh, lost on restart (consistent with
no-store-pre-accept).

**Events schema:**
`events(id, dish_id, session_id, seq, type, payload_json, arm, run_kind, created_at)`
— `run_kind ∈ {operator, harness}`; `arm ∈ {ungrounded, flavorgraph, grounded, none}`.
H2's "session" = an operator sitting: a session id is minted per workbench visit and
rotates after 30 min idle. `move_failed` is distinct from `proposal_blocked` (parse/
retry exhaustion never pollutes safety or gate-dynamics metrics).

**analysis{cost, nutrition} lifecycle:** recomputed inside every accept and stored in
the immutable snapshot (self-contained versions); explicit `*_recompute` moves cover
table updates.

## 5. Data foundation (Phase 2)

**Ingredient universe:** curated Western pantry vocabulary, **~150–250 staples**,
checked in as the canonical CSV (`data/ingredients.csv`). It bounds the USDA rows,
FoodOn extraction, and cost table. Builder drafts; user spot-reviews at Gate A.

**USDA (nutrition, authoritative):** Foundation Foods primary + SR Legacy fallback;
bulk CSV pinned by release date; vendor rows for the universe only. Nutrient panel:
calories, protein, fat, sat-fat, carbs, fiber, sugar, sodium — per serving via
per-100g × gram mass. **FDC foodPortion gram weights vendored** for household-measure
conversion; a missing conversion renders that line `[unverified]`, never guessed.

**FoodOn (identity + allergens):** offline preprocessing (checked-in script) →
flat ingredient→allergen-class **transitive-closure CSV**; Go reads only the table.
`constraints.allergens` = **FDA Big-9 multiselect** (typed at seed intake).
**Fail-closed:** allergens declared + ingredient unresolved → block with
"allergen status unknown for X".

**Entity resolution:** schema carries **`fdc_id` and `foodon_id`, both nullable**
(one field for two vocabularies was a latent bug). Matching = normalized exact match
(lowercase, singularize, strip qualifiers) + curated alias table. Strictly
deterministic; no-match → no id → `[unverified]` nutrition + the allergen rule above.

**Cost table (`[approximate]`, NOT USDA):** builder drafts a universe-sized USD table
from named public sources with per-row source + as-of date; user spot-reviews at
Gate A. Missing ingredient → "unknown", excluded from the total with a visible
footnote — never $0.

**FlavorGraph:** vendor the converted Go-native artifact (CSV/gob) + provenance
(upstream repo URL, commit SHA, SHA256) + the one-shot converter script. Top-k=10
pairings into context. KitcheNette: out of v0.

**Cuisine:** `constraints.cuisine` enum, default `western` (v0 UI offers Western);
`cuisine_context` copies it; static contested-signal disclaimer template. The Western
restriction is fixture/demo **curation only** — no runtime enforcement.

**Licensing mechanics:** per-asset LICENSE + provenance files under `data/<asset>/`;
`THIRD_PARTY_NOTICES.md`; FoodOn's CC-BY attribution in the README.

## 6. Safety gate (Phase 2, Gate A)

Rules are **data files with per-rule provenance**, drafted by the builder from primary
sources and reviewed by the user at Gate A:
- **Min cook-temps** (USDA FSIS): poultry 74 °C/165 °F; ground meat 71 °C/160 °F; whole
  cuts 63 °C/145 °F + rest; eggs; fish — per-rule FSIS citation column.
- **Anaerobic-preservation lexicon:** garlic/herb-in-oil, room-temperature anaerobic
  holds, home canning, curing, vacuum holds outside temp control, etc.
- **Allergen mapping:** Big-9 classes over the FoodOn-derived closure table.

**Detection is structured, fail-closed:** the gate reads the `technique` enum +
`internal_temp_c`; prompts require temps for high-risk proteins; a high-risk protein
with **no stated temp is itself a block reason**. Hard-block only in v0 (locked
decision #3). The gate runs in **every** eval arm (§7). Table-driven tests per rule.

## 7. LLM integration (Phase 3) + eval (Phase 4)

**Verify-before-build protocol:** at Phase 3 start the builder re-checks model id,
`/beta` strict-mode semantics, `json_object` caveat, and pricing against live
`api-docs.deepseek.com`. **Cosmetic drift** (pricing, figures): proceed, patch SPEC
§2/§4c in the same commit, dated line in log.md. **Structural drift** (model id
absent/renamed, strict tool-calling unavailable): stop at Gate B and hand back — model
substitution is the user's call.

**Prompts:** git-versioned Go templates in `internal/llm/prompts/` with golden-file
tests; Langfuse mirror optional and read-only. **Arm-parity rule:** identical templates
except the grounding-evidence block. Cache-friendly ordering (stable system+draft
prefix, volatile steer suffix). Context assembly: system + current draft JSON +
constraints + steering thread (last 50 turns) + arm-dependent evidence block + cooked-
version feedback for `iterate_feedback` moves. No rejected-proposal replay (R2).

**Failure policy:** 2 retries on malformed output; 60 s per-call timeout;
extraction-ok/rationale-empty → degraded success with a retry affordance; exhaustion →
`move_failed`. Missing key → **stub mode with a visible banner** (fork-friendly);
usage recorded per call; `LLM_BUDGET_USD` hard-stop.

**Grounding-toggle component matrix (per arm):**

| Component | ungrounded | flavorgraph-only | grounded |
|---|---|---|---|
| Safety gate + allergen check | on | on | on |
| Deterministic analysis (cost/nutrition on draft) | on | on | on |
| FlavorGraph pairings in LLM context | — | on | on |
| USDA/FoodOn claim-grounding (citations, `[unverified]` marking, resolution into context) | — | — | on |

"Never let the model do arithmetic" holds in all arms; the toggle governs **what the
model sees and cites**. The flavorgraph→grounded contrast isolates the deterministic
citation-grounding path (PREREG §8 Rule 1). Matrix is pinned at T1.

**Eval harness:** `cmd/eval` with `run --arm|--all`, `replay`, `rates`, `kappa`,
`report` (JSON + paste-ready markdown); `make eval` targets. **Scripted arm runner:**
each ratified benchmark seed runs a fixed, versioned move script (auto-accept verb
policy) identically across arms; events carry `run_kind=harness` and are excluded from
H2. **Benchmark seeds:** builder drafts 12–15 Western dish seeds + constraints via a
stated procedure; committed to `eval/fixtures` only after user ratification. "~200
claims" = **~200 total across arms** (matches the 30–40 double-label arithmetic);
recorded in the fixtures README. **Claim unit = structured entries**
(`flavor_rationale[].claim` + `unverified[]`); scoping stated in the writeup.
**Labeling:** git-tracked JSONL in `eval/fixtures` (claim, arm, dish, text, source,
label_r1, label_r2), CSV export/import for spreadsheets; double-label subset = seeded
random 15–20% stratified per arm; κ + confusion matrix computed by `cmd/eval`.

## 8. Frontend + demo materials (Phase 5, Gate C)

**Design language:** port the Acne system's structural tokens; Anthropic warm layer
replaces the vibrant tier (ivory/oat surfaces, slate text, terracotta accent; light +
dark themes); semantic status set kept. Tailwind config carries the tokens; the three
signature components — **diff view**, **gate bar** (six verbs + cancel), **citation /
`[unverified]` / confidence chip** — follow DESIGN-SYSTEM.md's rules (square, hairline,
12px uppercase UI, no shadows).

**Surfaces:** seed intake (typed constraints incl. Big-9 multiselect + cuisine enum);
two-pane workbench (draft + steering, streaming rationale, inline per-field diff
rendering from the RFC-6902 ops); version-history panel (read-only chain list +
clickable snapshot view; sibling/branch indicator + promote action); safety-blocked
state (reason + regenerate/redirect); autonomy-dial toggle + collapsed
"auto-applied" entries; **post-cook flow** ("I cooked this" on a version → feedback →
one re-proposal against that exact version — P0-8); error/empty/reconnect states
(`move_failed` banner distinct from safety block); URL-per-dish routing
(`/dishes/:id`) + a minimal recent-dishes list (adds `GET /api/dishes` — flagged API
addition). Old stub endpoints (`GET /api/proposal`, `POST /api/gate`), `api.ts`'s old
calls, and the dev state-toggle are **deleted**; ProposalCard/GateBar/Workbench kept
and extended.

**Convergence loop:** build → screenshot via browser tooling → self-critique against
DESIGN-SYSTEM.md → refine; iterate until self-consistent, then Gate C: the user judges
screenshots/GIFs and redirects until converged.

**Demo materials:** GIFs of the main flows (seed → move → streaming → safety block →
accept → history → restart-survives), recorded via browser automation, embedded in the
README; plus a scripted walkthrough doc. **Full README** (methodology-first, empty
results table, related-work positioning, self-host honesty note, safety disclaimer,
fork/setup instructions) drafted in Phase 5; prose reviewed at Gate D.

## 9. Non-goals

No hosted/live deployment (fork-first; runbook only). No human labeling, operator
telemetry, or counted eval runs (milestone 02, human-led). No FoodPuzzle in v0
(deferred at T1 by amendment). No live-literature retrieval, branch-compare UI, flavor
sandbox, technique explainer, or per-capability dial (P1/v3). No auth/multi-user. No
user-profile entity. No KitcheNette. No merge/DAG branching. No NHSTs anywhere.

## 10. Goal prompt (paste-ready — for the build session)

> **Goal: build CapyCook end-to-end (milestone 01) in one phased autonomous run, on rails.**
>
> Read first, in order: this spec (`docs/superpowers/specs/2026-07-06-end-to-end-build-design.md`),
> the absorbed skeleton spec (`…/2026-07-03-strong-walking-skeleton-design.md` §3–§6),
> `DESIGN.md` §6–§9 + §11, `docs/SPEC.md`, `docs/PREREGISTRATION.md` (READ-ONLY),
> `CLAUDE.md`, the implementation plan under `docs/superpowers/plans/`, and the design
> system at `/Users/hoangngo/Documents/personal-projects/acne-design-system`
> (DESIGN-SYSTEM.md + tokens.css) when Phase 5 begins.
>
> Execute the six phases of spec §3 in order, on branch `e2e` (never master), TDD per
> subsystem, commit per subsystem, tag per phase, all suites green at each boundary.
> First commit: create `docs/01-end-to-end/` (milestone.md + working doc with the
> per-phase checklist) and apply the milestone-index flip if not already applied. Keep
> the checklist current; overwrite handoff.md at each phase boundary.
>
> **Stop and wait for the human at the four gates:** (A) safety rules + vendored data
> files, (B) before the first real DeepSeek call — present the live-docs verification
> result, the prompt pack, and the cost estimate; obtain the key and the $10 cap,
> (C) visuals/demo GIFs, (D) before merging to master.
>
> **Hard rails:** never edit `docs/PREREGISTRATION.md` (any conflict → stop, hand
> back); never fabricate labels/telemetry (synthetic fixtures only in
> `internal/eval/testdata`); the eval stop-line is unlabeled, labeling-ready outputs;
> no live LLM calls before Gate B and `LLM_BUDGET_USD=10` after it; dev prompts iterate
> only against dev seeds disjoint from benchmark seeds; benchmark seeds commit only
> after user ratification; structural DeepSeek-API drift halts Phase 3.
>
> When done: verification evidence per phase oracle, deviations/deferrals reported,
> handoff.md overwritten, T1 amendment text drafted (not logged). Do not auto-merge.
