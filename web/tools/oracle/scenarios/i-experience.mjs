// Area I — live-mode parity (the 25s sweep), experiential half. One scenario,
// i/journey, run natively under live-sim: a single full journey (intent →
// 25s wait → proposal → accept) that both
//   - asserts BC-I-3: during the long generation the rest of the workbench
//     stays HONEST — timeline browsing still works (a past trial opens
//     read-only and returns cleanly), the intent affordance looks unavailable
//     (it is unmounted while proposing, per BC-A-5), and nothing invites a
//     click that will error (no move-failed banner, no error alert, no stray
//     second POST …/move); and
//   - captures BC-I-2's whole-journey screencast for the fresh-context
//     survivability judge — spanning submit through the post-accept state.
//
// BC-I-1 is the runner-level parity meta-run (derived set re-run under
// live-sim); it owns no scenario here. This file only provides i/journey.
//
// Shapes copied from the pattern-setter (a-intake.mjs): bounded waits with a
// FAIL (never a hang) on a state that never arrives; NetLog POST counts from
// ctx.net since a local mark, never server history; renderer-side timing; a
// judge criterion captured via evidence only (sampleScreencast), never
// ctx.check(). Generation-seam waits use ctx.genTimeout so the live-sim window
// is survived.
import {
  sleep, clickButton, clickVerb, waitForVerb,
  waitForTimelineTrial, clickTimelineTrial,
} from '../lib/page.mjs';
import { seedTrials } from '../lib/api.mjs';

const MOVE_RE = /^\/api\/dishes\/[^/]+\/move$/;

