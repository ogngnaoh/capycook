> **HISTORICAL — LANDED.** This paste draft is retained for provenance only.
> Its amendment is already recorded in `docs/PREREGISTRATION.md`; do not paste
> it again.

# §9 draft — Amendment 2 (bounded move retries) + T1 instrument re-pin

**USER-PASTE ONLY — the builder never edits `docs/PREREGISTRATION.md`.**
Paste the two table rows into the §9 table and the full-text section below
the existing Amendment 1 text. The pin SHA
`32afe54fef040fe8fb964fd3c2f04fc9e673b910` is the Amendment-2 instrument
commit ("feat(eval)!: bounded move retries…"). Before pasting, verify:
`git log -1 32afe54` shows that commit, and the five unchanged paths are
byte-identical to the prior pin —
`git diff 08903cb..32afe54 -- internal/llm/prompts eval/fixtures/seeds.json
data/safety internal/llm/evidence.go internal/eval/mapping.go` → empty
(builder-verified 2026-07-09).

---

## Table rows (paste into the §9 table)

```
| 2026-07-09 | **Amendment 2 — bounded move retries in the harness runner** (full text below the table; summary: a safety-blocked move is answered with gate verb=regenerate and a failed move re-proposed, up to 3 fresh generations per move; a move still blocked/failed after that drops its WHOLE seed from the arm, loudly reported with per-arm completed-seed counts; generator client retry bound raised 2→4 within SPEC §7's "fixed bound") | The v1 all-or-nothing abort policy was validated only against the deterministic stub; live deepseek-v4-pro variance (three aborted grounded-arm attempts, observed ~5–11% per-move abort risk × 65 all-or-nothing moves) makes an abort-free arm statistically infeasible. Recorded pre-data: no arm had completed; zero counted claims existed. |
| 2026-07-09 | **T1 instrument re-pin.** All seven instrument paths re-pinned at commit `32afe54fef040fe8fb964fd3c2f04fc9e673b910` (supersedes the `08903cb…` pin): changed — arm driver `eval/fixtures/move_script.json` (v2, retry policy) and claim-extraction code `internal/eval/runner.go` (retry/skip machinery); byte-identical to the prior pin — `internal/llm/prompts/`, `eval/fixtures/seeds.json`, `data/safety/`, `internal/llm/evidence.go`, `internal/eval/mapping.go`. | Amendment 2's mechanism lives in the runner + move script; the pin must postdate those edits and predate the first counted run (build spec §1.9). No prompt, seed, safety rule, toggle, or mapping changed. |
```

## Full-text section (paste below the Amendment 1 text)

```
### Amendment 2 — 2026-07-09

**Recorded before any counted eval data existed: three grounded-arm attempts
had aborted mid-run (moves 5, 12, and a diagnostic re-roll at move 1); no
arm's claims file was ever written.** This amendment changes the harness
runner's failure handling only. Every category definition and rate formula
(§7a), hypothesis (§3), κ band (§6), analysis rule (§8), the three arms, the
13 ratified seeds, the 5-move script content, prompts, safety rules, and the
Amendment-1 tiered-labeling procedure stay frozen as written.

**What changes:**

- **Bounded move retries (move_script.json v2).** Policy is now
  `on_blocked: retry`, `on_failed: retry`, `retry_limit: 3`. A
  safety-blocked proposal is answered with gate verb `regenerate` — the same
  recovery verb a cook uses in the workbench, recorded in the event log; the
  deterministic safety gate itself is never routed around, and every block
  remains logged telemetry. A failed move (LLM exhaustion) is re-proposed
  from the idle state. The retry counter is shared across both classes, per
  scripted move.
- **Seed skip on exhaustion.** A move still blocked/failed after 3 fresh
  generations drops its ENTIRE seed from that arm (partial seeds are never
  exported); the skip is reported per arm with the move, reason, and a
  completed-seed count (N/13) that accompanies the Results denominators.
  Selection note, stated plainly: claims come only from seeds that completed
  all 5 moves under retries; if skips land asymmetrically across arms, the
  per-arm completed-seed counts expose it and the writeup must discuss it.
- **Generator client retry bound 2→4** (5 attempts, alternating the
  server-enforced strict path with the json_object fallback). SPEC §7 pins
  "retry up to a fixed bound", not a literal count; the judge client keeps
  its reviewed 3-attempt bound and is byte-unchanged.

**What does not change:** claim extraction (only FINAL accepted proposals
produce claims — identical to v1 for any seed that completes); Tier-1
evidence re-derivation; blinding; judge procedure; all rates, hypotheses,
and κ machinery.

**Why this is not results-contingent:** the aborts prevented ANY results
from existing — the amendment was forced by instrument infeasibility, not
by an undesired number. The live failure evidence (timestamps, error
classes, per-attempt logs) is preserved in `docs/02-measure-run/log.md` and
the git history predating this entry.
```
