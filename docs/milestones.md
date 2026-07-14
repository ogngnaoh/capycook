# Milestones

Execution order. The `← active` milestone is current. Only the active milestone's folder is materialized; future folders appear when their work begins. Shipped-milestone folders are archived under docs/archive/ (D6, milestone 02 spec).

00. scaffold         → docs/archive/00-scaffold/     — shipped (rescoped 2026-07-06: S0.1 + S0.4 shipped; S0.2/S0.3 re-homed into milestone 01; original v0 exit criteria re-homed to milestone 01 phases 3–4)
01. end-to-end-build → docs/archive/01-end-to-end/   — shipped (2026-07-07: six phases, Gates A–D cleared, merged e2e → master at phase-6-handback; spec: docs/superpowers/specs/2026-07-06-end-to-end-build-design.md)
02. measure-run      → docs/02-measure-run/  ← active (reframed 2026-07-08: solo tiered eval — deterministic verifier + blinded author R1 + LLM judge R2 — plus repo-showcase kit; spec: docs/superpowers/specs/2026-07-08-milestone-02-reframe-and-showcase-design.md; S8 publish + H2 sessions were paused behind 02b [shipped 2026-07-13]; **S8 is now the active resume point** — GIF re-check first, then publish)
02a. frontend-ia-redesign → docs/archive/02a-frontend-redesign/ — shipped (2026-07-08: direction-A IA implemented + merged to master; 10-task plan, per-task + whole-branch review, evidence in the milestone folder)
02b. behavior-contract → docs/02b-behavior-contract/ — shipped (2026-07-13: ratified UX behavior contract + hybrid headless oracle + autonomous fix→judge loop drove all 43 census reds green [113/0 asserts across 4 full runs]; B5 USER-approved after an independent fresh-session runtime verification, 3 judge-evidence artifacts waived as non-defects; merged 02b → measure-run, UNPUSHED per D7; GIF re-check deferred to S8; folder archival deferred to the 02 ship; spec: docs/superpowers/specs/2026-07-11-behavior-contract-oracle-loop-design.md)
03. depth            → docs/03-depth/        — planned (v3: live-retrieval 4th arm, branch-compare, flavor sandbox, technique explainer, full autonomy dial)

Mapping note: build order is governed by the end-to-end spec (2026-07-06), which supersedes SPEC §6 / DESIGN §15 **sequencing**; their exit criteria stand and are re-homed as noted above.