const gotoDish = async (page, base, dishId) => {
  await page.goto(`${base}/dishes/${dishId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#stage-heading', { timeout: 8000 });
};

const statePill = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-testid="state-pill"]');
  return el ? el.textContent.trim() : null;
});

const waitForPill = async (page, label, timeout) => {
  await page.waitForFunction((l) => {
    const el = document.querySelector('[data-testid="state-pill"]');
    return el && el.textContent.trim().startsWith(l);
  }, { timeout }, label);
};

// The two error surfaces a click could raise (BC-I-3's "nothing invites a
// click that will error"): the move-failed banner and any visible role=alert.
// The gate live region is role=status, so it never counts as an error here.
const errorState = (page) => page.evaluate(() => {
  const moveFailed = !!document.querySelector('[data-testid="move-failed-banner"]');
  const alerts = [...document.querySelectorAll('[role="alert"]')]
    .filter((el) => el.offsetParent !== null && (el.textContent || '').trim().length > 0)
    .map((el) => (el.textContent || '').trim().slice(0, 120));
  return { moveFailed, alerts };
});

export const scenarios = [

  // ---------------------------------------------------------------------------
  // i/journey (live-sim): BC-I-3 assert (timeline-browse + intent-unavailable),
  // BC-I-2 judge (whole-journey survivability screencast)
  // ---------------------------------------------------------------------------
  {
    id: 'i/journey',
    profile: 'live-sim',
    criteria: ['BC-I-3', 'BC-I-2'],
    setup: seedTrials(1), // one committed Trial 1 → a browsable past trial
    run: async (ctx, dishId) => {
      const { page, base, net } = ctx;
      const INTENT = 'lean the whole dish toward smoke and citrus';

      // Recorder-clock helper: frame timestamps are ms since recorder.startedAt
      // (a node clock relative to the recorder). BC-I-2's fromMs/toMs bounds
      // must be in this same clock so the sampled window spans the journey.
      const relMs = () => (ctx.recorder ? Date.now() - ctx.recorder.startedAt : 0);

      await gotoDish(page, base, dishId);
      await waitForTimelineTrial(page, 1, 8000);
      await page.waitForSelector('#cc-intent', { timeout: 8000 });

      // ── Open the journey: a distinctive intent → the 25s proposing window ──
      const submitAtMs = relMs();
      const mark = net.mark();
      await page.focus('#cc-intent');
      await page.type('#cc-intent', INTENT);
      await page.keyboard.press('Enter');
      // BC-B-1 surface: proposing must become visible. Bounded — a proposing
      // state that never arrives is a FAIL for the mid-window checks below.
      const proposingAppeared = await page
        .waitForSelector('[data-testid="proposing-card"]', { timeout: ctx.genTimeout })
        .then(() => true).catch(() => false);

      // ── BC-I-3 (a): timeline browsing still works mid-generation ──────────
      await ctx.check('BC-I-3', async (t) => {
        t.expect(proposingAppeared, 'proposing window is open (mid-window baseline)',
          { observed: proposingAppeared ? 'proposing' : 'never' });

        // Click the past Trial 1 card → the read-only snapshot renders.
        await clickTimelineTrial(page, 1);
        const snapOk = await page.waitForFunction(() => {
          const body = document.body.textContent || '';
          const hasBanner = /Viewing a past trial/i.test(body) && /read-only/i.test(body);
          const back = [...document.querySelectorAll('button')].some((b) => /^Back to current/.test(b.textContent.trim()));
          const card = !!document.querySelector('[data-testid="dish-card"]');
          return hasBanner && back && card ? true : null;
        }, { timeout: 6000 }).then(() => true).catch(() => false);
        t.expect(snapOk, 'clicking a past trial opens its read-only snapshot (banner + Back + dish card)',
          { observed: snapOk ? 'rendered' : 'never' });

        // The snapshot open was announced (BC-D-2 seam; here supporting
        // evidence that browsing is legible, not silent).
        const liveText = await page.evaluate(() => {
          const el = document.querySelector('[data-testid="gate-live-region"]');
          return el ? (el.textContent || '').trim() : null;
        });
        t.observe('viewAnnouncement', liveText);

        // Read-only means no move-dispatching affordance fired: the browse
        // touched the network zero times.
        t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 1,
          'browsing a past trial fires no move (still exactly the one journey POST)');
        const errBrowse = await errorState(page);
        t.expect(!errBrowse.moveFailed && errBrowse.alerts.length === 0,
          'no error banner while viewing the snapshot', { observed: errBrowse });

        // Return via "Back to current" → the proposing state is still live.
        await clickButton(page, /^Back to current/);
        const backOk = await page.waitForFunction(() => {
          const body = document.body.textContent || '';
          const proposing = !!document.querySelector('[data-testid="proposing-card"]');
          const snapshotGone = !/Viewing a past trial/i.test(body);
          return proposing && snapshotGone ? true : null;
        }, { timeout: 6000 }).then(() => true).catch(() => false);
        t.expect(backOk, '"Back to current" returns to the live proposing state (snapshot cleared)',
          { observed: backOk ? 'proposing' : 'never' });
        const pill = await statePill(page);
        t.expect(/Thinking/.test(pill || ''), 'state pill still reads Thinking… (generation ongoing)',
          { observed: pill });
      }, { name: 'timeline-browse' });

      // ── BC-I-3 (b): the intent affordance is visibly unavailable ──────────
      await ctx.check('BC-I-3', async (t) => {
        // While proposing, IntentBar is unmounted (Workbench renders it only in
        // the idle state) — so an intent submit has no affordance at all. That
        // is BC-A-5's "visibly unavailable in flight".
        const intent = await page.evaluate(() => {
          const el = document.querySelector('#cc-intent');
          return {
            present: !!el,
            unavailable: !el || el.disabled || el.getAttribute('aria-disabled') === 'true',
            steerBar: !!document.querySelector('#cc-steer'),
          };
        });
        t.observe('intent', intent);
        t.expect(intent.unavailable, 'the intent affordance is unavailable mid-generation (unmounted/disabled)',
          { observed: intent });

        // No second move slipped through, and nothing errored.
        t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 1,
          'no second POST …/move fired during the wait');
        const err = await errorState(page);
        t.expect(!err.moveFailed && err.alerts.length === 0,
          'no error banner rendered mid-window', { observed: err });
        t.observe('pageErrors', ctx.pageErrors.slice(0, 3));
      }, { name: 'intent-unavailable' });

      // ── Let the proposal land, accept it — then capture BC-I-2's evidence ──
      // The screencast must span submit → wait → proposal → post-accept, so
      // BC-I-2's frames are gathered in a finally: a fresh judge still gets a
      // rulable journey even if the gate is slow.
      let acceptedAtMs;
      try {
        await waitForVerb(page, 'accept', ctx.genTimeout);
        await clickVerb(page, 'accept');
        await waitForPill(page, 'Ready', ctx.genTimeout).catch(() => {});
        await waitForTimelineTrial(page, 2, ctx.genTimeout).catch(() => {});
        await sleep(1500); // let the recorder capture the post-accept state
      } finally {
        acceptedAtMs = relMs();
        // BC-I-2 (judge): whole-journey survivability. Bounds cover the full
        // window in recorder-clock ms; ≤20 evenly-spaced frames submit→accept.
        ctx.sampleScreencast('BC-I-2', {
          fromMs: Math.max(0, submitAtMs - 1500),
          toMs: acceptedAtMs + 2000,
          maxFrames: 20,
        });
      }
    },
  },
];
