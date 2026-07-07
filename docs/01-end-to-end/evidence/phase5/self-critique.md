# Phase 5.4R convergence self-critique — Gate C redirect set (2026-07-07)

Set: 23 desktop states × 2 themes + 5 narrow (390×844) × 2 themes = 56 PNGs,
captured stub-mode via `web/tools/shots.mjs` (vendored; puppeteer-core devDep).
Judged against the redesign brief (`agent_docs/2026-07-07-gate-c-redesign-brief.md`)
§0 locked style, §5 IA state map, §6 voice/notation, and DESIGN-SYSTEM Do/Don'ts.

## Checks passed
- Locked style intact everywhere: 12px uppercase labels, hairlines, square
  corners, ≤1 accent block per view, no shadows; light + dark coherent.
- Decision surface: single proposal renders as the would-be recipe (03);
  wire density only behind Technical view (03b); two-level gate everywhere.
- Safety hold (09, N4): reason + grayed dish-notation evidence + rule anchored
  to the offending line + corrective action; hold owns the canvas top; only
  legal verbs, G·R keys.
- Trial record persistent (07/12/13/14); tasting notes on the current pill (15);
  post-cook rework loops through the pass (16).
- Vocabulary: kitchen states + glosses in the header; no slug leaks in any
  default view; GOV.UK seed errors (01b); skip link (18); focus-visible ring
  ≥3:1 on the ghost verb (19).
- Narrow: doc scrollWidth = 390 on all N-states both themes after the header
  wrap fix; gate + tabs pinned; auto-switch to Recipe on hold verified (N4).

## Defects found this loop → fixed before commit
- Deep-link/reload of /dishes/:id 301-looped (FileServer canonicalization);
  fixed in web/serve.go (fallback serves index bytes), TDD'd.
- Header overflowed the viewport below md (up to 936px); fixed with
  max-md wrap + h-auto + min-w-0 title, TDD'd; re-captured narrow set clean.

## Known imperfections left for Gate C judgment
- Stub emits near-identical alternatives, so comparison rows A/B read the same
  (08); the live model differentiates. Pre-existing stub limitation.
- Streaming state can't be caught in stub (instant resolve): no live
  "Proposing…/Cancel" bar shot; move-failed/reconnect banners remain
  test-covered only. Same three gaps as the original 5.4 set.
- 19-focus-gate shows the ring on the ghost verb — on the filled ACCEPT the
  ring hugs terracotta-on-terracotta (visible via offset, but subtle).
- Duplicate id `proposal-heading` in the alternatives view (load-bearing for
  focus protocol; conditional-heading fix deferred).
- The sr-only inner-overflow measurements (was/now spans) are by design;
  N5's 6px input scroll is a browser artifact of the 50%-width pair.
- `pb-[150px]` bottom clearance on narrow panels is generous but never clips;
  tune only if the gate bar grows.
