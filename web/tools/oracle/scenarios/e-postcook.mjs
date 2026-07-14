// Area E — the post-cook loop (CookFlow). "I cooked this" opens the tasting
// form; "Rework from these notes" runs iterate_feedback against exactly the
// cooked version. Shapes copied from a-intake.mjs (the pattern-setter):
// bounded waits, NetLog POST-body reads for the base-version proof, sub-check
// names ANDed per criterion, judge stills for BC-E-3. Every ctx.check()
// transcribes one criterion's contract recipe (docs/02b-behavior-contract/
// contract.md §E), boundaries included.
import {
  sleep, clickButton, clickVerb, waitForVerb, setValue, describeActiveElement,
} from '../lib/page.mjs';
import { seedTrials } from '../lib/api.mjs';
import { installFaultInjector } from '../lib/net.mjs';

const MOVE_RE = /^\/api\/dishes\/[^/]+\/move$/;

const gotoDish = async (page, base, dishId) => {
  await page.goto(`${base}/dishes/${dishId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#stage-heading', { timeout: 8000 });
};

// The full textContent of a committed "Trial N" spine card (the cooked badge
// and the "You cooked it —" note block both render inside the card button).
const trialCardText = (page, n) => page.evaluate((num) => {
  const aside = document.querySelector('aside[aria-label="Development timeline"]');
  if (!aside) return null;
  const btn = [...aside.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(`Trial ${num}`));
  return btn ? btn.textContent.trim() : null;
}, n);

const firstMovePost = (net, mark) => {
  const post = net.slice(mark).find((e) => e.kind === 'request' && e.method === 'POST' && MOVE_RE.test(e.path));
  return post && post.postData ? JSON.parse(post.postData) : {};
};

// A distinctive tasting note — its verbatim substring is the E-2 badge-echo
// probe and the E-1 steer-body probe.
const NOTES = 'the crust stayed crisp but the thigh meat read a touch dry — push moisture without more salt';

export const scenarios = [

  // ---------------------------------------------------------------------------
  // e/postcook (fast): BC-E-4 (focus), BC-E-1 (base version + blank fallback),
  // BC-E-2 (cooked badge), BC-E-3 (judge stills). Setup: 2 trials, so the
  // cooked/current trial is Trial 2.
  // ---------------------------------------------------------------------------
  {
    id: 'e/postcook',
    profile: 'fast',
    criteria: ['BC-E-1', 'BC-E-2', 'BC-E-3', 'BC-E-4'],
    setup: seedTrials(2),
    run: async (ctx, dishId) => {
      const { page, base, net, api } = ctx;
      await gotoDish(page, base, dishId);
      await page.waitForSelector('#cc-intent', { timeout: 8000 }); // idle CookFlow present

      // Trial 2 is the current (cooked) trial the idle CookFlow reworks against.
      const versionsBefore = await api('GET', `/api/dishes/${dishId}/versions`);
      const cookedVersionId = versionsBefore.currentVersionId;
      const trial2Id = (versionsBefore.versions || [])[1] ? versionsBefore.versions[1].id : null;

      // BC-E-4 — focus management (LIKELY FAILS TODAY: CookFlow's cancel
      // unmounts the focused textarea with no restoration). Runs first on the
      // still-idle dish; dispatches nothing.
      await ctx.check('BC-E-4', async (t) => {
        await clickButton(page, /^I cooked this/);
        await page.waitForSelector('#cc-tasting-notes', { timeout: 4000 });
        await sleep(150); // the tasting useEffect focuses the textarea
        const openFocus = await describeActiveElement(page);
        t.expect(openFocus.id === 'cc-tasting-notes',
          'opening "I cooked this" moves focus into #cc-tasting-notes', { observed: openFocus });
        await clickButton(page, /^Cancel$/);
        await sleep(200);
        const cancelFocus = await describeActiveElement(page);
        t.expect(!cancelFocus.isBody, 'Cancel does not drop focus to document.body', { observed: cancelFocus });
        t.expect(cancelFocus.isConnected && cancelFocus.tag === 'button' && /^I cooked this/.test(cancelFocus.text),
          'Cancel returns focus to the "I cooked this" trigger (attached, defined)', { observed: cancelFocus });
      });

      // BC-E-1 main — distinctive notes rework against exactly Trial 2.
      await ctx.check('BC-E-1', async (t) => {
        await clickButton(page, /^I cooked this/);
        await page.waitForSelector('#cc-tasting-notes', { timeout: 4000 });
        await setValue(page, '#cc-tasting-notes', NOTES);
        await ctx.judgeStill('BC-E-3', 'tasting-form'); // judge evidence: the form with notes
        const mark = net.mark();
        await clickButton(page, /^Rework from these notes/);
        const sawGate = await waitForVerb(page, 'accept', ctx.genTimeout).then(() => true).catch(() => false);
        t.expect(sawGate, 'the rework proposal parks at the gate', { observed: sawGate });
        t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 1, 'exactly one rework move dispatched');
        const body = firstMovePost(net, mark);
        t.expectEq(body.moveType, 'iterate_feedback', 'the rework runs iterate_feedback');
        t.expectEq(body.steer, NOTES, 'the typed notes ride as the feedback steer');
        t.expectEq(body.baseVersion, cookedVersionId, 'the rework base version is the cooked trial (currentVersionId)');
        t.expectEq(body.baseVersion, trial2Id, 'that base version equals Trial 2 (GET /versions[1].id)');
        await ctx.judgeStill('BC-E-3', 'proposal-rationale'); // judge evidence: the resulting proposal
      }, { name: 'distinctive-notes' });

      // BC-E-2 — the cooked trial (Trial 2) is badged with the note echoed.
      await ctx.check('BC-E-2', async (t) => {
        const card = await trialCardText(page, 2);
        t.expect(!!card, 'Trial 2 spine card present', { observed: card });
        if (card) {
          t.expectMatch(card, /Cooked/, 'Trial 2 card shows the "Cooked" badge');
          t.expect(card.includes(NOTES), 'Trial 2 card echoes the tasting note', { observed: card.slice(0, 200) });
        }
      });

      // BC-E-1 blank-notes boundary — accept the distinctive proposal to
      // return to idle (Trial 3 current), then submit empty notes: the "Cooked
      // it." fallback rides the wire, base version is still the cooked trial,
      // and the badge echoes "Cooked it." (the BC-E-2 clause under E-1).
      await ctx.check('BC-E-1', async (t) => {
        await clickVerb(page, 'accept');
        await page.waitForSelector('#cc-intent', { timeout: 8000 }); // idle again, Trial 3 current
        const d = await api('GET', `/api/dishes/${dishId}`);
        const blankBase = d.currentVersionId; // Trial 3
        await clickButton(page, /^I cooked this/);
        await page.waitForSelector('#cc-tasting-notes', { timeout: 4000 });
        // leave #cc-tasting-notes empty
        const mark = net.mark();
        await clickButton(page, /^Rework from these notes/);
        const sawGate = await waitForVerb(page, 'accept', ctx.genTimeout).then(() => true).catch(() => false);
        t.expect(sawGate, 'the blank-notes rework still reaches the gate', { observed: sawGate });
        const body = firstMovePost(net, mark);
        t.expectEq(body.steer, 'Cooked it.', 'blank notes dispatch the "Cooked it." fallback in the request body');
        t.expectEq(body.baseVersion, blankBase, 'the base version is still the cooked trial (current)');
        const card = await trialCardText(page, 3);
        t.expect(!!card && /Cooked/.test(card) && card.includes('Cooked it.'),
          'the cooked trial badge echoes "Cooked it."', { observed: card && card.slice(0, 200) });
      }, { name: 'blank-notes' });
    },
  },

  // ---------------------------------------------------------------------------
  // e/rework-fail (fast + fault): BC-E-5 — a failed rework must not discard
  // the typed tasting notes. [FAILS TODAY — CookFlow.submit() clears and
  // closes unconditionally, before any outcome is known.]
  // ---------------------------------------------------------------------------
  {
    id: 'e/rework-fail',
    profile: 'fast',
    criteria: ['BC-E-5'],
    setup: seedTrials(1),
    run: async (ctx, dishId) => {
      const { page, base } = ctx;
      await gotoDish(page, base, dishId);
      await page.waitForSelector('#cc-intent', { timeout: 8000 });

      const FAIL_NOTES = 'too salty at the finish and the pan sauce broke — steer toward emulsion stability';
      const removeFaults = await installFaultInjector(page, [
        { method: 'POST', pathRe: MOVE_RE, action: 'abort' },
      ]);
      try {
        await ctx.check('BC-E-5', async (t) => {
          await clickButton(page, /^I cooked this/);
          await page.waitForSelector('#cc-tasting-notes', { timeout: 4000 });
          await setValue(page, '#cc-tasting-notes', FAIL_NOTES);
          await clickButton(page, /^Rework from these notes/);
          await sleep(1500);
          const failureSurfaced = await page.evaluate(() =>
            !!document.querySelector('[data-testid="move-failed-banner"]')
            || [...document.querySelectorAll('[role="alert"],[role="status"]')]
              .some((el) => el.offsetParent !== null && (el.textContent || '').trim().length > 0));
          t.expect(failureSurfaced, 'the rework failure is surfaced (banner or live region)', { observed: failureSurfaced });
          const notesState = await page.evaluate(() => {
            const el = document.querySelector('#cc-tasting-notes');
            return { open: !!el, value: el ? el.value : null };
          });
          t.expect(notesState.open, 'the tasting form stays open after the failure', { observed: notesState });
          t.expectEq(notesState.value, FAIL_NOTES, 'the typed tasting notes are preserved');
        });
      } finally {
        await removeFaults();
      }
    },
  },
];
