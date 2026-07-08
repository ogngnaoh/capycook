# Milestones

Execution order. The `← active` milestone is current. Only the active milestone's folder is materialized; future folders appear when their work begins. Shipped-milestone folders are archived under docs/archive/ (D6, milestone 02 spec).

00. scaffold         → docs/archive/00-scaffold/     — shipped (rescoped 2026-07-06: S0.1 + S0.4 shipped; S0.2/S0.3 re-homed into milestone 01; original v0 exit criteria re-homed to milestone 01 phases 3–4)
01. end-to-end-build → docs/archive/01-end-to-end/   — shipped (2026-07-07: six phases, Gates A–D cleared, merged e2e → master at phase-6-handback; spec: docs/superpowers/specs/2026-07-06-end-to-end-build-design.md)
02. measure-run      → docs/02-measure-run/  ← active (human-led: T1 instrument freeze, operator sessions, labeling campaign + second labeler, κ, results table)
02a. frontend-ia-redesign → docs/archive/02a-frontend-redesign/ — shipped (2026-07-08: direction-A IA implemented + merged to master; 10-task plan, per-task + whole-branch review, evidence in the milestone folder)
03. depth            → docs/03-depth/        — planned (v3: live-retrieval 4th arm, branch-compare, flavor sandbox, technique explainer, full autonomy dial)

Mapping note: build order is governed by the end-to-end spec (2026-07-06), which supersedes SPEC §6 / DESIGN §15 **sequencing**; their exit criteria stand and are re-homed as noted above.
