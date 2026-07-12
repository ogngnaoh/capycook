# B4 cluster 7 brief — streaming rationale (the founding finding)

Criteria: BC-B-3, BC-B-10, BC-G-4 (assert) + BC-I-2 (judge). BC-B-8 (judge,
currently passing) must HOLD — it is the handoff-legibility criterion that
the current end-of-generation replay burst keeps flaky. Verbatim contract
text at the end. This is the milestone's founding finding: the first live
operator session was unusable because nothing streams during the 15–40s wait.

## Root causes (census + architecture)

1. **The hub only replays after completion** (`internal/transport/hub.go`,
   header comment + `replay` type ~:200): a completed `orchestrator.Outcome`
   arrives via `Notify()`, THEN rationale is replayed word-by-word at
   `TokenCadence` (~30ms) and proposal-ready lands. During the 25s generation
   the client sees only heartbeats. Renderer instrument confirms: first
   streamed rationale text at t≈25.0s, ready at t≈25.8s.
2. **The stub sleeps the whole window** (`internal/llm/stub.go` ~:25,
   `CAPYCOOK_STUB_LATENCY_MS`, context-aware wait) and only then returns the
   complete proposal.
3. **No intermediate live-region values**: `[data-testid="gate-live-region"]`
   carries exactly "Proposing a move…" then "Proposal ready — N changes" —
   up to 40s of AT silence (BC-B-10).

## Suggested shape (builder judgment prevails on details, not outcomes)

- Go: let rationale tokens flow DURING generation. E.g., the stub spreads its
  rationale words across the latency window (emitting via a token
  callback/channel the orchestrator forwards to the hub as live token events),
  instead of sleeping silently. Keep the `llm` interface swappable for the
  real DeepSeek client (phase-3 streaming can implement the same callback) —
  do not hard-couple the orchestrator to the stub.
- Preserve: `Hub.Cancel` mid-stream semantics (tokens stop, move-cancelled);
  catch-up for a subscriber attaching mid-generation (reload while proposing —
  BC-A-3's mid-flight boundary and BC-D-4 resume are green and re-checked);
  the existing post-completion replay path may remain for catch-up.
- Web: the proposing card already renders token events progressively — B-3/G-4
  likely need no web rendering change once tokens arrive live. Verify.
- BC-B-10 is web-side: coarse intermediate live-region announcements during
  the wait — successive DISTINCT updates 2000–12000ms apart (e.g., periodic
  progress summaries derived from the accumulating rationale), never
  per-token, never a single 25s silence. `announce()` in Workbench exists;
  note it likely de-dupes identical strings — values must actually differ.
- Run `make test` + `make vet` (Go touched) and the full web suite.

## Cautions

- NEVER touch the 7 frozen instrument paths (internal/llm/prompts,
  internal/llm/evidence.go, internal/eval/*, eval/fixtures/*, data/safety).
  `internal/llm/stub.go`, `internal/transport/hub.go`, `internal/llm`
  interface files are NOT frozen and are fair game.
- BC-B-2 (alive-signal, judge) and BC-B-9 (start/ready announcements) are
  passing — B-10's intermediates go BETWEEN B-9's endpoints, don't replace
  them.
- The oracle measures B-3 via a renderer-side MutationObserver on the
  proposing card's text (first text ≤20s) and B-10 by polling the live
  region every ~1s — no selectors to preserve beyond existing testids.
- Green set to protect (23 ids incl. A-3's four boundaries): see ledger.

## Contract text (verbatim)

**BC-B-3** · assert · Rationale/reasoning text begins rendering while generation is
still in progress — not only after the move completes. **[FAILS TODAY — tokens are a
post-completion replay, `internal/transport/hub.go`; during generation the client
sees only heartbeats]**
Check: live-sim (25s); submit an intent → first visible rationale text in the
proposing card at t ≤ 20s (i.e., strictly before the stub's completion), and text
continues to accumulate before `proposal-ready` arrives.

**BC-B-10** · assert · The wait is survivable without eyes: during a long
generation, the live region gives screen-reader users more than a single
start/end flip — its text changes at least once between "Proposing a move…" and
"Proposal ready…". **[FAILS TODAY — the sole live region carries exactly those
two strings and nothing in between; an AT user gets up to 40s of silence]**
Check: live-sim (25s); poll `[data-testid="gate-live-region"]` textContent every
~1s from submit to ready → at least one distinct intermediate value observed
(progress or streamed-rationale summary), not just the two endpoint states — and
not a raw token firehose either: successive distinct updates land 2000–12000ms
apart, never per-token.

**BC-G-4** · assert · Reduced motion is honored without losing the alive-signal:
animations are stilled, yet the proposing state still visibly progresses (BC-B-3's
text still accumulates).
Check: live-sim with `prefers-reduced-motion: reduce` emulated → computed
animation/transition durations are 0s on the proposing surface AND rationale text
still appears at t ≤ 20s.

**BC-I-2** · judge · The 25s wait is survivable end-to-end: watching the full
screencast, a cook can tell the system is working, roughly what it is doing, and
how to bail out safely — the loop is worth the wait.
Check: live-sim; one full journey screencast (intent → wait → proposal → accept) →
judge survivability. **[FAILS TODAY — this is the session finding that motivated
02b]**

**BC-B-8** · judge (HOLD — currently passing) · The proposal-ready transition is
unmistakable: streaming resolves into the proposal + gate, and "now it's your
call" is legible at a glance.
Check: live-sim; screencast the transition ±3s → judge the handoff moment.
