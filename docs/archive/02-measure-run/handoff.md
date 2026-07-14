## Start here next session

- **Nothing is required.** Milestone 02 is closed at 6/6 exit criteria and the repository is
  public, pinned, and green on both branch and tag CI. There is no active milestone.
- One optional manual step remains: **upload `docs/media/social-preview.png`** at
  <https://github.com/ogngnaoh/capycook/settings> → *Social preview*. It cannot be automated
  (GitHub exposes no API for it). Until then, link unfurls fall back to the owner avatar.
- Optional polish, not required: cut a GitHub **Release** for `v0.2-measure-run` (only a bare
  tag exists today) pointing at the README `#results` section.
- Milestone 03 (depth) stays **parked and open**. It never becomes active automatically and
  requires a fresh USER go/no-go.

## Current state

- `origin/master` = `90c60a0`, public, CI green on all four jobs (go, web, docker, Frozen
  repository integrity). Badge reads *passing*.
- Annotated tag `v0.2-measure-run` = tag object `7c2d0c0`, peels to `90c60a0`. USER-authorized
  force-move from `1103edec`/`c12a95b` on 2026-07-14, so the release marks a commit whose CI is
  green. Tag CI run `29363529401` is green — **the first time the integrity job has ever passed
  on a tag push**.
- The `Frozen repository integrity` job no longer reads the push event payload. `GITHUB_SHA` is
  the integrity target on every event GitHub fires here (on a tag push it is already the peeled
  commit), and the guarantees are pin-based, so the payload bought nothing. `resolveIntegrityEvent`
  and `integrity-events.test.mjs` are deleted; net −269 lines. Rationale and the two deliberately
  dropped assertions are documented in `web/tools/repository-integrity-ci.mjs`.
- **Consequence worth knowing:** `checkRepositoryIntegrity` — including the PREREGISTRATION
  freeze — used to run *only if* the event gate passed, so it never ran on a tag. It is now
  unconditional. The prereg freeze is genuinely enforced on every push for the first time.
- The old red run `29359723939` remains in Actions history permanently; moving a tag does not
  remove prior runs. It is a historical artifact of a guard that no longer exists.
- `AGENTS.md` remains untracked and untouched by design. `.DS_Store` is now gitignored.
- Local `measure-run`, `02b-behavior-contract`, and `e2e` remain local-only rollback branches;
  `origin` carries only `master` and the one tag.

## Open concerns

- **This session modified its own checks** (deleted the event layer, rewrote the CLI test). Per
  CLAUDE.md it did not self-certify: an independent reviewer confirmed `target == GITHUB_SHA` on
  all five deleted pass-branches and that no pin-based guarantee was lost, and the pre-existing
  `repository-integrity.test.mjs` (22 tests, deliberately unmodified) stayed green throughout.
  That file is the standing regression net — do not edit it in the same session that changes the
  guard.
- Tag annotation is **no longer asserted** by CI. This is a recorded decision, not drift: the old
  check read a ref that `actions/checkout` had already rewritten to lightweight, so it enforced
  "all tag pushes fail", not "tags must be annotated". Re-establishing it needs `git ls-remote`,
  not the workspace. Judged not worth a network round-trip for release hygiene.
- The repository is now public, exposing 17 tracked agent-process docs (`docs/superpowers/`,
  `agent_docs/`). Reviewed and accepted as evidence of process rigor.
