## Start here next session

- Before any edit, retry, push, or retag, use a fresh read-only debugger to extract the complete failed log for tag job `87176404672` and the actual tag-event payload from run `29359723939`; diagnose from those primary artifacts.
- If a correction is required, use a narrow implementer → independent reviewer loop, preserve the immutable-event/frozen-history guarantees, and inspect the first branch and annotated-tag CI attempts after the correction.
- After both branch and tag CI are green, obtain one independent outcome check before treating the release as remotely complete.
- Do not repeat broad settled milestone/showcase work absent new evidence; milestone 03 remains parked and requires a fresh USER go/no-go.

## Current state

- Milestone 02 and S8 are shipped; GitHub plus packaged current media remain the complete showcase surface, with no external portfolio site required.
- Local `master` is ahead of `origin/master` solely by unpushed handoff-only commits; `origin/master` and live remote `master` remain exactly `c12a95bcebacab516eadd65c5fc3c0204c6e9d13`; the handoff updates are not pushed.
- Private annotated tag `v0.2-measure-run` is tag object `1103edec8430dbc0fc52446d3bed810dee43aa8d` and peels to commit `c12a95b`.
- Branch CI run `29359524788` is green: Go, web, Docker, and Frozen repository integrity all passed.
- Tag CI run `29359723939` failed only Frozen repository integrity job `87176404672`; Go, web, and Docker passed. Its full failure log and actual event payload have not yet been independently extracted.
- The repository is private. Public visibility is NOT authorized.
- `AGENTS.md` remains untracked and untouched; private evidence remains ignored/untracked and must not be staged.
- Local `measure-run` remains rollback-only and unpushed.

## Open concerns

- The tag-integrity failure is unresolved until primary run artifacts identify the cause and any correction passes the narrow review and CI sequence above.
- Do not edit/retry/push/retag, alter refs or settings, or broaden the repair before the fresh debugger evidence is captured.
- After explicit USER authorization only: make the repository public, pin it, upload `docs/media/social-preview.png`, then conduct logged-out public reviews of the repository and media surface.
- Public review must check anonymous visibility/rendering, README media and diagrams, release/tag presentation, and absence of private or secret material; record the evidence durably.
