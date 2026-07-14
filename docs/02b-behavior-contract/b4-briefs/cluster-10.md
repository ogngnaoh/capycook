# B4 cluster 10 brief — durable trial metadata (D-12 ⚖, F-3, E-3)

Criteria: BC-D-12 (assert, ⚖ ratified in force — schema/wire change is
sanctioned loop work), BC-F-3 (assert; @live-sim twin rides the fix),
BC-E-3 (judge). Verbatim contract text at the end.

## Root causes

1. **BC-D-12** — the move-level prose rationale is DISCARDED on accept: no
   store column, no event payload field, no wire type carries it. The USER
   ratified this criterion in force knowing it demands a schema/wire change
   (DESIGN §7 principle 5, §8.3 "decision/rationale log" P0). Persist the
   accept-time rationale end-to-end: store (SQLite via the store interface —
   additive column/migration), event/wire payloads, and expose it in the
   technical-view trial card/snapshot (present in the accessibility tree,
   an expander is fine). Fresh temp DBs make migration risk low, but keep
   the migration additive — the user's real `data/capycook.db` must load.
2. **BC-F-3** — the only auto-apply attribution is a toast that evaporates
   in ~2.6s. Auto-applied trials need a durable, text-exposed marker (spine
   card or technical view badge) distinguishing them from human-accepted
   trials — text in the accessibility tree, never color-only. If you are
   already persisting D-12's rationale, note the version record may already
   carry an origin/auto flag — check the store/wire types before adding one.
3. **BC-E-3 (judge)** — the cook→taste→rework loop is illegible: judges see
   the rework proposal's WHY IT WORKS byte-identical to the pre-rework one,
   with no visible link to the tasting note ("push moisture without more
   salt"). Product side: `internal/llm/stub.go`'s iterate_feedback template
   must weave the submitted feedback into the rationale / why-it-works text
   (echo a key phrase — "Responding to your tasting note: …"), so the
   connection is visible on screen. Verify the web side renders that
   rationale where a judge screenshotting "tasting form → resulting
   proposal's rationale" will see it.

## Cautions

- Go schema/wire work → `make test` + `make vet`; NEVER the 7 frozen paths
  (store/transport/stub are all fair game). PREREGISTRATION.md untouchable.
- The operator DB invariant: oracle scenarios only ever use fresh temp DBs;
  do not write migration code that mutates rows on load.
- Do not rename data-testids. Full web suite + tsc.
- Green set to protect (28 ids): see ledger. D-12's check runs with
  technical view ON — the technical-view toggle behavior (BC-G-1) is green.

## Contract text (verbatim)

**BC-D-12** · assert · A past trial's "why" is recoverable, not just its diff:
with technical view ON, an accepted trial's card or snapshot exposes the prose
rationale that accompanied the proposal at accept time. **[FAILS TODAY — the
move-level rationale is discarded on accept: no store column, no event payload
field, no wire type carries it. ⚖ RATIFICATION DECISION: this demands a
schema/wire change (in-scope for the loop — nothing frozen is touched), per
DESIGN §7 principle 5 and §8.3's "decision/rationale log" P0 commitment]**
Check: fast; accept a proposal carrying a distinctive rationale string; enable
technical view; open that trial → the rationale text (or an expander revealing
it) is present in the accessibility tree.

**BC-F-3** · assert · Auto-applied trials stay attributable after the fact: the
trial that landed automatically is distinguishable on the workbench (spine card or
technical view) from a human-accepted trial. **[LIKELY FAILS TODAY — the toast is
the only attribution and it evaporates in ~2.6s]**
Check: fast, dial ON; auto-apply once, accept once, enable technical view → the two
trials are visibly distinguishable (marker text/badge identifying the auto-applied
one), and the marker is exposed as text in the accessibility tree (not color-only).

**BC-E-3** · judge · The cook → taste → rework loop is legible as closing the loop —
the cook can tell their feedback drove the new proposal.
Check: fast; screenshots of tasting form, and the resulting proposal's rationale →
judge whether the connection is visible.
