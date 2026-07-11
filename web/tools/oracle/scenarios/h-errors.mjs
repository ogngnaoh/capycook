// Area H — errors & resilience. Transcribes BC-H-1…BC-H-9. Shapes copied from
// a-intake.mjs (THE pattern-setter): bounded waits (a state that never arrives
// is an assert FAIL with observed 'never', never a hang), NetLog POST counts
// via ctx.net, SIGKILL/restart for SSE-drop criteria, sub-check names for
// criteria split across scenarios (BC-H-6 = stub-half ∧ live-half). The
// contract (docs/02b-behavior-contract/contract.md) is the only normative text.
//
// Liveness assertions ("role=alert/status in the accessibility tree") read the
// DOM's explicit role / aria-live: the app expresses every live region that
// way (reconnect-banner role=status, move-failed-banner role=alert), and the
// broken paths this area targets are plain <p>/<div> with neither — so an
// explicit-role/aria-live probe is a faithful stand-in for the a11y tree and
// distinguishes pass from fail exactly where the contract says it should.
import {
  sleep, clickVerb, waitForVerb, setValue,
  SEED_TEXT, describeActiveElement,
} from '../lib/page.mjs';
import { seedTrials, waitForPending, CONSTRAINTS } from '../lib/api.mjs';
import { installFaultInjector } from '../lib/net.mjs';

const MOVE_RE = /^\/api\/dishes\/[^/]+\/move$/;
const DETAIL_RE = /^\/api\/dishes\/[^/]+$/; // GET detail only (not /versions, /stream)

