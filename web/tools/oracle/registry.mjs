// The completeness spine: every criterion of the ratified contract
// (docs/02b-behavior-contract/contract.md, pin 965c8eb), one entry each.
// Grep any BC id here to find its scenario file. BC-J-7 is enforced against
// this list: a report is refused unless every id below appears in it.
//
// Fields:
//   id, tag ('assert'|'judge'), area, title (informal shorthand — the
//   contract text is the only normative statement), scenarios (owning
//   scenario ids; >1 = sub-check aggregation, verdict is AND across them),
//   failsToday (the contract's informative [FAILS TODAY]/[LIKELY] markers —
//   the self-test leverages these as known-broken fixtures),
//   seam ('a' arrival/delivery of a freshly generated proposal or hold,
//   'b' commits/races a decision on one — BC-I-1's membership rule),
//   exempt (why a seam-carrying check is still outside the parity re-run:
//   'live-native' already runs under live-sim · 'post-settle' asserts only
//   after generated state settled · 'deterministic' satisfiable by
//   latency-immune deterministic moves · 'human-edit' no generation involved
//   · 'fault-path' failure-injection path · 'no-generation').
//
// The BC-I-1 parity set is DERIVED: tag==='assert' && seam && !exempt.
// PARITY_SNAPSHOT is the contract's informative resolution of the rule as of
// ratification; the self-test flags derivation drift for human review (the
// rule wins, per the contract).

const A = (id, title, scenarios, opts = {}) => ({ id, tag: 'assert', title, scenarios, failsToday: false, seam: null, exempt: null, ...opts, area: id.split('-')[1] });
const J = (id, title, scenarios, opts = {}) => ({ id, tag: 'judge', title, scenarios, failsToday: false, seam: null, exempt: null, ...opts, area: id.split('-')[1] });

