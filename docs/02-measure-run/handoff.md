## Start here next session

- Obtain a fresh independent Task 5 re-review of the two-file social-preview policy correction on top of private-master staging commit `d92d62c`.
- Require the reviewer to confirm the exact order: private asset/fallback verification → separate USER visibility authorization → public transition → immediate Settings upload → repository-images URL and logged-out share/render verification.
- Do not proceed to the archive, tag, or public-visibility steps on the strength of implementer self-review.

## Current state

- Private staging reached `master` at `d92d62c`; push-triggered CI run `29346419485` completed green for that exact commit.
- The USER approved Gate A and separately authorized the exact administrative PREREGISTRATION relocation row; neither authorization changes the later public-visibility gate.
- The prepared `docs/media/social-preview.png` is 1280×640 with approved SHA-256 `a0d928339ef491c6a13085f071ef6ff50bf102c612ba2cc646e011b7df5c0da9`.
- Because CapyCook is private and has never had a custom preview, its current owner-avatar fallback is expected and no initial private upload is required.
- The corrected sequence verifies the asset and fallback while private, then uploads immediately after a separately USER-authorized public transition and verifies the repository-images URL plus logged-out share/render behavior.

## Open concerns

- Task 5 correction acceptance remains pending fresh independent re-review.
- Do not change visibility without the separate explicit USER authorization; public render/access review cannot pass until the post-transition upload and verification pass.
- Never push `measure-run`; only private `master` may be pushed during the authorized private stage.
- Private evidence remains ignored/untracked and must never be moved, staged, or committed.
- This correction authorizes no tag, archive, PREREGISTRATION edit, media change, worktree removal, or GitHub settings/visibility mutation.
- Retained Minor diagnostic concern: BC-J-4 fails closed but omits the underlying `spawnSync().error` on exceptional spawn/setup failures.
