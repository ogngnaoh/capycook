## Start here next session

- Independently review the atomic milestone-02 ship commit against the Task 6 brief before any push, tag, or public-visibility action.
- After approval, Task 7 may push private `master`, require green CI, and inspect the archived links and GitHub render while the repository remains private.
- Keep the later public-visibility transition closed until the USER separately authorizes it.

## Current state

- Milestone 02 and S8 are shipped locally; the repository and its packaged current media are the complete showcase surface, with no external portfolio-site work required.
- `docs/02-measure-run/` and `docs/02b-behavior-contract/` were moved to `docs/archive/` in the same atomic commit as their live consumer updates.
- H2 is final at N=2 decisions across one single-operator session; the USER approved collecting no more sessions.
- Milestone 03 is parked optional future work requiring a fresh USER go/no-go; no milestone is active.
- The exact administrative PREREGISTRATION relocation row records the unchanged evidence-log move without changing methodology, data, results, or inference.

## Open concerns

- The local ship commit is intentionally unpushed and requires independent review before Task 7 proceeds.
- The repository must remain private until the separate public-visibility authorization; no release tag exists yet.
- Local `measure-run` remains retained and unpushed for rollback.
- Private evidence remains ignored only by `.git/info/exclude` and must never be staged or committed.
- Retained Minor diagnostic concern: BC-J-4 fails closed but omits the underlying `spawnSync().error` on exceptional spawn/setup failures.
