# Log — milestone 02b (behavior-contract)

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
