# Milestone 02 — S8 Showcase Release Implementation Plan

> **For agentic workers:** Execute this plan in order. Gate A uses the
> implementer/reviewer fix→re-review protocol below; Gate B requires explicit USER
> approval before any release mutation.

**Goal:** Finish milestone 02 as the public GitHub showcase, with the repository and
its current media as the reviewer surface.

**Architecture:** Gate A completes and independently reviews the local release
candidate without publishing it. After the USER approves Gate A, Gate B promotes the
candidate to `master` while the repository is still private, verifies that private
release state, performs the ship ritual, and waits for separate USER authorization
before changing visibility to public.

**Tech stack:** Git and GitHub; the existing Go/React build; the tracked milestone-02
documentation and `docs/media/` release assets.

## Global constraints

- Do not collect new H2 data or add product behavior, eval data/instruments, an
  external portfolio, or milestone-03 implementation.
- Never push `measure-run`. In Gate B, push `master` only while the repository remains
  private.
- Milestone 03 stays parked optional future work. It requires a fresh USER go/no-go
  and never becomes active automatically.
- There is no external portfolio-site requirement. The GitHub repository and packaged
  current media are the complete showcase surface.
- Retain the milestone branches for rollback.
- Remove the 02b worktree only after its private evidence has been reconfirmed in its
  preserved location. Do not treat a branch merge as proof that gitignored evidence
  traveled with it.
- Do not edit or regenerate counted eval data, frozen instruments, or private evidence.

## Final release-candidate facts

- H2 is final at **N=2 decisions across one single-operator session**. Both decisions
  were native cancels and therefore two rejects in the frozen-five roll-up; the USER
  approved collecting no more sessions.
- The showcase contains **9 GIFs**: eight product captures and one eval capture.
- The current packaged assets are `docs/media/hero.png`,
  `docs/media/social-preview.png`, and the nine files under `docs/media/mp4/` that
  correspond to GIFs 01–09.
- The PREREGISTRATION §9 supporting-outcome deferral was landed unchanged through
  explicit USER delegation at commit `f160a74`.
- Reporting reconciliation, media refresh, private-evidence preservation, and the
  integrated build/integrity audits are complete. The integrated build audit passed
  after the unchanged Docker build was rerun with Colima available.

## Gate A — local release-candidate approval

Gate A performs no merge, push, tag, GitHub setting change, visibility change,
worktree removal, or milestone-03 activation.

- [ ] Confirm the reporting, media, evidence-preservation, build-audit, and integrity-
  audit reports are complete and internally consistent.
- [ ] Confirm the active milestone docs and this plan contain the final facts above
  and no superseded release instruction.
- [ ] Run an independent fresh-context whole-branch review of `8d8df56..HEAD`, including
  the release-state documentation corrections.
- [ ] Apply the fix→re-review protocol until the independent reviewer returns no
  Critical or Important findings and explicitly recommends presenting Gate A.
- [ ] Present the complete Gate A evidence and any remaining non-blocking concerns to
  the USER.
- [ ] Record explicit USER approval. Until that approval is given, S8 remains
  `active — Gate A pending` and Gate B is forbidden.

### Gate A verification and acceptance

- The milestone S8 row points only to this plan, and the 2026-07-10 S6/S7 plan carries
  a prominent banner forbidding execution of its remaining S8 instructions.
- The handoff has exactly the three required sections, is at most 40 lines, and leads
  with completion of re-review followed by presentation of Gate A.
- Active release docs contain no requirement for additional H2 sessions, a public-
  first push, eight total GIFs, external portfolio linkage, active milestone 03, or a
  pending USER paste.
- `git diff --check` exits 0, and the whole-branch reviewer confirms the corrections
  did not alter product code, media, eval/frozen files, or private evidence.
- Gate A is accepted only when both conditions hold: the independent whole-branch
  re-review is clear and the USER explicitly approves proceeding.

### Subagent implementer/reviewer fix→re-review protocol

1. Give an implementer subagent one bounded set of review findings and the protected-
   file constraints. The implementer makes only those fixes, runs focused checks,
   self-reviews the diff, and records the resulting commit and concerns.
2. Give a separate fresh-context reviewer subagent the branch range, acceptance
   criteria, protected-file constraints, and implementer report. The reviewer verifies
   the repository directly rather than relying on the report.
3. Any Critical or Important finding keeps Gate A closed. Return the exact finding to
   an implementer, then require the reviewer to inspect the correction and re-review
   the integrated whole-branch state.
4. Repeat until the reviewer explicitly reports no Critical or Important findings.
   Minor concerns are recorded for the USER; they are never silently discarded.
5. Reviewer clearance authorizes only presentation of Gate A. It does not authorize
   Gate B; only explicit USER approval does that.

## Gate B — private-first release

Begin this sequence only after the USER explicitly approves Gate A.

- [ ] Reconfirm the repository is **PRIVATE**, the working tree is clean apart from
  explicitly allowed local files, and the Gate A commit is the intended tip.
- [ ] Locally merge `measure-run` into `master` with `--no-ff`. Retain both branches;
  do not push `measure-run`.
- [ ] Push `master` only, while the repository is still private, and require green CI
  on that private commit.
- [ ] While private, set/check repository topics and the social preview, then inspect
  the GitHub-rendered README and current media from the private repository.
- [ ] Reconfirm the preserved private 02b evidence. Only then may the 02b worktree be
  removed; retain its branch for rollback.
- [ ] Perform the milestone-02 ship ritual in one commit: mark S8 and milestone 02
  shipped, update the next-session handoff, and keep milestone 03 parked optional
  rather than activating it. Push that `master` commit while still private.
- [ ] Require final green private CI, create the milestone-02 release tag on the
  verified private `master`, and push that tag while the repository remains private.
- [ ] Present the final private CI, tag, settings, render, and rollback evidence to the
  USER. Do not change visibility without separate explicit USER authorization.
- [ ] After USER authorization, switch repository visibility to public and pin it.
- [ ] From a logged-out browser, verify public access and the README/media render in
  both light and dark modes. Record the final public URL and any non-blocking caveats.

### Gate B verification and acceptance

- `measure-run` was never pushed; only `master` and the approved release tag were
  pushed, first while the repository was private.
- Required private CI is green both after the no-ff merge and after the ship-ritual
  commit; the tag identifies that final verified private `master` state.
- Topics, social preview, and the private README/media render were checked before the
  visibility change.
- The USER separately authorized public visibility after reviewing private release
  evidence.
- Logged-out public access succeeds, and the GitHub page renders the current hero,
  nine GIFs, diagrams, and other README media in light and dark modes.
- Milestone 02 is shipped, milestone 03 remains parked optional, rollback branches are
  retained, and any removed 02b worktree had its private evidence reconfirmed first.

## Self-review

- Gate order is explicit: independent review and USER Gate A approval precede every
  Gate B action; public visibility is a second USER-authorized step after private
  verification.
- The plan adds no product, data, instrument, external-portfolio, or milestone-03
  scope.
- Final facts and rollback/evidence constraints are stated once and carried into the
  acceptance criteria.
