# Slice S0.1 — Repo scaffold

**Goal.** A compiling, runnable Go skeleton matching SPEC §6 exactly — `make build/run/test` work and `GET /healthz` returns 200 — plus project `CLAUDE.md` and the milestone/slice/handoff docs. No domain logic.

**Plan.** See `docs/superpowers/plans/2026-07-01-repo-scaffold.md` (full task breakdown) and `docs/superpowers/specs/2026-07-01-repo-scaffold-design.md` (design).

**Tasks.**
- [x] Milestone/slice orientation docs
- [x] Module + Makefile + config loader (TDD)
- [x] HTTP server `/healthz` + graceful shutdown (TDD)
- [x] Domain package `doc.go` stubs (11 packages)
- [x] Placeholder dirs + Dockerfile skeleton + ignore files
- [x] Project `CLAUDE.md` + handoff + slice-ship bookkeeping

**Acceptance.** On a clean checkout: `go build ./...` compiles all 13 packages; `make build` → `bin/capycook`; `make run` serves `/healthz`→200 with no secrets; `make test` green; `make vet`/`make fmt` clean.

**Notes.** doc-comment stubs, not interface-signature stubs (interfaces shaped in v1 against real code). Module path `github.com/ogngnaoh/capycook`. `docs/HANDOFF.md` becomes a pointer to `docs/milestones.md` + active handoff.