const gotoDish = async (page, base, dishId) => {
  await page.goto(`${base}/dishes/${dishId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#stage-heading', { timeout: 8000 });
};

// Generic bounded poll: returns true once fn() is truthy, false on timeout.
const waitFor = async (fn, timeout = 8000, interval = 150) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { if (await fn()) return true; } catch { /* keep polling */ }
    await sleep(interval);
  }
  return false;
};

// Client-side route change through the app's History API (App.tsx listens for
// popstate). Used where a full page.goto would fetch the shell from a dead
// server (BC-H-1/BC-H-8): the SPA must already be running.
const clientNavigate = (page, to) => page.evaluate((url) => {
  window.history.pushState({}, '', url);
  window.dispatchEvent(new PopStateEvent('popstate'));
}, to);

// Describe the deepest element whose text matches, and whether it OR an
// ancestor carries a live-region role/aria-live — the exact question the
// "announced" clauses ask of the accessibility tree.
const describeTextEl = (page, textReSrc) => page.evaluate((src) => {
  const re = new RegExp(src);
  const all = [...document.querySelectorAll('body *')].filter((e) => re.test(e.textContent || ''));
  let best = null;
  for (const e of all) { if (!best || best.contains(e)) best = e; }
  if (!best) return null;
  const liveAncestor = (() => {
    let n = best;
    while (n) {
      const r = n.getAttribute && n.getAttribute('role');
      const al = n.getAttribute && n.getAttribute('aria-live');
      if (r === 'status' || r === 'alert' || (al && al !== 'off')) return { role: r || null, ariaLive: al || null };
      n = n.parentElement;
    }
    return null;
  })();
  return {
    tag: best.tagName.toLowerCase(), role: best.getAttribute('role'),
    ariaLive: best.getAttribute('aria-live'),
    text: (best.textContent || '').trim().slice(0, 140), liveAncestor,
  };
}, textReSrc);

// The first visible [role="alert"] whose text matches, with whether it packs a
// Dismiss control (BC-H-5's banner is critical + dismissible).
const alertWithText = (page, textReSrc) => page.evaluate((src) => {
  const re = new RegExp(src);
  const hit = [...document.querySelectorAll('[role="alert"]')].find(
    (e) => e.offsetParent !== null && re.test(e.textContent || ''));
  if (!hit) return null;
  return {
    text: (hit.textContent || '').trim().slice(0, 200),
    dismiss: [...hit.querySelectorAll('button')].some((b) => /dismiss/i.test(b.textContent)),
    testid: hit.getAttribute('data-testid'),
  };
}, textReSrc);

const bodyHasText = (page, textReSrc) =>
  page.evaluate((src) => new RegExp(src).test(document.body.textContent || ''), textReSrc);

// Is focus on the error region itself or its escape hatch ("Back to dishes")?
const focusOnErrorTarget = (page, textReSrc) => page.evaluate((src) => {
  const re = new RegExp(src);
  const el = document.activeElement;
  if (!el || el === document.body) return { ok: false, isBody: el === document.body };
  const t = (el.textContent || '').trim();
  const isBack = el.tagName === 'BUTTON' && /back to dishes/i.test(t);
  const isRegion = re.test(t);
  return { ok: isBack || isRegion, isBody: false, isBack, isRegion, tag: el.tagName.toLowerCase(), text: t.slice(0, 60) };
}, textReSrc);

export const scenarios = [

  // ---------------------------------------------------------------------------
  // h/budget (budget profile: LLM_BUDGET_USD=0): BC-H-4 — a refused move
  // surfaces the move-failed banner (reason + Try again), never a safety hold.
  // setup seedTrials(0) creates the dish with NO moves (the budget cap would
  // refuse a setup move); the setupFast trick seeds at $10 then restarts at $0.
  // ---------------------------------------------------------------------------
  {
    id: 'h/budget',
    profile: 'budget',
    criteria: ['BC-H-4'],
    setup: seedTrials(0),
    run: async (ctx, dishId) => {
      const { page, base, net } = ctx;
      await gotoDish(page, base, dishId);
      await page.waitForSelector('#cc-intent', { timeout: 8000 });

      await ctx.check('BC-H-4', async (t) => {
        // Dispatch a creative intent (empty moveType, classified server-side).
        const mark = net.mark();
        await page.focus('#cc-intent');
        await page.type('#cc-intent', 'brighten it with a fresh herb finish');
        await page.keyboard.press('Enter');

        const banner = await page.waitForSelector('[data-testid="move-failed-banner"]', { timeout: 15000 })
          .then(() => true).catch(() => false);
        t.expect(banner, 'move-failed banner appears after the refused move', { observed: banner ? 'shown' : 'never' });

        const info = await page.evaluate(() => {
          const b = document.querySelector('[data-testid="move-failed-banner"]');
          if (!b) return null;
          return {
            role: b.getAttribute('role'),
            text: (b.textContent || '').trim(),
            hasTryAgain: [...b.querySelectorAll('button')].some((x) => /try again/i.test(x.textContent)),
            safetyHold: !!document.querySelector('[data-testid="safety-hold"]'),
          };
        });
        t.observe('banner', info);
        if (info) {
          t.expectEq(info.role, 'alert', 'banner carries role="alert"');
          t.expectMatch(info.text, /budget/i, 'banner states the reason (budget exhaustion)');
          t.expect(info.hasTryAgain, 'a "Try again" control is offered', { observed: info.hasTryAgain });
          t.expect(!info.safetyHold, 'never a safety hold on a budget failure', { observed: info.safetyHold });
        }
        // At least one POST …/move fired (the refused dispatch).
        t.expect(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }) >= 1, 'the move POST fired',
          { observed: net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }) });

        // Focus is attached and not dropped to <body> after the failure
        // transition (the proposing surface unmounts on failure).
        const active = await describeActiveElement(page);
        t.observe('activeAfterFailure', active);
        t.expect(active.isConnected === true, 'focus target still attached after failure', { observed: active });
        t.expect(active.isBody === false, 'focus not dropped to document.body', { observed: active.isBody });

        // "Try again" re-dispatches and fails again, consistently.
        const mark2 = net.mark();
        await page.evaluate(() => {
          const b = document.querySelector('[data-testid="move-failed-banner"]');
          const btn = b && [...b.querySelectorAll('button')].find((x) => /try again/i.test(x.textContent));
          if (btn) btn.click();
        });
        const reappeared = await waitFor(
          () => page.evaluate(() => !!document.querySelector('[data-testid="move-failed-banner"]')), 15000);
        t.expect(reappeared, 'the failure recurs consistently on retry', { observed: reappeared });
        t.expect(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark2 }) >= 1, 'Try again fired a second POST …/move',
          { observed: net.count({ method: 'POST', pathRe: MOVE_RE, since: mark2 }) });
        const stillNoHold = await page.evaluate(() => !document.querySelector('[data-testid="safety-hold"]'));
        t.expect(stillNoHold, 'retry still never renders a safety hold', { observed: !stillNoHold });
      });
    },
  },

  // ---------------------------------------------------------------------------
  // h/live-nokey (live-nokey profile: stub flag unset + dummy key): BC-H-6
  // live half — /api/status reports live and no stub banner renders. No move
  // is submitted (zero spend — the Profiles carve-out).
  // ---------------------------------------------------------------------------
  {
    id: 'h/live-nokey',
    profile: 'live-nokey',
    criteria: ['BC-H-6'],
    run: async (ctx) => {
      const { page, base, api } = ctx;
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#field-seed', { timeout: 8000 });

      await ctx.check('BC-H-6', async (t) => {
        const status = await api('GET', '/api/status');
        t.observe('status', status);
        t.expectEq(status.llm_mode, 'live', '/api/status reports live mode');
        const stubBanner = await page.evaluate(() => !!document.querySelector('[data-testid="stub-banner"]'));
        t.expect(!stubBanner, 'no stub banner renders in live mode', { observed: stubBanner });
      }, { name: 'live-half' });
    },
  },

  // ---------------------------------------------------------------------------
  // h/sse-drop (fast): BC-H-2 (drop banner appears + clears) and BC-H-6 stub
  // half (the stub banner is honest with budget figures).
  // ---------------------------------------------------------------------------
  {
    id: 'h/sse-drop',
    profile: 'fast',
    criteria: ['BC-H-2', 'BC-H-6'],
    setup: seedTrials(0),
    run: async (ctx, dishId) => {
      const { page, base, server } = ctx;
      await gotoDish(page, base, dishId);

      // BC-H-6 stub half: the banner tells the truth with a budget meter.
      await ctx.check('BC-H-6', async (t) => {
        const info = await page.evaluate(() => {
          const b = document.querySelector('[data-testid="stub-banner"]');
          return b ? { text: (b.textContent || '').trim() } : null;
        });
        t.expect(!!info, 'stub banner present in stub mode', { observed: info });
        if (info) {
          t.expectMatch(info.text, /stub mode/i, 'banner names stub mode');
          t.expectMatch(info.text, /budget\s*\$\d/i, 'banner shows the budget figures');
        }
      }, { name: 'stub-half' });

      // BC-H-2: SIGKILL drops the SSE (SIGTERM would drain it gracefully), the
      // reconnect banner (role=status) shows, then clears after restart+resync.
      await ctx.check('BC-H-2', async (t) => {
        await sleep(800); // let the EventSource finish connecting
        await server.stop('SIGKILL');
        const appeared = await waitFor(
          () => page.evaluate(() => !!document.querySelector('[data-testid="reconnect-banner"]')), 15000);
        t.expect(appeared, 'reconnect banner appears on the drop', { observed: appeared ? 'shown' : 'never' });
        const region = await describeTextEl(page, 'Reconnecting — your draft is safe\\.');
        t.observe('reconnectRegion', region);
        t.expect(!!region && (region.liveAncestor?.role === 'status' || region.role === 'status'),
          'the reconnect banner is a role="status" live region', { observed: region });

        await server.restart();
        const cleared = await waitFor(
          () => page.evaluate(() => !document.querySelector('[data-testid="reconnect-banner"]')), 30000);
        t.expect(cleared, 'reconnect banner clears after reconnect', { observed: cleared });
        const restored = await page.evaluate(() => !!document.querySelector('#stage-heading'));
        t.expect(restored, 'dish state re-renders after resync', { observed: restored });
      });
    },
  },

  // ---------------------------------------------------------------------------
  // h/drop-midgen (live-sim): BC-H-3 — a drop DURING generation cannot strand
  // the cook. On SIGKILL the stub server loses the in-flight move (it lives in
  // memory only; Status() returns idle for an unknown dish after restart), so
  // after reconnect+resync the workbench recovers to an actionable state
  // (outcome, re-synced pending proposal, or idle intent bar) with no new user
  // action — never stuck in a backing-less proposing state.
  // ---------------------------------------------------------------------------
  {
    id: 'h/drop-midgen',
    profile: 'live-sim',
    criteria: ['BC-H-3'],
    setup: seedTrials(0),
    run: async (ctx, dishId) => {
      const { page, base, net, server } = ctx;
      await gotoDish(page, base, dishId);
      await page.waitForSelector('#cc-intent', { timeout: 8000 });

      await ctx.check('BC-H-3', async (t) => {
        const mark = net.mark();
        await page.focus('#cc-intent');
        await page.type('#cc-intent', 'push it toward smoke and citrus');
        await page.keyboard.press('Enter');
        const proposing = await page.waitForSelector('[data-testid="proposing-card"]', { timeout: 8000 })
          .then(() => true).catch(() => false);
        t.expect(proposing, 'the move enters a proposing state', { observed: proposing ? 'proposing' : 'never' });
        t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 1, 'exactly one move dispatched');

        await sleep(3000); // well inside the 25s window
        await server.stop('SIGKILL');
        await waitFor(() => page.evaluate(() => !!document.querySelector('[data-testid="reconnect-banner"]')), 15000);
        await server.restart();

        // After reconnect the banner clears and the workbench resyncs.
        const cleared = await waitFor(
          () => page.evaluate(() => !document.querySelector('[data-testid="reconnect-banner"]')), 30000);
        t.expect(cleared, 'reconnected and resynced (banner cleared)', { observed: cleared });
        await sleep(600); // let the resync render settle

        const surface = await page.evaluate(() => ({
          proposing: !!document.querySelector('[data-testid="proposing-card"]'),
          gate: !!document.querySelector('button[data-verb="accept"]'),
          moveFailed: !!document.querySelector('[data-testid="move-failed-banner"]'),
          intent: !!document.querySelector('#cc-intent'),
          hold: !!document.querySelector('[data-testid="safety-hold"]'),
        }));
        t.observe('surfaceAfterReconnect', surface);
        // Not stranded: a decision surface, a terminal banner, or the idle
        // intent bar is present — and it is NOT stuck proposing with a dead
        // backing generation.
        const actionable = surface.gate || surface.moveFailed || surface.intent || surface.hold;
        t.expect(actionable, 'an actionable surface renders without new user action', { observed: surface });
        t.expect(!surface.proposing, 'not stranded in a backing-less proposing state', { observed: surface.proposing });
        t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 1,
          'no new move fired by the resync (still exactly one)', );
      });
    },
  },

  // ---------------------------------------------------------------------------
  // h/server-down (fast): BC-H-7 (unknown deep-link), BC-H-9 (loading wait),
  // BC-H-1 (backend unreachable), BC-H-8 (landing list failure). Two real
  // dishes are pre-seeded: one to load a legible workbench, one to deep-link
  // into while the server is dead.
  // ---------------------------------------------------------------------------
  {
    id: 'h/server-down',
    profile: 'fast',
    criteria: ['BC-H-1', 'BC-H-7', 'BC-H-8', 'BC-H-9'],
    setup: async ({ api }) => {
      const a = await api('POST', '/api/dishes', { seed: SEED_TEXT, constraints: CONSTRAINTS });
      const b = await api('POST', '/api/dishes', { seed: SEED_TEXT, constraints: CONSTRAINTS });
      return { dishA: a.id, dishB: b.id };
    },
    run: async (ctx, ids) => {
      const { page, base, server } = ctx;
      const ERR = 'Could not load this dish';

      // BC-H-7: an unknown dish deep-link fails soft and audibly (server UP).
      await ctx.check('BC-H-7', async (t) => {
        const errBefore = ctx.pageErrors.length;
        await page.goto(`${base}/dishes/nope-not-real`, { waitUntil: 'domcontentloaded' });
        const shown = await waitFor(() => bodyHasText(page, ERR), 3000);
        t.expect(shown, 'could-not-load card renders within 3s', { observed: shown ? 'shown' : 'never' });
        const region = await describeTextEl(page, ERR);
        t.observe('errorRegion', region);
        t.expect(!!region && region.liveAncestor?.role === 'alert',
          'the error card is a role="alert" live region', { observed: region });
        const focus = await focusOnErrorTarget(page, ERR);
        t.observe('focus', focus);
        t.expect(focus.ok, 'focus lands on the error region or "Back to dishes"', { observed: focus });
        const hatch = await page.evaluate(() =>
          [...document.querySelectorAll('button')].some((b) => /back to dishes/i.test(b.textContent)));
        t.expect(hatch, 'an escape hatch ("Back to dishes") is present', { observed: hatch });
        t.expectEq(ctx.pageErrors.length, errBefore, 'no uncaught exception on this path');
      });

      // BC-H-9: the initial dish-load wait is legible to AT. A 2s delay fault
      // on GET /api/dishes/:id holds the workbench in its loading placeholder.
      const removeDelay = await installFaultInjector(page, [
        { method: 'GET', pathRe: DETAIL_RE, action: 'delay', ms: 2000 },
      ]);
      try {
        await ctx.check('BC-H-9', async (t) => {
          await page.goto(`${base}/dishes/${ids.dishA}`, { waitUntil: 'domcontentloaded' });
          const loading = await waitFor(() => bodyHasText(page, 'Loading the dish'), 3000);
          t.expect(loading, 'the loading placeholder renders during the wait', { observed: loading ? 'shown' : 'never' });
          const region = await describeTextEl(page, 'Loading the dish');
          t.observe('loadingRegion', region);
          t.expect(!!region && (region.liveAncestor?.role === 'status'
              || (region.liveAncestor?.ariaLive && region.liveAncestor.ariaLive !== 'off')),
            'the loading placeholder is exposed via role="status"/live region', { observed: region });
          // Let the delayed GET resolve so the SPA is fully loaded for BC-H-1.
          await page.waitForSelector('#cc-intent', { timeout: 8000 }).catch(() => {});
        });
      } finally {
        await removeDelay();
      }

      // BC-H-1: backend unreachable → announced failure + escape hatch. The SPA
      // is already loaded; kill the API and CLIENT-SIDE navigate to a real dish
      // (a full goto would fetch the shell from the dead server and blank).
      await ctx.check('BC-H-1', async (t) => {
        const errBefore = ctx.pageErrors.length;
        await server.stop('SIGKILL');
        await clientNavigate(page, `/dishes/${ids.dishB}`);
        const shown = await waitFor(() => bodyHasText(page, ERR), 8000);
        t.expect(shown, 'error card renders on the unreachable-backend path', { observed: shown ? 'shown' : 'never' });
        const region = await describeTextEl(page, ERR);
        t.observe('errorRegion', region);
        t.expect(!!region && region.liveAncestor?.role === 'alert',
          'the error card is a role="alert" live region', { observed: region });
        const focus = await focusOnErrorTarget(page, ERR);
        t.observe('focus', focus);
        t.expect(focus.ok, 'focus lands on the error region or "Back to dishes"', { observed: focus });
        const hatch = await page.evaluate(() =>
          [...document.querySelectorAll('button')].some((b) => /back to dishes/i.test(b.textContent)));
        t.expect(hatch, 'an escape hatch is present', { observed: hatch });
        t.expectEq(ctx.pageErrors.length, errBefore, 'no uncaught exception on this path');
      });

      // BC-H-8: the landing list fails audibly; the seed form stays usable.
      await ctx.check('BC-H-8', async (t) => {
        const LIST_ERR = 'dish list did not load';
        await clientNavigate(page, '/');
        const shown = await waitFor(() => bodyHasText(page, LIST_ERR), 8000);
        t.expect(shown, 'the list-failure message renders', { observed: shown ? 'shown' : 'never' });
        const region = await describeTextEl(page, LIST_ERR);
        t.observe('listErrorRegion', region);
        t.expect(!!region && (region.liveAncestor?.role === 'status' || region.liveAncestor?.role === 'alert'
            || (region.liveAncestor?.ariaLive && region.liveAncestor.ariaLive !== 'off')),
          'the list-failure message carries a live-region role', { observed: region });
        // The seed form still accepts typed input.
        await page.waitForSelector('#field-seed', { timeout: 8000 });
        await setValue(page, '#field-seed', 'a quick weeknight pasta');
        const typed = await page.evaluate(() => document.querySelector('#field-seed')?.value);
        t.expectEq(typed, 'a quick weeknight pasta', 'the seed field still accepts typed input');
      });
    },
  },

  // ---------------------------------------------------------------------------
  // h/conflict (fast): BC-H-5 — a 4xx conflict surfaces the server's message,
  // dismissible. NOTE: every gate verb is idempotent keyed on proposalId
  // (verbs.go:56-60) — re-gating a *resolved* proposal (accept, or regenerate,
  // which memoizes its target at verbs.go:313) is a no-op success, never a 4xx.
  // The ONE proposal that goes stale WITHOUT being resolved is an un-gated
  // alternative: resolveToIdle discards the sibling cards, and their ids
  // thereafter resolve to ErrUnknownProposal (verbs.go:340-341). So the genuine
  // "gating a stale/decided proposal" race is: pre-seed an alternatives gate
  // (two proposals), tab A accepts alternative A, then tab B — unaware — gates
  // the now-stale alternative B → 404 → the critical role="alert" banner. Both
  // tabs are real pages in one browser context (the second not recorded).
  // ---------------------------------------------------------------------------
  {
    id: 'h/conflict',
    profile: 'fast',
    criteria: ['BC-H-5'],
    record: false,
    setup: async ({ api }) => {
      const dish = await api('POST', '/api/dishes', { seed: SEED_TEXT, constraints: CONSTRAINTS });
      await api('POST', `/api/dishes/${dish.id}/move`, { moveType: 'flavor_direction', steer: 'brighten it with fresh herbs' });
      const prop = await waitForPending(api, dish.id);
      // Branch into two alternatives so one can go stale un-gated.
      await api('POST', `/api/dishes/${dish.id}/gate`, { proposalId: prop.id, verb: 'alternatives' });
      const start = Date.now();
      let props = [];
      while (Date.now() - start < 30000) {
        const d = await api('GET', `/api/dishes/${dish.id}`);
        const pend = d.pendingProposals || (d.pendingProposal ? [d.pendingProposal] : []);
        if (d.state === 'awaiting_gate' && pend.length >= 2) { props = pend; break; }
        await new Promise((r) => setTimeout(r, 150));
      }
      if (props.length < 2) throw new Error(`h/conflict setup: alternatives never produced two proposals (got ${props.length})`);
      return { dishId: dish.id, altA: props[0].id, altB: props[1].id };
    },
    run: async (ctx, seeded) => {
      const { page, base, api } = ctx;
      const { dishId } = seeded;

      // Tab A (the recorded page): the alternatives picker.
      await gotoDish(page, base, dishId);
      await page.waitForSelector('[data-testid="alt-card"]', { timeout: 8000 });

      // Tab B: a second real page in the same browser context (not recorded).
      const pageB = await page.browserContext().newPage();
      try {
        await pageB.setViewport({ width: 1280, height: 800 });
        await pageB.goto(`${base}/dishes/${dishId}`, { waitUntil: 'domcontentloaded' });
        await pageB.waitForSelector('[data-testid="alt-card"]', { timeout: 8000 });

        await ctx.check('BC-H-5', async (t) => {
          // Tab A picks & accepts alternative A → sibling alternative B goes
          // stale server-side.
          await page.bringToFront();
          await page.evaluate(() => document.querySelectorAll('[data-testid="alt-card"]')[0].click());
          await waitForVerb(page, 'accept', 8000);
          await clickVerb(page, 'accept');
          const decided = await waitFor(async () => {
            const d = await api('GET', `/api/dishes/${dishId}`);
            return d.state !== 'awaiting_gate';
          }, 15000);
          t.expect(decided, 'tab A accepted an alternative (dish decided)', { observed: decided });

          // Tab B, unaware, picks & gates the now-stale alternative B → 4xx.
          await pageB.bringToFront();
          await pageB.evaluate(() => document.querySelectorAll('[data-testid="alt-card"]')[1].click());
          await pageB.waitForSelector('button[data-verb="accept"]', { timeout: 8000 });
          await clickVerb(pageB, 'accept');

          const surfaced = await waitFor(() => alertWithText(pageB, '.+'), 8000);
          t.expect(surfaced, 'a role="alert" banner surfaces the conflict', { observed: surfaced ? 'shown' : 'never' });
          const banner = await alertWithText(pageB, '.+');
          t.observe('conflictBanner', banner);
          t.expect(!!banner && banner.text.length > 0, 'the banner carries the server message', { observed: banner });
          t.expect(!!banner && /proposal|stale|unknown/i.test(banner.text),
            'the message names the stale/unknown proposal', { observed: banner && banner.text });
          t.expect(!!banner && banner.dismiss, 'the banner offers a working Dismiss', { observed: banner });

          // Dismiss clears it.
          await pageB.evaluate(() => {
            const b = [...document.querySelectorAll('[role="alert"]')].find((x) => x.offsetParent !== null);
            const btn = b && [...b.querySelectorAll('button')].find((y) => /dismiss/i.test(y.textContent));
            if (btn) btn.click();
          });
          const dismissed = await waitFor(async () => !(await alertWithText(pageB, '.+')), 5000);
          t.expect(dismissed, 'Dismiss clears the conflict banner', { observed: dismissed });
        });
      } finally {
        await pageB.close().catch(() => {});
      }
    },
  },
];
