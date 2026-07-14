# Handoff — milestone 02 (measure-run)

## Next session start here
**GIF re-check DONE (committed `288b339`). Only S8 proper remains before
milestone 02 ships — and shipping 02 IS the "showcase-ready" bar.** Do the
sequence in order; the gate is H2:

1. **H2 operator sessions (USER-gated).** Real `make run` dishes on a live
   DeepSeek key (`run_kind=operator`, spend from the ~$1.13 headroom under the
   $2 cap) to the spec floor of ~8. Current N is **below floor** — the 02
   handoff said N=0, a 02b merge guardrail counted 6; reconcile at replay. The
   **USER decides when to stop**; H2 ships with whatever N exists per §8.
2. `go run ./cmd/eval replay` → replace the README H2 **placeholder** with the
   emitted table verbatim (explicit N + single-operator caveat), commit.
3. **Exit-criteria audit** vs `milestone.md` (incl. the no-API-key grep).
4. **USER gate:** merge `measure-run` → master (no-ff) + **PUSH** (D7's one
   public debut, the first time anything is public) → tag `v0.2-measure-run`.
5. `gh repo edit` description/topics · upload `docs/media/social-preview.png`
   (manual, no gh API) · pin repo · **verify all 9 GIFs + hero + langfuse
   render on live GitHub in dark AND light** · portfolio MP4s + repo link ·
   ship ritual (02→shipped, 03←active) · archive `docs/02b` + `docs/02-measure-run`.

## Current state
- Branch `measure-run`, **UNPUSHED** (D7). Tree clean after `288b339`.
- **GIF re-check complete** (`288b339`): `demo.mjs` fixed for **BC-A-3** (scene 01
  auto-first-pass — create → accept the auto-fired proposal → Trial 1, no manual
  dispatch) and **BC-A-13** (scene 07 — reset `#cc-intent` via React's value
  tracker before the retry, else the restored intent garbles). **All 8** GIFs
  re-captured against the 02b product (BC-E-3 rationale echo + brightened faint
  token are repo-wide, so a partial recapture would mix pre/post-B4). Verified
  frame-by-frame, within S7 spec (800px · 15fps · 5.7–9.7s · 136K–312K). **No
  product code touched.**
- 02b merged into `measure-run` (`5dca266`). Green at that merge: go vet/test ·
  tsc · vitest 273/273 · build-all — a capture-script change can't disturb it.
- PREREG §9 carries Amendments 1–3; §1–§8 byte-unchanged; instruments pinned `32afe54`.

## Open concerns
- **02b worktree `../CapyCook-02b`** holds gitignored B5 evidence
  (`run-027/030/034/036`, `selftest-report.json`) that did NOT travel with the
  merge — preserve (commit un-ignored or copy out) BEFORE removing it. `git mv`
  won't move gitignored files. `b4-ledger.md` + `log.md` carry the summary.
- `docs/02b-behavior-contract/` not archived (deferred to the 02 ship).
- README "all four generation attempts" vs Amendment-2 "limit 3 fresh" —
  reconciles as 1 initial + 3 retries; optional tighten at the exit audit.
- Milestone 03 (depth) is a planned FUTURE enhancement, an explicit 02 non-goal —
  NOT required for the resume/portfolio showcase. Showcase-ready == 02 shipped.
