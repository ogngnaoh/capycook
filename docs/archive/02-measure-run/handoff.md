## Start here next session

- Independently review the local frozen-integrity CI repair, its RED/GREEN evidence, protected-state proof, and base-to-head diff before any remote action.
- After approval, push only private `master` with an expected-old guard, inspect corrected first-attempt CI, then replace the private annotated release tag with the documented force-with-lease procedure and inspect tag CI.
- Keep the public-visibility transition closed until corrected branch/tag CI and the USER's separate authorization.

## Current state

- Milestone 02 and S8 remain shipped; the repository and its packaged current media are the complete showcase surface, with no external portfolio-site work required.
- `docs/02-measure-run/` and `docs/02b-behavior-contract/` were moved to `docs/archive/` in the same atomic commit as their live consumer updates.
- H2 is final at N=2 decisions across one single-operator session; the USER approved collecting no more sessions.
- Milestone 03 is parked optional future work requiring a fresh USER go/no-go; no milestone is active.
- The exact administrative PREREGISTRATION relocation row records the unchanged evidence-log move without changing methodology, data, results, or inference.
- Private remote `master` and annotated `v0.2-measure-run` currently target `54f6bc7`; Task 7 found their frozen-file CI guard compared that commit to itself.
- A local one-SSOT repair validates fixed historical pins and immutable branch, PR-merge, and annotated-tag event targets; no remote ref or setting has been changed by the repair.

## Open concerns

- The remote release remains blocked until the local guard repair is independently reviewed, pushed privately, and both corrected CI runs are inspected.
- The repository must remain private until the separate public-visibility authorization.
- Local `measure-run` remains retained and unpushed for rollback.
- Private evidence remains ignored only by `.git/info/exclude` and must never be staged or committed.
- A same-day npm audit established zero production findings and five dev/build advisories; this repair changes no dependency manifest or lockfile.
