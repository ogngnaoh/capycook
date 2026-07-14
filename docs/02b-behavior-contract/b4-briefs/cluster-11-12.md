# B4 clusters 11+12 (combined) — contrast, viewport, backstops

Criteria: BC-G-10, BC-G-12, BC-G-13, BC-G-14, BC-C-26 (⚖ in force),
BC-A-12 (all assert) + BC-A-8 de-risk (judge). ONE builder run — the last
budgeted one. Verbatim contract text at the end.

## Items

1. **BC-G-10 — token-level contrast (the big one).** 98 text/background
   pairs measure below AA in both themes — the `--color-faint` family at
   10–12px on the spine, trust strip, and proposal header; `--color-muted`
   pairs are marginal. Fix at the TOKEN level (`web/src/index.css` custom
   properties): adjust lightness until every rendered pair clears 4.5:1
   (normal) / 3:1 (large = ≥24px or ≥18.66px bold), both themes. DESIGN BAR:
   this is the cc warm palette over the Acne structural system — tune
   lightness/saturation within the warm register, do NOT swap to generic
   grays; the app must keep its character (several judged criteria re-view
   these screens: G-3, D-7, B-2, C-11 are all passing on current looks).
   The oracle computes relative-luminance numerically across the seed form,
   recent-dishes, intent bar, CookFlow captions, spine, trust strip,
   proposal header, dish card, gate, safety-hold, override-prompt, and the
   move-failed/reconnect banners (incl. `--color-critical` pairs).
2. **BC-G-13 — component boundaries ≥3:1.** `--color-border-strong`
   (#CEC6B7 light / #443C2E dark) measures ~1.7:1: dial track/thumb in BOTH
   aria-checked states (`DialToggle.tsx:13,17`), the invalid seed-field
   border (`SeedSetup.tsx:49` — aria-invalid adds no recolor today), and the
   safety-hold container border — all ≥3:1 vs adjacent backgrounds, both
   themes.
3. **BC-G-12 — 320px reflow.** The IntentBar "Try it →" button clips 49px
   off-screen at 320 (`#cc-intent` flex-1 won't shrink, `IntentBar.tsx:80` —
   min-w-0 / wrap). Then verify every listed screen at 320×800:
   `scrollWidth <= 320`, no clipped interactive control (the oracle runs a
   per-control clip sweep, not just doc-scrollWidth).
4. **BC-G-14 — sticky chrome never hides focus.** Two offenders: skip-link
   z-50 paints behind the z-100 sticky header (`index.css:56` vs
   `Workbench.tsx:445`); CookFlow's `order:-1` reflow (`index.css:74`) makes
   DOM ≠ visual order with no scroll-padding-top, so tabbing scrolls its
   trigger under the header at 390px. Fix z-index + add scroll-padding-top /
   scroll-margin so no focus stop is majority-hidden under header or gate
   bar at 390×844 and 320×800.
5. **BC-C-26 (⚖ RATIFIED IN FORCE) — in-app disclaimer.** No
   backstop/not-a-guarantee language exists in web/src. Required: a visible
   or one-interaction-reachable disclaimer on BOTH the idle workbench and
   the safety hold, containing backstop/not-a-guarantee language (DESIGN
   §8.7 P0). Keep it typographically quiet (footer-register), but real text
   in the a11y tree.
6. **BC-A-12 — create dedup.** `SeedSetup.tsx` `onSubmit` has no synchronous
   submitting guard: double-click AND double-Enter must fire exactly one
   `POST /api/dishes`, land on one `/dishes/:id` (and with A-3, ONE
   auto-fired generation). The submit affordance visibly disables
   ("Developing…") via `aria-disabled` — NOT native `disabled` on the
   focused button (GateBar documents why native disabled goes silent for
   screen readers) — and focus never drops to `document.body`. Mirror A-5's
   ref-lock pattern.
7. **BC-A-8 de-risk (judge).** Three judge panels flagged the seed screen's
   primary CTA cropped at the 1280×800 fold — the single remaining A-8
   complaint on clean evidence. Tighten the seed form's vertical rhythm so
   "Develop this dish →" is fully visible at 1280×800 without scrolling.
   Do not cram: adjust spacing, not information.

## Cautions

- Token changes ripple across every judged screenshot — re-run the full web
  suite AND eyeball a light/dark screenshot pair if you can drive one
  locally (bin/capycook + CAPYCOOK_STUB_LLM=1 on a scratch port, kill it
  after; never :8098/:8099).
- Tailwind theme scales are REPLACED: pixel-exact values need bracket
  classes; default-scale classes are silent no-ops.
- Do not rename data-testids/ids; no oracle/docs/frozen edits. Web-only
  expected (no Go); if you do touch Go, make test + vet.
- Green set to protect (32 ids): see ledger.

## Contract text (verbatim)

[BC-G-10, BC-G-12, BC-G-13, BC-G-14, BC-C-26, BC-A-12 — full text in
docs/02b-behavior-contract/contract.md §G/§C/§A; the six criteria's check
recipes are quoted in the ledger brief; read them from contract.md directly
before building — it is the ratified source.]
