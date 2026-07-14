# Handoff — 02a frontend-ia-redesign

## Next session start here
Branch `worktree-02a-frontend-redesign-a` is complete and reviewed; if it has not been merged to master yet, merge it and mark 02a shipped in `docs/milestones.md`. Then resume milestone 02 (measure-run).

## Current state
- All 4 slices shipped; plan (10 tasks) executed subagent-driven with per-task review + fixes.
- web suite 203 tests green (0 skipped), tsc clean, vite build clean, Go `make test` green.
- Evidence: docs/02a-frontend-redesign/evidence/ (12 desktop states × light+dark + 3 narrow; `proposing` unobservable in stub mode — the stub resolves moves in milliseconds).
- Old presentation layer deleted (TrialStrip/SteeringPane/DraftPane/ProposedDraftView/SafetyBlock/RailTabs/VersionHistory/ProposalCard/DiffMark/Chips/UncertaintyLedger).

## Active concerns
- Cook notes / timeline cook markers are session-local (as the old thread was) — lost on reload; candidate for server-side persist later.
- `web/tools/demo.mjs` (GIF driver) still targets the OLD UI — rewrite before recording new hero GIFs.
- Stub-mode seed proposals emit whole-array replace ops → the row-level diff falls back to the honest "could not be previewed" disclosure; granular ops render inline. Same mergeDiff behavior as before the redesign.
- Deliberate omissions: Citation.date not rendered; timeline tech view shows ver ids only (move slugs not on the wire).