export const REGISTRY = [
  // ---- A. Intake & first pass ------------------------------------------------
  A('BC-A-1', 'empty seed → focused error summary, no dish', ['a/seed-validation'], { exempt: 'no-generation' }),
  A('BC-A-2', 'servings whole ≥1; violations block submit', ['a/seed-validation'], { exempt: 'no-generation' }),
  A('BC-A-3', 'auto first pass on create only; never on revisit/reload/fail', ['a/auto-first-pass', 'a/auto-first-pass-settled'], { failsToday: true, seam: 'a', exempt: 'live-native' }),
  A('BC-A-4', 'empty-intent Try it never a silent no-op', ['a/idle-intent'], { failsToday: true, exempt: 'no-generation' }),
  A('BC-A-5', 'in-flight affordances locked; dispatch focus lands safely', ['a/inflight-lock', 'a/idle-intent'], { failsToday: true, seam: 'a', exempt: 'live-native' }),
  A('BC-A-6', 'math chips dispatch own moves; auto tag tracks dial', ['a/idle-intent'], { seam: 'b', exempt: 'deterministic' }),
  A('BC-A-7', 'URL-per-dish shareable; cold load renders same dish', ['a/seed-validation'], { exempt: 'no-generation' }),
  J('BC-A-8', 'first-time cook guided by the screen alone', ['a/auto-first-pass']),
  A('BC-A-9', 'invalid scale value never a silent no-op', ['a/idle-intent'], { failsToday: true, exempt: 'no-generation' }),
  A('BC-A-10', 'deterministic math lands correct numbers on the dish', ['a/idle-intent'], { seam: 'a', exempt: 'deterministic' }),
  A('BC-A-11', 'create failure surfaces focused; stays on seed screen', ['a/create-fail'], { exempt: 'fault-path' }),
  A('BC-A-12', 'dish creation idempotent under double submit', ['a/seed-validation'], { failsToday: true, exempt: 'no-generation' }),
  A('BC-A-13', 'failed OR cancelled move never discards typed input', ['a/move-fail', 'a/inflight-lock'], { failsToday: true, exempt: 'fault-path' }),
  A('BC-A-14', 'suggested-next chip dispatches; real accessible name', ['a/idle-intent'], { exempt: 'no-generation' }),

  // ---- B. Proposing state (runs natively in live-sim) -----------------------
  A('BC-B-1', 'proposing state visible ≤1s with working label + Stop', ['b/one-window'], { seam: 'a', exempt: 'live-native' }),
  J('BC-B-2', '25s wait continuously communicates ongoing work', ['b/one-window']),
  A('BC-B-3', 'rationale text streams during generation, not after', ['b/one-window'], { failsToday: true, seam: 'a', exempt: 'live-native' }),
  A('BC-B-4', 'focus never lands on Stop automatically (all trap moments)', ['b/focus-traps'], { failsToday: true, seam: 'a', exempt: 'live-native' }),
  A('BC-B-5', 'Stop → announced cancelled state, safe focus target', ['b/cancel'], { seam: 'a', exempt: 'live-native' }),
  A('BC-B-6', 'cancel discards, never rolls back (deep-equal)', ['b/cancel'], { seam: 'a', exempt: 'live-native' }),
  A('BC-B-7', 'state pill monotone Thinking… → Needs your call', ['b/one-window'], { seam: 'a', exempt: 'live-native' }),
  J('BC-B-8', 'proposal-ready transition unmistakable', ['b/one-window']),
  A('BC-B-9', 'live region announces start and ready', ['b/one-window'], { seam: 'a', exempt: 'live-native' }),
  A('BC-B-10', 'intermediate live-region updates, 2–12s cadence', ['b/one-window'], { failsToday: true, seam: 'a', exempt: 'live-native' }),
  A('BC-B-11', 'reload mid-generation resumes proposing, no duplicate move', ['b/reload-midgen'], { seam: 'a', exempt: 'live-native' }),

  // ---- C. Gate & decisions ---------------------------------------------------
  A('BC-C-1', 'creative proposals always halt at gate, both dial states', ['c/gate-verbs'], { seam: 'a' }),
  A('BC-C-2', 'all six verbs reachable by mouse and keyboard', ['c/gate-verbs'], { seam: 'a', exempt: 'post-settle' }),
  A('BC-C-3', 'accept commits exactly one trial; announced', ['c/gate-verbs'], { seam: 'b' }),
  A('BC-C-4', 'keyboard map safe; Escape never destructive', ['c/gate-verbs', 'b/focus-traps'], { exempt: 'post-settle' }),
  A('BC-C-5', 'take-over validates JSON; valid commit confirmed to AT', ['c/gate-verbs'], { exempt: 'human-edit' }),
  A('BC-C-6', 'redirect cannot fire empty (gate + hold inputs); steer re-proposes', ['c/gate-verbs', 'c/safety'], { seam: 'a' }),
  A('BC-C-7', 'safety hold renders fully; safer steer recovers', ['c/safety'], { seam: 'a' }),
  A('BC-C-8', 'human-edit safety escalates to 409 override dialog', ['c/safety'], { exempt: 'human-edit' }),
  A('BC-C-9', 'busy verb: aria-disabled + spinner, no double-fire', ['c/gate-busy'], { seam: 'b', exempt: 'live-native' }),
  A('BC-C-10', 'two alternatives labeled for AT; picking one stages it', ['c/alternatives-fast'], { failsToday: true, seam: 'a' }),
  J('BC-C-11', 'verbs read as culinary decisions', ['c/gate-verbs']),
  A('BC-C-12', 'proposal honesty renders outside technical view', ['c/trust'], { seam: 'a' }),
  A('BC-C-13', 'tweak pre-seeded, commits one trial, empty-guarded', ['c/gate-verbs'], { failsToday: true, seam: 'b' }),
  A('BC-C-14', 'flavor-trust tally reflects committed draft only', ['c/trust'], { seam: 'b' }),
  A('BC-C-15', 'holds fire for allergen and min-temp rules too', ['c/safety'], { seam: 'a' }),
  A('BC-C-16', 'inline add/change/remove preview with SR annotations', ['c/gate-verbs'], { seam: 'a' }),
  A('BC-C-17', 'post-verb focus lands on stage heading', ['c/gate-verbs'], { seam: 'a', exempt: 'post-settle' }),
  A('BC-C-18', 'gate sub-forms move focus into first input', ['c/gate-verbs'], { seam: 'a', exempt: 'post-settle' }),
  A('BC-C-19', 'shortcuts disableable + remappable (WCAG 2.1.4)', ['c/shortcuts'], { exempt: 'post-settle' }),
  A('BC-C-20', 'no gate decision on a partial alternatives result', ['c/alternatives-live'], { failsToday: true, seam: 'a', exempt: 'live-native' }),
  A('BC-C-21', 'failed gate submission preserves typed input', ['c/gate-fail'], { failsToday: true, exempt: 'fault-path' }),
  A('BC-C-22', 'disclosure toggle carries aria-expanded', ['c/gate-verbs'], { failsToday: true, exempt: 'post-settle' }),
  A('BC-C-23', 'unpreviewable ops disclosed; accept still applies', ['c/gate-verbs'], { seam: 'a', exempt: 'deterministic' }),
  A('BC-C-24', 'alternatives arrival announced; focus placed', ['c/alternatives-live'], { seam: 'a', exempt: 'live-native' }),
  A('BC-C-25', 'low confidence never hides or disables options', ['c/trust'], { seam: 'a' }),
  A('BC-C-26', 'in-app safety disclaimer reachable (⚖ ratified in force)', ['c/safety'], { failsToday: true, exempt: 'no-generation' }),
  A('BC-C-27', 'override "Go back" preserves the typed edit', ['c/safety'], { failsToday: true, exempt: 'human-edit' }),
  A('BC-C-28', 'wrong-shape take-over rejected before commit', ['c/safety'], { failsToday: true, exempt: 'human-edit' }),

  // ---- D. Versions & timeline ------------------------------------------------
  A('BC-D-1', 'every accept appends exactly one Trial node + count', ['d/timeline'], { seam: 'b', exempt: 'deterministic' }),
  A('BC-D-2', 'past trial read-only; both directions announced', ['d/timeline'], { failsToday: true, exempt: 'post-settle' }),
  A('BC-D-3', 'branch + promote end-to-end with Branch badge', ['d/timeline'], { seam: 'b', exempt: 'deterministic' }),
  A('BC-D-4', 'reload restores gate and hold decision state exactly', ['d/reload-state'], { seam: 'a', exempt: 'post-settle' }),
  A('BC-D-5', 'committed work survives a server restart', ['d/restart'], { exempt: 'post-settle' }),
  A('BC-D-6', 'browser Back/Forward re-syncs without stale state', ['d/timeline'], { exempt: 'no-generation' }),
  J('BC-D-7', 'spine reads as a line of development', ['d/timeline']),
  A('BC-D-8', 'recent-dishes list reflects reality', ['d/timeline'], { exempt: 'no-generation' }),
  A('BC-D-9', 'stage shows the accepted draft, not the prior version', ['d/timeline'], { seam: 'b' }),
  A('BC-D-10', 'honesty detail + constraints echo are truthful', ['d/honesty'], { exempt: 'post-settle' }),
  A('BC-D-11', 'route change focuses destination h1; title tracks', ['d/timeline'], { exempt: 'no-generation' }),
  A('BC-D-12', 'trial rationale recoverable in technical view (⚖ in force)', ['d/timeline'], { failsToday: true, exempt: 'post-settle' }),
  A('BC-D-13', 'exactly one aria-current trial, tracking accepts/promote', ['d/timeline'], { seam: 'b', exempt: 'deterministic' }),

  // ---- E. Post-cook loop -----------------------------------------------------
  A('BC-E-1', 'cook → rework runs against exactly the cooked version', ['e/postcook'], { seam: 'b' }),
  A('BC-E-2', 'cooked trial badged with the note echoed', ['e/postcook'], { exempt: 'post-settle' }),
  J('BC-E-3', 'cook → taste → rework legible as closing the loop', ['e/postcook']),
  A('BC-E-4', 'tasting form manages focus like the gate forms', ['e/postcook'], { failsToday: true, exempt: 'no-generation' }),
  A('BC-E-5', 'failed rework preserves typed tasting notes', ['e/rework-fail'], { failsToday: true, exempt: 'fault-path' }),

  // ---- F. Autonomy dial ------------------------------------------------------
  A('BC-F-1', 'dial is a labeled switch persisted on the dish', ['f/dial'], { exempt: 'no-generation' }),
  A('BC-F-2', 'dial ON: deterministic auto-applies, visibly confirmed', ['f/dial'], { seam: 'b', exempt: 'deterministic' }),
  A('BC-F-3', 'auto-applied trials stay attributable after the fact', ['f/dial'], { failsToday: true, seam: 'b' }),
  A('BC-F-4', 'dial OFF: same deterministic move stops at the gate', ['f/dial'], { seam: 'a', exempt: 'deterministic' }),

  // ---- G. Modes & a11y chrome ------------------------------------------------
  A('BC-G-1', 'technical view reveals the machinery; persists', ['g/desktop-modes'], { exempt: 'post-settle' }),
  A('BC-G-2', 'theme cycles system→light→dark, persists, pins data-theme', ['g/desktop-modes'], { exempt: 'no-generation' }),
  J('BC-G-3', 'both themes legible across the 5 core states', ['g/desktop-modes']),
  A('BC-G-4', 'reduced motion honored without losing the alive-signal', ['g/reduced-motion'], { seam: 'a', exempt: 'live-native' }),
  A('BC-G-5', '390px: one column, sticky gate, no horizontal overflow', ['g/narrow-390', 'g/narrow-live'], { exempt: 'no-generation' }),
  J('BC-G-6', 'phone width: every loop step visually reachable', ['g/narrow-390']),
  A('BC-G-7', 'skip links are the first two focusables and work', ['g/desktop-modes'], { exempt: 'no-generation' }),
  A('BC-G-8', 'hit areas ≥24×24 on core + recovery surfaces', ['g/desktop-modes', 'g/narrow-390'], { exempt: 'no-generation' }),
  A('BC-G-9', 'focus visible at every Tab stop, both themes', ['g/desktop-modes'], { exempt: 'no-generation' }),
  A('BC-G-10', 'text contrast meets AA numerically, both themes', ['g/desktop-modes'], { failsToday: true, exempt: 'no-generation' }),
  A('BC-G-11', 'focus indicator ≥3:1 against adjacent background', ['g/desktop-modes'], { exempt: 'no-generation' }),
  A('BC-G-12', '320px reflow without loss or clipping', ['g/narrow-320', 'g/narrow-live-320'], { exempt: 'no-generation' }),
  A('BC-G-13', 'dial/invalid/hold boundaries ≥3:1 in both states', ['g/desktop-modes'], { exempt: 'no-generation' }),
  A('BC-G-14', 'sticky chrome never obscures the focus target', ['g/narrow-390', 'g/narrow-320'], { exempt: 'no-generation' }),
  A('BC-G-15', 'WCAG 1.4.12 text-spacing overrides break nothing', ['g/desktop-modes'], { exempt: 'no-generation' }),

  // ---- H. Errors & resilience ------------------------------------------------
  A('BC-H-1', 'backend unreachable → announced failure + escape hatch', ['h/server-down'], { failsToday: true, exempt: 'fault-path' }),
  A('BC-H-2', 'SSE drop banner appears and clears after reconnect', ['h/sse-drop'], { exempt: 'no-generation' }),
  A('BC-H-3', 'a drop during generation cannot strand the cook', ['h/drop-midgen'], { seam: 'a', exempt: 'live-native' }),
  A('BC-H-4', 'failed move (budget) → move-failed banner + Try again', ['h/budget'], { exempt: 'fault-path' }),
  A('BC-H-5', '4xx conflict surfaces the server message, dismissible', ['h/conflict'], { seam: 'b', exempt: 'post-settle' }),
  A('BC-H-6', 'stub banner honest in both directions', ['h/live-nokey', 'h/sse-drop'], { exempt: 'no-generation' }),
  A('BC-H-7', 'unknown dish deep-link fails soft and audibly', ['h/server-down'], { failsToday: true, exempt: 'no-generation' }),
  A('BC-H-8', 'landing list failure announced; seed form usable', ['h/server-down'], { failsToday: true, exempt: 'fault-path' }),
  A('BC-H-9', 'dish-load wait exposed via role=status', ['h/server-down'], { failsToday: true, exempt: 'no-generation' }),

  // ---- I. Live-mode parity ---------------------------------------------------
  A('BC-I-1', 'every parity-set assert passes identically under live-sim', ['(parity meta-run)'], { exempt: 'no-generation' }),
  J('BC-I-2', 'the 25s wait is survivable end-to-end', ['i/journey'], { failsToday: true }),
  A('BC-I-3', 'workbench stays honest during a long generation', ['i/journey'], { seam: 'a', exempt: 'live-native' }),

  // ---- J. Guardrails ----------------------------------------------------------
  A('BC-J-1', 'frozen instruments byte-untouched vs 32afe54', ['(guardrails)'], { exempt: 'no-generation' }),
  A('BC-J-2', 'make test / make vet / tsc / vitest all green', ['(guardrails)'], { exempt: 'no-generation' }),
  A('BC-J-3', 'contract.md at HEAD byte-identical to the pin', ['(guardrails)'], { exempt: 'no-generation' }),
  A('BC-J-4', 'PREREGISTRATION.md byte-untouched all milestone', ['(guardrails)'], { exempt: 'no-generation' }),
  A('BC-J-5', 'operator DB still holds exactly the baseline 6 events', ['(guardrails)'], { exempt: 'no-generation' }),
  J('BC-J-6', 'README media truthful at exit (B5-only, parked)', ['(guardrails)']),
  A('BC-J-7', 'no dead criteria: every id reported explicitly', ['(report-validator)'], { exempt: 'no-generation' }),
];

export const byId = new Map(REGISTRY.map((e) => [e.id, e]));

// BC-I-1 membership, derived from the rule via the per-criterion metadata.
export function deriveParitySet() {
  return REGISTRY.filter((e) => e.tag === 'assert' && e.seam && !e.exempt).map((e) => e.id);
}

// The contract's informative snapshot of the rule's resolution at
// ratification. The self-test compares deriveParitySet() to this and flags
// drift for human review — the rule wins, never this list.
export const PARITY_SNAPSHOT = [
  'BC-C-1', 'BC-C-3', 'BC-C-6', 'BC-C-7', 'BC-C-10', 'BC-C-12', 'BC-C-13',
  'BC-C-14', 'BC-C-15', 'BC-C-16', 'BC-C-25', 'BC-D-9', 'BC-E-1', 'BC-F-3',
];

export const CONTRACT_PIN = '965c8ebf5dd752c2a9d23bb2a796a7935fcff6d9';

export const EXPECTED_COUNTS = { total: 109, assert: 99, judge: 10 };
