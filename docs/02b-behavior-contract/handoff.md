# Handoff — milestone 02b (behavior-contract)

## Next session start here
**B4 loop RUNNING on Sonnet workflow agents — 28 of 43 census fails green,
9 of 12 builder runs used, THE FOUNDING FINDING (BC-I-2) PASSES.** Read
`b4-ledger.md` first (source of truth). Next: **invocation 6** = cluster 9
diff repertoire (brief `b4-briefs/cluster-09.md` — C-16 + stub remove/replace
templates + D-7 spine de-risk; run 10) + cluster 10 durable trial metadata
(brief `cluster-10.md` — D-12 ⚖ schema/wire, F-3 attribution, E-3 rework
legibility; run 11). Then **invocation 7** = clusters 11+12 COMBINED as one
builder run (run 12): G-10/G-13 contrast tokens, G-12/G-14 viewport, C-26 ⚖
disclaimer, A-12 create-dedup (census fail found unassigned — folded), A-8
seed-CTA fold fix. Wait for the self-test artifact (re-running at
handoff-write time after 55473e8's ensureIdle fix) to be ok:true before
invoking. previouslyGreen = 28 ids (ledger).

## Current state
- Green (28 of 43): A-3, A-4, A-5, A-9, A-13, A-14, B-1, B-3, B-4*, B-5,
  B-10, C-10, C-13, C-17, C-20, C-21, C-22, C-27, C-28, D-2, E-4, E-5, G-4,
  H-1/7/8/9, I-2. (*B-4 product-green; its scenario stalled on the C-20
  picker flow in runs 008/009 — ensureIdle fixed in 55473e8, re-verifies
  next run.) Open product work: A-12, C-16, C-26, D-12, E-3, F-3, G-10,
  G-12, G-13, G-14. Twins (C-10@, C-13@, C-16@, F-3@) + I-1 clear via
  parity at the exit full runs.
- Judges healthy: I-2, B-8, B-2, C-11, G-3 PASS on latest evidence; D-7
  failed one stricter panel (BRANCH badge) → de-risk in cluster 9; A-8
  fails only on the seed-CTA fold (real product) → cluster 12; E-3 →
  cluster 10.
- Streaming landed with a swappable MoveRequest.OnDraft hook (stub streams
  during latency; real-DeepSeek phase-3 can implement the same callback) and
  orchestrator tests proving no-token-for-blocked-moves.
- Budget: runs 10-12 = invocations 6 (two clusters) + 7 (one combined).
  ZERO retry margin — any failure past that → checkpoint report to USER at
  the cap (by design), with parks/stall-valve rules unchanged.

## Open concerns
- Exit ×2 full runs will exercise all ~44 scenarios incl. parity twins —
  stale-scenario class has bitten 3× (D-2, B-4, g/reduced-motion); expect
  the first full run to surface more and budget lead time for it.
- G-10's 98 below-AA text pairs is token-level design work (cc warm palette
  over Acne system; Tailwind scales REPLACED — bracket classes for pixels).
- Builder-authored tests are diff-for-review, not verification (B5 point).
- ⚖ in force: BC-C-26 (cluster 12), BC-D-12 (cluster 10 — additive
  migration only; the user's real data/capycook.db must still load).
- Operator DB must still show exactly 6 operator events at exit.
