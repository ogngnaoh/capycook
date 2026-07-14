// Falsifiability layer 2 — the sabotage table. Each row targets ONE
// evaluator class with no natural FAILS-TODAY failure: the sabotage is
// installed in the page BEFORE the target scenario runs, and the target
// criterion MUST flip to FAIL. A sabotage that leaves its check green means
// the evaluator is vacuous — the self-test fails and the harness may not be
// trusted (B4 refuses to run).
//
// install(page) runs after the instrument, before the scenario body. Keep
// each sabotage as narrow as its class allows; scenario is the registry
// scenario re-run under sabotage; expectFail is the criterion whose row must
// flip. `alsoAllowed` lists criteria that may incidentally fail under this
// sabotage without invalidating the probe (collateral damage is expected —
// only expectFail's flip is asserted).

export const MUTATIONS = [
  {
    name: 'strip-role-alert',
    class: 'aria-live/alert assertions',
    scenario: 'a/seed-validation',
    expectFail: 'BC-A-1',
    alsoAllowed: ['BC-A-2', 'BC-A-12', 'BC-A-7'],
    install: (page) => page.evaluateOnNewDocument(() => {
      // Continuously strip role="alert" so the error-summary assertions
      // cannot see it — a vacuous alert check would still pass.
      // ⚠ documentElement is null at document-start: defer like
      // lib/instrument.mjs does or the observer install throws silently.
      const start = () => {
        const strip = () => document.querySelectorAll('[role="alert"]').forEach((el) => el.removeAttribute('role'));
        new MutationObserver(strip).observe(document.documentElement, { subtree: true, childList: true, attributes: true });
        strip();
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
      else start();
    }),
  },
  {
    name: 'double-fire-moves',
    class: 'network-count assertions',
    scenario: 'a/idle-intent',
    expectFail: 'BC-A-6',
    alsoAllowed: ['BC-A-4', 'BC-A-9', 'BC-A-14', 'BC-A-10', 'BC-A-5'],
    install: (page) => page.evaluateOnNewDocument(() => {
      // Every POST …/move is silently duplicated: "exactly one POST"
      // evaluators must catch the second request.
      const orig = window.fetch;
      window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : input.url;
        if (init && init.method === 'POST' && /\/api\/dishes\/[^/]+\/move$/.test(new URL(url, location.origin).pathname)) {
          orig.call(this, input, init).catch(() => {});
        }
        return orig.call(this, input, init);
      };
    }),
  },
  {
    name: 'freeze-dish-numbers',
    class: 'server-draft-vs-UI numeric assertions',
    scenario: 'a/idle-intent',
    expectFail: 'BC-A-10',
    alsoAllowed: ['BC-A-4', 'BC-A-9', 'BC-A-14', 'BC-A-6', 'BC-A-5'],
    install: (page) => page.evaluateOnNewDocument(() => {
      // Rewrite every ingredient-row to a fixed sentinel: the UI stops
      // reflecting the server draft, so BC-A-10's mirror checks must fail
      // while the server math stays correct. (A first-seen WeakMap freeze
      // is defeated by React replacing row nodes on re-render; the constant
      // rewrite is not. Deferred install — documentElement is null at
      // document-start.)
      const start = () => {
        const SENTINEL = 'sabotaged-row 999 xx';
        const freeze = () => document.querySelectorAll('[data-testid="ingredient-row"]').forEach((el) => {
          if (el.textContent !== SENTINEL) el.textContent = SENTINEL;
        });
        new MutationObserver(freeze).observe(document.documentElement, { subtree: true, childList: true, characterData: true });
        freeze();
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
      else start();
    }),
  },
  {
    name: 'zero-focus-outlines',
    class: 'focus-visibility sweeps (computed-style)',
    scenario: 'g/desktop-modes',
    expectFail: 'BC-G-9',
    alsoAllowed: ['BC-G-1', 'BC-G-2', 'BC-G-7', 'BC-G-8', 'BC-G-10', 'BC-G-11', 'BC-G-13', 'BC-G-15'],
    install: (page) => page.evaluateOnNewDocument(() => {
      const s = document.createElement('style');
      s.textContent = '*:focus, *:focus-visible { outline: none !important; box-shadow: none !important; }';
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s));
    }),
  },
  {
    name: 'low-contrast-ink',
    class: 'numeric contrast walks',
    scenario: 'g/desktop-modes',
    expectFail: 'BC-G-10',
    alsoAllowed: ['BC-G-1', 'BC-G-2', 'BC-G-7', 'BC-G-8', 'BC-G-9', 'BC-G-11', 'BC-G-13', 'BC-G-15'],
    install: (page) => page.evaluateOnNewDocument(() => {
      const s = document.createElement('style');
      // #999 on white ≈ 2.85:1 — must trip the 4.5:1 floor everywhere.
      s.textContent = 'body, body * { color: #999999 !important; }';
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s));
    }),
  },
  {
    name: 'shrink-hit-areas',
    class: 'hit-area rect sweeps',
    scenario: 'g/desktop-modes',
    expectFail: 'BC-G-8',
    alsoAllowed: ['BC-G-1', 'BC-G-2', 'BC-G-7', 'BC-G-9', 'BC-G-10', 'BC-G-11', 'BC-G-13', 'BC-G-15'],
    install: (page) => page.evaluateOnNewDocument(() => {
      const s = document.createElement('style');
      s.textContent = 'button, [role="switch"], a { min-height: 10px !important; min-width: 10px !important; height: 10px !important; padding: 0 !important; font-size: 4px !important; }';
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s));
    }),
  },
  {
    name: 'mute-live-region',
    class: 'live-region text assertions',
    scenario: 'b/one-window',
    expectFail: 'BC-B-9',
    alsoAllowed: ['BC-B-1', 'BC-B-3', 'BC-B-7', 'BC-B-10'],
    install: (page) => page.evaluateOnNewDocument(() => {
      // REMOVE the gate live region as it mounts — the AT analog of a page
      // that never announces. (Text-blanking races the instrument's own
      // observer on the same mutation batch — Chrome's delivery order proved
      // unreliable — whereas removal is ordering-proof: React keeps mutating
      // the detached node and nothing announcement-shaped ever exists in
      // the document.)
      const start = () => {
        const drop = () => document.querySelectorAll('[data-testid="gate-live-region"]').forEach((el) => el.remove());
        new MutationObserver(drop).observe(document.documentElement, { subtree: true, childList: true });
        drop();
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
      else start();
    }),
  },
  {
    name: 'hide-proposing-card',
    class: 'proposing-surface presence/timing',
    scenario: 'b/one-window',
    expectFail: 'BC-B-1',
    alsoAllowed: ['BC-B-3', 'BC-B-7', 'BC-B-9', 'BC-B-10'],
    install: (page) => page.evaluateOnNewDocument(() => {
      const s = document.createElement('style');
      s.textContent = '[data-testid="proposing-card"] { display: none !important; }';
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s));
    }),
  },
  {
    name: 'overflow-narrow',
    class: 'horizontal-overflow measurements',
    scenario: 'g/narrow-390',
    expectFail: 'BC-G-5',
    alsoAllowed: ['BC-G-8', 'BC-G-14', 'BC-G-6'],
    install: (page) => page.evaluateOnNewDocument(() => {
      const s = document.createElement('style');
      s.textContent = 'body::after { content: ""; display: block; width: 900px; height: 2px; }';
      document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s));
    }),
  },
  {
    name: 'steal-focus-to-stop',
    class: 'focus-target assertions (moment-armed)',
    scenario: 'b/cancel',
    expectFail: 'BC-B-5',
    alsoAllowed: ['BC-B-6'],
    install: (page) => page.evaluateOnNewDocument(() => {
      // After any focus change, drop focus to body — "focus lands on a
      // defined, attached target" checks must catch the body landing.
      document.addEventListener('focusin', () => {
        setTimeout(() => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); }, 0);
      });
    }),
  },
];
