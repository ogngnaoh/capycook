# Milestone 02a — Frontend IA Redesign (Direction A, "Line of Development")

**Goal** — Rebuild the web frontend's IA around the cook's job (timeline spine · dish stage · intent-first initiation · gate-as-culinary-decision) per the imported Claude Design prototype, with zero backend/API change.

**Scope**
- Implement Direction A from `agent_docs/design/CapyCook-Redesign.dc.html` (+ `BUILD-SPEC.md`) in `web/`.
- Token palette swap (cc set), intake restyle, timeline spine, dish card w/ inline diff, mode-based gate bar, intent bar (auto move-type), cook/tasting flow, state cards, technical view in header, responsive narrow layout.
- Preserve every §9 non-negotiable of `agent_docs/2026-07-07-claude-design-frontend-redesign-brief.md` (gate, six verbs, safety hold + 409, honesty layer, streaming, a11y bar).

**Non-goals**
- Direction B ("Cook's Notebook") — not built.
- Any change under `internal/`, `cmd/`, `web/src/api.ts`, `web/src/types.ts`.
- Persisting cook notes server-side (timeline cook markers stay session-local, as the thread is today).
- Bundled webfonts (fallback stacks stay).

**Slices** (working doc for all four: `docs/superpowers/plans/2026-07-07-frontend-ia-redesign-direction-a.md`)
- S1 — tokens + intake (plan Tasks 1–2) — shipped
- S2 — timeline + dish card (Tasks 3–5) — shipped
- S3 — gate + state cards + intent (Tasks 6–8) — shipped
- S4 — workbench integration + a11y/evidence (Tasks 9–10) — shipped (2026-07-08; evidence in `evidence/`, 26/27 states — `proposing` is unobservable in stub mode because the stub resolves moves in milliseconds)

**Integration notes**
- `Workbench.tsx` wire logic (SSE, resync, runGate/409, promote, dial) is kept verbatim; only presentation swaps. `mergeDiff` powers the on-dish diff; empty `moveType` = server-side auto classification (existing contract).
- Deliberate field omissions to disclose: `Citation.date` not rendered (chips show source·ref); per-version move-type slugs unavailable on the wire (`VersionItem` carries none) so timeline tech view shows ver ids only.
- Deletes `TrialStrip/SteeringPane/DraftPane/ProposedDraftView/SafetyBlock/RailTabs/VersionHistory/ProposalCard/DiffMark` once assertions are re-homed.

**Exit criteria**
- `cd web && npx tsc -b && npx vitest run` green; `make test` green.
- Live walk of the full hero loop (seed → develop → gate → cook → rework → alternatives → safety hold → 409) in stub mode, both themes, wide + narrow, keyboard-only — evidenced by screenshots in `evidence/`.
- Every §9 item demonstrably present (checklist in the plan's Task 10).
