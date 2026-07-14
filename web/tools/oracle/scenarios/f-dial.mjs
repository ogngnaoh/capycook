// Area F — the autonomy dial (DialToggle). A labeled role="switch" persisted
// on the dish; ON auto-applies deterministic moves with a confirmation, OFF
// pends them at the gate. Shapes copied from a-intake.mjs: bounded waits,
// NetLog POST/PATCH counts, atomically-captured toast (it evaporates in
// ~2.6s), sub-check names. Every ctx.check() transcribes one contract recipe
// (docs/archive/02b-behavior-contract/contract.md §F).
import {
  sleep, clickButton, clickVerb, waitForVerb, timelineTrialCount,
} from '../lib/page.mjs';
import { seedTrials } from '../lib/api.mjs';

const MOVE_RE = /^\/api\/dishes\/[^/]+\/move$/;
const DISH_RE = /^\/api\/dishes\/[^/]+$/; // PATCH target for the dial

const gotoDish = async (page, base, dishId) => {
  await page.goto(`${base}/dishes/${dishId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#stage-heading', { timeout: 8000 });
};

// The dial's accessibility-relevant surface. Its accessible name is its own
// visible text (DIAL_LABEL) — no aria-label/labelledby overrides it — plus
// the aria-checked state and the descriptive title.
const dialState = (page) => page.evaluate(() => {
  const sw = document.querySelector('[role="switch"]');
  if (!sw) return { exists: false };
  return {
    exists: true,
    hasAriaChecked: sw.hasAttribute('aria-checked'),
    checked: sw.getAttribute('aria-checked') === 'true',
    name: (sw.getAttribute('aria-label') || sw.textContent || '').trim(),
    title: sw.getAttribute('title') || null,
  };
});

const setDial = async (page, on) => {
  await page.evaluate((want) => {
    const sw = document.querySelector('[role="switch"]');
    if (sw && (sw.getAttribute('aria-checked') === 'true') !== want) sw.click();
  }, on);
  await sleep(300);
};

export const scenarios = [

  // ---------------------------------------------------------------------------
  // f/dial (fast): BC-F-1 (labeled switch, persists), BC-F-2 (auto-apply +
  // toast), BC-F-3 (durable attribution — LIKELY FAILS), BC-F-4 (dial OFF
  // parks at gate).
  // ---------------------------------------------------------------------------
  {
    id: 'f/dial',
    profile: 'fast',
    criteria: ['BC-F-1', 'BC-F-2', 'BC-F-3', 'BC-F-4'],
    setup: seedTrials(1),
    run: async (ctx, dishId) => {
      const { page, base, net } = ctx;
      await gotoDish(page, base, dishId);
      await page.waitForSelector('#cc-intent', { timeout: 8000 });

      // BC-F-1 — the dial is a labeled switch whose OFF state persists across
      // a hard reload (the PATCH is the durable write).
      await ctx.check('BC-F-1', async (t) => {
        const dial0 = await dialState(page);
        t.expect(dial0.exists, 'a role="switch" dial is present', { observed: dial0 });
        t.expect(dial0.hasAriaChecked, 'the switch carries aria-checked', { observed: dial0 });
        t.expect(/Auto-apply safe steps/i.test(dial0.name), 'the switch has an accessible label', { observed: dial0.name });
        t.expectEq(dial0.checked, true, 'the dial defaults ON (dish default)');

        const mark = net.mark();
        await page.evaluate(() => document.querySelector('[role="switch"]').click());
        await sleep(300);
        const dialOff = await dialState(page);
        t.expectEq(dialOff.checked, false, 'clicking toggles the dial OFF (aria-checked=false)');
        t.expectEq(net.count({ method: 'PATCH', pathRe: DISH_RE, since: mark }), 1, 'toggling PATCHes the dish once');

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#stage-heading', { timeout: 8000 });
        await page.waitForSelector('[role="switch"]', { timeout: 8000 });
        await sleep(300);
        const dialReload = await dialState(page);
        t.expectEq(dialReload.checked, false, 'the OFF state persists across a hard reload (PATCH persisted)');
        await page.waitForSelector('#cc-intent', { timeout: 8000 });
      });

      // BC-F-2 — dial ON: a deterministic move auto-applies with no gate stop,
      // confirmed by an "applied automatically" role="status" toast, timeline +1.
      await ctx.check('BC-F-2', async (t) => {
        await setDial(page, true);
        const on = await dialState(page);
        t.expectEq(on.checked, true, 'the dial is ON for the auto-apply path');
        const before = await timelineTrialCount(page);
        const mark = net.mark();
        await clickButton(page, /^Recompute cost/);
        // Capture the toast atomically the instant it matches — it flashes for
        // ~2.6s only, so read role + text inside the wait, never after it.
        const toastData = await page.waitForFunction(() => {
          const el = document.querySelector('[data-testid="toast"]');
          if (!el) return false;
          const text = (el.textContent || '').trim();
          if (!/applied automatically/i.test(text)) return false;
          return { role: el.getAttribute('role'), text };
        }, { timeout: 12000, polling: 'raf' }).then((h) => h.jsonValue()).catch(() => null);
        t.expect(!!toastData, 'an "applied automatically" confirmation toast appears', { observed: toastData });
        if (toastData) {
          t.expectMatch(toastData.text, /applied automatically/, 'the toast confirms the auto-apply');
          t.expectEq(toastData.role, 'status', 'the toast carries role="status" in the a11y tree');
        }
        const gate = await page.evaluate(() => !!document.querySelector('button[data-verb="accept"]'));
        t.expect(!gate, 'no gate verb rendered — the safe step auto-applied without a stop', { observed: gate });
        const grew = await page.waitForFunction((n) => {
          const aside = document.querySelector('aside[aria-label="Development timeline"]');
          if (!aside) return false;
          return [...aside.querySelectorAll('button')].filter((b) => /^Trial \d+/.test(b.textContent.trim())).length >= n;
        }, { timeout: 8000 }, before + 1).then(() => true).catch(() => false);
        t.expect(grew, 'the auto-applied step adds exactly one trial to the timeline', { observed: await timelineTrialCount(page) });
        t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 1, 'exactly one move dispatched');
      });

      // BC-F-3 — auto-applied trials stay attributable AFTER the fact. Auto-apply
      // once (done in F-2: Trial 2), UI-accept a creative move once (Trial 3),
      // enable technical view → the auto-applied trial must be distinguishable
      // from the human-accepted one by a durable TEXT marker (not color-only,
      // not the vanished toast). [LIKELY FAILS TODAY — the toast is the only
      // attribution; TimelineNode carries no auto-applied field.]
      await ctx.check('BC-F-3', async (t) => {
        await page.waitForSelector('#cc-intent', { timeout: 8000 });
        await page.type('#cc-intent', 'brighten the whole dish with acid and fresh herbs');
        await clickButton(page, /^Try it/);
        await waitForVerb(page, 'accept', ctx.genTimeout);
        await clickVerb(page, 'accept');
        await page.waitForSelector('#cc-intent', { timeout: 8000 }); // idle, Trial 3 current

        const techOn = await page.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find((b) => /^Technical view/.test(b.textContent.trim()));
          if (!btn) return false;
          if (btn.getAttribute('aria-pressed') !== 'true') btn.click();
          return true;
        });
        t.expect(techOn, 'the technical-view toggle is present and enabled', { observed: techOn });
        await sleep(300);

        const cards = await page.evaluate(() => {
          const aside = document.querySelector('aside[aria-label="Development timeline"]');
          if (!aside) return [];
          return [...aside.querySelectorAll('button')]
            .filter((b) => /^Trial \d+/.test(b.textContent.trim()))
            .map((b) => ({ head: b.textContent.trim().slice(0, 12), text: b.textContent.trim() }));
        });
        const autoCard = cards.find((c) => c.head.startsWith('Trial 2'));   // the auto-applied step
        const humanCard = cards.find((c) => c.head.startsWith('Trial 3'));  // the human-accepted move
        t.expect(!!autoCard && !!humanCard, 'both the auto-applied and human-accepted trials render',
          { observed: cards.map((c) => c.head) });
        const AUTO_MARK = /auto[- ]?appl|automatic|safe step|\bauto\b/i;
        const autoMarked = !!autoCard && AUTO_MARK.test(autoCard.text);
        const humanMarked = !!humanCard && AUTO_MARK.test(humanCard.text);
        t.expect(autoMarked && !humanMarked,
          'the auto-applied trial carries a durable text attribution marker the human-accepted one lacks',
          { observed: { autoCard: autoCard && autoCard.text, humanCard: humanCard && humanCard.text } });
      });

      // BC-F-4 — dial OFF: the same deterministic move parks at the gate like
      // any other proposal, with no auto-apply toast.
      await ctx.check('BC-F-4', async (t) => {
        await setDial(page, false);
        const off = await dialState(page);
        t.expectEq(off.checked, false, 'the dial is toggled OFF');
        const mark = net.mark();
        await clickButton(page, /^Recompute cost/);
        const sawGate = await waitForVerb(page, 'accept', ctx.genTimeout).then(() => true).catch(() => false);
        t.expect(sawGate, 'the deterministic move parks at the gate with the dial OFF', { observed: sawGate });
        const autoToast = await page.evaluate(() =>
          [...document.querySelectorAll('[data-testid="toast"]')].some((el) => /applied automatically/i.test(el.textContent || '')));
        t.expect(!autoToast, 'no auto-apply toast is shown when the dial is OFF', { observed: autoToast });
        t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 1, 'exactly one move dispatched');
      });
    },
  },
];
