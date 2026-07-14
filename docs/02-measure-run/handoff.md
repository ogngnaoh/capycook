## Start here next session

- Run a fresh independent whole-range re-review after Gate A documentation fix 4.
- If that re-review is clear, present the complete Gate A evidence and concerns to the USER for explicit approval.
- Do not begin Gate B: every merge, push, tag, GitHub setting or visibility change, and worktree removal remains forbidden until explicit USER approval.

## Current state

- S8 release-preparation Tasks 1–4 are complete, including reporting, current media, private-evidence preservation, and integrated audits.
- Gate A documentation fixes 1–3 resolved the earlier review blockers.
- Fix 4 is landed: reachable historical specs are bannered, release authorities carry the final facts, the §9 row is recorded as landed, and the Gate B archival ritual is explicit.
- Milestone 02 remains active at S8; Gate A awaits explicit USER approval.

## Open concerns

- Gate B is private-first and remains forbidden until Gate A is explicitly approved.
- Never push `measure-run`; after approval, merge locally and push `master` only while the repository is still private.
- Before the Gate B folder moves, rewrite both final handoffs; archive `docs/02-measure-run/` and `docs/02b-behavior-contract/` under `docs/archive/`, and update `docs/milestones.md` pointers and statuses.
- Keep local ignored/untracked `docs/private-evidence/` in place; reconfirm preserved private 02b evidence before removing its worktree, and retain branches for rollback.
- Public visibility requires separate USER authorization after final private CI, tag, settings, and render evidence.
