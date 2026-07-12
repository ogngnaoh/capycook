# Handoff — milestone 02b (behavior-contract)

## Next session start here
**B4 loop RUNNING — 14 of 43 census fails green, 5 of 12 builder runs used,
zero regressions.** Read `b4-ledger.md` first (source of truth). Workflow
agents now run on **Sonnet** (`model: 'sonnet'` in every agent() call of
`b4-iteration.workflow.mjs`, args-overridable) after a session-limit abort
killed a gate agent mid-invocation-3. Immediate next step: **invocation 3b**
— cluster 5 typed-input-preservation was BUILT (`24e6576`) but never
verified; run one cluster whose brief tells the builder to read that
commit's diff against `b4-briefs/cluster-05.md`, fix gaps only, then gate →
oracle (cumulative 18 ids) → judges. previouslyGreen = 14 ids (ledger).
Preflight refuses without worktree `evidence/selftest-report.json` ok:true
and no later web/tools/oracle commits (currently ok:true @ 007123a — valid).

## Current state
- Green (14): A-4, A-5, A-9, B-1, B-4, B-5, C-13, C-17, D-2, E-4, H-1/7/8/9.
  Commits: 4256505, cd422df, 8093a4f, 89a5046 (+ unverified 24e6576).
  Oracle runs 001–004 (worktree numbering); gates green throughout.
- Harness check-changes (all declared + self-tested): runner dedupe +
  selftest mkdir (540a5cb), recorder watchdog (007123a).
- **B-8 folded into cluster 7** (streaming rationale): run-004 failed
  post-watchdog — six byte-identical tail frames while the renderer logged
  'Proposal ready' at 25.8s; the end-of-generation replay burst both floods
  the screencast and plausibly delays the visible handoff past ±3s.
  Cluster 7's streaming removes the burst; add recorder freshness logging
  when prepping cluster 7 (harness edit → self-test re-run then).
- Remaining clusters: 6 first-pass+suggestions · 7 streaming (B-3, G-4,
  B-10, I-2, B-8) · 8 gate semantics + C-11 wording · 9 diff repertoire +
  stub extension · 10 D-12 ⚖ + F-3 + E-3 · 11 contrast tokens · 12 viewport
  + C-26 ⚖. Then ×2 full runs (--guardrails all) for exit.

## Open concerns
- Cluster-5 work (24e6576) is UNVERIFIED until invocation 3b's oracle run.
- BC-C-11 REGENERATE wording FAIL consistent ×3 → cluster 8; check oracle
  selectors before renaming the verb.
- BC-E-3 judge FAIL has solid evidence → cluster 10 is real work.
- Builder-authored tests are diff-for-review, not verification (B5 point).
- ⚖ in force: BC-C-26 (cluster 12), BC-D-12 (cluster 10, schema/wire OK).
- Stall valve: 3 strikes parks (none ≥2 open); cap 12 builder runs (5 used).
