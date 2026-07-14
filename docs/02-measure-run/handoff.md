# Handoff — milestone 02 (measure-run)

## Next session start here
**▶ RESUMED — 02b shipped 2026-07-13, merged to `measure-run` (unpushed).** The
improved, contract-verified workbench is now on this branch; S8 is active. **Do
the deferred 02b GIF re-check FIRST** — README scenes 01/04/07 changed under B4
and the demo rig needs a scene-01 fix (auto-first-pass broke `seedToTrial1`); see
`docs/02b-behavior-contract/handoff.md`. Then proceed with S8 below. Everything
below is the resume point.

S8 pre-work is the resequenced Task 5 (H2 fold): the author accumulates real
operator sessions in the workbench (`make run`, real dishes, live key —
`run_kind=operator`, they spend from the $1.13 headroom under the $2 cap);
current N = 0, spec floor ~8, **the user decides when to stop**. At their call:
`go run ./cmd/eval replay` → replace README's H2 placeholder with the emitted
table verbatim (explicit N + single-operator caveat), commit. Then Task 11:
exit-criteria audit against `milestone.md` (incl. the no-key grep) → **USER
gate**: merge `measure-run` → master (no-ff) + push (D7's one public debut) →
tag `v0.2-measure-run` → Task 12: `gh repo edit` description/topics, upload
`docs/media/social-preview.png` (manual — no gh API), pin repo, verify all
9 GIFs + hero + langfuse-trace render on live GitHub in dark AND light,
portfolio MP4s + link, milestone ship ritual (02 → shipped, 03 ← active).

## Current state
- **02b (behavior contract) merged into `measure-run` 2026-07-13** (merge commit
  `5dca266`, UNPUSHED). The workbench is now contract-verified — all 43 census
  reds fixed (113/0 asserts ×4 full runs), B5 USER-approved after an independent
  fresh-session runtime verification (PASS). Full tree green: go vet/test · tsc ·
  vitest 273/273 · build-all. **This is why the GIF re-check is the first S8 step**
  — scenes 01/04/07 now show pre-B4 UI, and `demo.mjs` scene 01 is broken.
- Branch `measure-run`, not pushed (D7). Tree clean. S1–S7 shipped; S7
  (2026-07-10, 4f9c438..245c969 + ritual): 9 GIFs (⚠ **01/04/07 now stale** —
  pre-B4; re-capture at S8), eval-log replay, 3 diagram SVGs, Langfuse span shot,
  hero + social preview, 9 MP4s. Fresh-context review SHIP (after one blocking
  fix: 09-eval-run 17.7s→11.9s).
- Rig: `web/tools/demo.mjs` reconciled to the 02a redesign (API pre-setup +
  preroll; encode dither=none, gifsicle lossless — see web/tools/README.md) — but
  **NOT updated for B4**; scene 01's `seedToTrial1` needs the auto-first-pass fix
  before re-capture. Env knob `CAPYCOOK_STUB_LATENCY_MS` (demo capture, off by default).
- PREREG §9 carries Amendments 1–3; §1–§8 byte-unchanged; instruments frozen
  at `32afe54` (diff re-verified empty at S7 exit).

## Open concerns
- S8 publish gates on an honest H2 N — never wait indefinitely, but the user
  calls it; H2 ships with whatever N exists, per §8.
- Carried to S8 exit audit (optional tighten): README "all four generation
  attempts" vs Amendment-2 "limit 3 fresh" — reconciles as 1 initial + 3
  retries.
- Task 12 render check now covers 9 GIFs (exit criteria say 8 — superseded
  count, 9 ≥ 8) + hero/social/langfuse PNGs, fresh browser, both themes.
