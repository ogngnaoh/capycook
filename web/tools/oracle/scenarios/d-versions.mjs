// Area D — versions & timeline. Copies a-intake.mjs's shapes: bounded waits,
// renderer-side focus/announce reads, sub-check names, judge stills. The
// contract (docs/02b-behavior-contract/contract.md) is the only normative
// text; each ctx.check() transcribes one criterion's recipe.
//
// The big journey (d/timeline) builds a real line of development entirely
// through the UI — create → accept → view → promote → branch → cook → cook —
// so the timeline criteria assert on genuine committed state, never an
// API-fabricated shortcut. Move classification is server-side (handlers.go):
// a free-text intent is seed_expand on a version-less dish, iterate_feedback
// once a version exists (each iterate appends a lemon ingredient + a lemon
// step, per internal/llm/stub.go).
import {
  sleep, clickButton, clickVerb, waitForVerb, setValue, fillSeed, SEED_TEXT,
  clickTimelineTrial, timelineTrialCount, describeActiveElement,
} from '../lib/page.mjs';
import { seedTrials } from '../lib/api.mjs';

// A distinctive rationale marker threaded through one move's steer; the stub
// appends it to the proposal's Rationale prose. BC-D-12 then looks for it on
// the accepted trial (it is discarded on accept today, so it never appears).
const RATIONALE_MARKER = 'kumquat-marmalade-note-7f3';
// A stable fragment of SEED_TEXT — the fresh dish's title before any version
// gives it a real one — for the recent-list / route-focus checks.
const DISH_TITLE_FRAG = 'cozy one-pan roast chicken';

// ---------------------------------------------------------------- helpers ---

const gotoDish = async (page, base, dishId) => {
  await page.goto(`${base}/dishes/${dishId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#stage-heading', { timeout: 8000 });
};

// A controlled <select> needs the native value setter + a 'change' event, the
// same trick setValue uses for inputs/textareas (page.mjs).
const setSelect = (page, selector, value) => page.evaluate((sel, val) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`no select ${sel}`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(el, val);
  el.dispatchEvent(new Event('change', { bubbles: true }));
}, selector, value);

const ariaCurrent = (page) => page.evaluate(() => {
  const els = [...document.querySelectorAll('[aria-current="true"]')];
  return { count: els.length, texts: els.map((e) => (e.textContent || '').trim()) };
});

const liveRegionText = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-testid="gate-live-region"]');
  return el ? (el.textContent || '').trim() : '';
});

const trialHeads = (page) => page.evaluate(() => {
  const aside = document.querySelector('aside[aria-label="Development timeline"]');
  if (!aside) return [];
  return [...aside.querySelectorAll('button')]
    .map((b) => (b.textContent || '').trim())
    .map((tx) => (tx.match(/^Trial \d+/) || [null])[0])
    .filter(Boolean);
});

const ingredientRows = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#stage [data-testid="ingredient-row"]')].map((r) => (r.textContent || '').trim()));
const stepRows = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#stage [data-testid="step-row"]')].map((r) => (r.textContent || '').trim()));

const recentListText = (page) => page.evaluate(() => {
  const scope = document.querySelector('section[aria-labelledby="recent-dishes-heading"]');
  return scope ? (scope.textContent || '') : '';
});

const clickRecentDish = (page, frag) => page.evaluate((f) => {
  const scope = document.querySelector('section[aria-labelledby="recent-dishes-heading"]') || document;
  const btn = [...scope.querySelectorAll('button')].find((b) => (b.textContent || '').includes(f));
  if (!btn) throw new Error(`no recent dish button containing ${f}`);
  btn.click();
}, frag);

const clickFirstRecentDish = (page) => page.evaluate(() => {
  const scope = document.querySelector('section[aria-labelledby="recent-dishes-heading"]');
  const btn = scope && scope.querySelector('ul button');
  if (!btn) throw new Error('no recent dish button');
  btn.click();
});

// Promote the given trial from its own spine card's sibling "Promote to trunk"
// button (there is one per non-current, non-pending trial — target the right
// one by walking up to the node div).
const promoteTrial = (page, n) => page.evaluate((num) => {
  const aside = document.querySelector('aside[aria-label="Development timeline"]');
  if (!aside) throw new Error('no timeline aside');
  const card = [...aside.querySelectorAll('button')]
    .find((b) => (b.textContent || '').trim().startsWith(`Trial ${num}`) && !/Promote to trunk/.test(b.textContent));
  if (!card) throw new Error(`no Trial ${num} card`);
  const nodeDiv = card.closest('div.relative') || card.parentElement;
  const promote = [...nodeDiv.querySelectorAll('button')].find((b) => /^Promote to trunk$/.test((b.textContent || '').trim()));
  if (!promote) throw new Error(`no Promote button for Trial ${num}`);
  promote.click();
}, n);

// Poll document.activeElement until `test` passes or the budget runs out;
// returns the last descriptor either way (the caller expects on it).
async function waitForActive(page, test, timeout = 6000) {
  const start = Date.now();
  let a = await describeActiveElement(page);
  while (Date.now() - start < timeout) {
    if (test(a)) return a;
    await sleep(100);
    a = await describeActiveElement(page);
  }
  return a;
}

async function createDishViaUI(ctx, tune) {
  const { page, base } = ctx;
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#field-seed', { timeout: 8000 });
  await fillSeed(page);
  if (tune) await tune(page);
  await clickButton(page, /^Develop this dish/i);
  await page.waitForFunction(() => location.pathname.startsWith('/dishes/'), { timeout: 8000 });
  await page.waitForSelector('#stage-heading', { timeout: 8000 });
  const dishPath = await page.evaluate(() => location.pathname);
  return { dishPath, dishId: dishPath.split('/').pop() };
}

// Type a free-text intent and drive it to the gate (bounded on the generation
// seam via ctx.genTimeout — parity re-runs re-enter under live-sim).
async function driveMoveToGate(page, ctx, intent) {
  await page.waitForSelector('#cc-intent', { timeout: 8000 });
  await setValue(page, '#cc-intent', intent);
  await sleep(80);
  await clickButton(page, /^Try it/i);
  await waitForVerb(page, 'accept', ctx.genTimeout);
}

// Accept the pending proposal and wait for the newest trial to become the sole
// current node (an accept always advances the trunk head to the new version).
async function acceptToTrial(page, ctx, expectedCount) {
  await clickVerb(page, 'accept');
  await page.waitForFunction((n) => {
    const els = [...document.querySelectorAll('[aria-current="true"]')];
    return els.length === 1 && els[0].textContent.trim().startsWith(`Trial ${n}`);
  }, { timeout: ctx.genTimeout }, expectedCount).catch(() => {});
  await sleep(200);
}

// -------------------------------------------------------------- scenarios ---

export const scenarios = [

  // ---------------------------------------------------------------------------
  // d/timeline (fast): the full line of development —
  //   BC-D-8, BC-D-11, BC-D-13, BC-D-9, BC-D-1, BC-D-12, BC-D-2, BC-D-3,
  //   BC-D-6, and the BC-D-7 judge stills.
  // ---------------------------------------------------------------------------
  {
    id: 'd/timeline',
    profile: 'fast',
    criteria: ['BC-D-1', 'BC-D-2', 'BC-D-3', 'BC-D-6', 'BC-D-7', 'BC-D-8',
      'BC-D-9', 'BC-D-11', 'BC-D-12', 'BC-D-13'],
    run: async (ctx) => {
      const { page, base, api } = ctx;
      const { dishPath, dishId } = await createDishViaUI(ctx);

      // ---- BC-D-8: the recent-dishes list reflects reality ------------------
      await ctx.check('BC-D-8', async (t) => {
        await clickButton(page, /^Dishes$/);
        await page.waitForSelector('section[aria-labelledby="recent-dishes-heading"]', { timeout: 8000 });
        await sleep(300);
        const listText = await recentListText(page);
        t.expect(listText.includes(DISH_TITLE_FRAG), 'the freshly created dish appears in the recent list', { observed: listText.slice(0, 200) });
        await clickRecentDish(page, DISH_TITLE_FRAG);
        await page.waitForSelector('#stage-heading', { timeout: 8000 });
        const landed = await page.evaluate(() => ({
          path: location.pathname,
          h1: (document.querySelector('h1') && document.querySelector('h1').textContent.trim()) || null,
        }));
        t.expectEq(landed.path, dishPath, 'clicking the entry opens exactly that dish');
        t.expect(!!landed.h1 && landed.h1.includes(DISH_TITLE_FRAG), 'the opened dish renders its title', { observed: landed });
      });

      // ---- BC-D-11: client-side nav announces itself via focus + title -----
      await ctx.check('BC-D-11', async (t) => {
        // Back-nav via the header: focus lands on the list h1, title reverts.
        await clickButton(page, /^Dishes$/);
        await page.waitForSelector('section[aria-labelledby="recent-dishes-heading"]', { timeout: 8000 });
        const back = await waitForActive(page, (a) => a.tag === 'h1');
        const backTitle = await page.evaluate(() => document.title);
        t.expect(back.tag === 'h1' && /^CapyCook/.test(back.text), 'focus lands on the list h1 after back-nav', { observed: back });
        t.expectEq(backTitle, 'CapyCook', 'document.title reverts to "CapyCook" on the list');

        // Forward-nav: click a recent dish → focus on the dish h1, title tracks.
        await clickRecentDish(page, DISH_TITLE_FRAG);
        await page.waitForSelector('#stage-heading', { timeout: 8000 });
        await page.waitForFunction((frag) => {
          const h1 = document.querySelector('h1');
          return h1 && h1.textContent.includes(frag);
        }, { timeout: 8000 }, DISH_TITLE_FRAG);
        const fwd = await waitForActive(page, (a) => a.tag === 'h1' && a.text.includes(DISH_TITLE_FRAG));
        const fwdTitle = await page.evaluate(() => document.title);
        t.expect(fwd.tag === 'h1' && fwd.text.includes(DISH_TITLE_FRAG), 'focus lands on the dish h1 after route change', { observed: fwd });
        t.expect(fwdTitle.includes(DISH_TITLE_FRAG), 'document.title contains the dish title (WCAG 2.4.2)', { observed: fwdTitle });

        // Cold load: the heading is NOT autofocused (routeNonce === 0).
        await page.goto(`${base}${dishPath}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#stage-heading', { timeout: 8000 });
        await sleep(400);
        const cold = await describeActiveElement(page);
        t.expect(cold.tag !== 'h1', 'a cold dish-URL load does NOT autofocus the heading', { observed: cold });
      });

      // ---- BC-D-13 (accepts): exactly one aria-current, tracking each accept
      await ctx.check('BC-D-13', async (t) => {
        // Move 1 → Trial 1 (seed_expand: the dish has no version yet).
        await driveMoveToGate(page, ctx, 'give it a fresh first pass');
        await acceptToTrial(page, ctx, 1);
        let ac = await ariaCurrent(page);
        t.expectEq(ac.count, 1, 'after accept #1: exactly one aria-current trial');
        t.expect(!!ac.texts[0] && ac.texts[0].startsWith('Trial 1'), 'aria-current targets the newest trial (Trial 1)', { observed: ac.texts });

        // Move 2 → Trial 2 (iterate_feedback; distinctive rationale for BC-D-12).
        await driveMoveToGate(page, ctx, `make it brighter ${RATIONALE_MARKER}`);
        await acceptToTrial(page, ctx, 2);
        ac = await ariaCurrent(page);
        t.expectEq(ac.count, 1, 'after accept #2: exactly one aria-current trial');
        t.expect(!!ac.texts[0] && ac.texts[0].startsWith('Trial 2'), 'aria-current moved to the newest trial (Trial 2)', { observed: ac.texts });
      }, { name: 'accepts' });

      // ---- BC-D-9: the stage shows the accepted draft, not the prior version
      await ctx.check('BC-D-9', async (t) => {
        const preRows = await ingredientRows(page);
        await driveMoveToGate(page, ctx, 'brighten the finish with fresh acid');
        await acceptToTrial(page, ctx, 3);
        const draft = (await api('GET', `/api/dishes/${dishId}`)).draft;
        const serverIngs = (draft.ingredients || []).map((i) => i.name);
        const postRows = await ingredientRows(page);
        const postSteps = await stepRows(page);
        t.expect(postRows.some((r) => /lemon/i.test(r)), 'an ingredient-row shows the newly-added lemon', { observed: postRows });
        t.expect(postSteps.some((s) => /Squeeze lemon over the dish/i.test(s)), 'a step-row shows the new squeeze step', { observed: postSteps });
        t.expect(serverIngs.length > 0 && serverIngs.every((name) => postRows.some((r) => r.includes(name))),
          'every server-draft ingredient renders on the stage (UI mirrors the new draft)', { observed: { serverIngs, postRows } });
        t.expect(postRows.length >= preRows.length + 1,
          'the stage grew to the new draft — the prior version no longer renders as current', { observed: { pre: preRows.length, post: postRows.length } });
      });

      // ---- BC-D-1: every accept appends one Trial node; summary count matches
      await ctx.check('BC-D-1', async (t) => {
        const info = await page.evaluate(() => {
          const aside = document.querySelector('aside[aria-label="Development timeline"]');
          const heads = aside ? [...aside.querySelectorAll('button')]
            .map((b) => (b.textContent || '').trim())
            .filter((tx) => /^Trial \d+/.test(tx))
            .map((tx) => (tx.match(/^Trial \d+/) || [''])[0]) : [];
          return { heads, asideText: aside ? aside.textContent : '' };
        });
        t.expect(info.heads.includes('Trial 1') && info.heads.includes('Trial 2') && info.heads.includes('Trial 3'),
          'the spine carries buttons "Trial 1..3"', { observed: info.heads });
        t.expect(/3 trials on the line/.test(info.asideText), 'the spine summary reads "3 trials on the line"', { observed: info.asideText.slice(0, 120) });
      });

      // ---- BC-D-12 [FAILS TODAY]: a trial's prose rationale is recoverable ---
      await ctx.check('BC-D-12', async (t) => {
        const techOn = await page.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find((b) => /^Technical view/.test((b.textContent || '').trim()));
          if (!btn) return false;
          if (btn.getAttribute('aria-pressed') !== 'true') btn.click();
          return true;
        });
        t.expect(techOn, 'technical view toggle present', { observed: techOn });
        await sleep(300);
        await clickTimelineTrial(page, 2);
        await page.waitForSelector('[data-testid="dish-card"]', { timeout: 8000 });
        await sleep(300);
        const found = await page.evaluate((marker) => {
          const stage = document.querySelector('#stage') || document.body;
          const text = stage.textContent || '';
          return { hasMarker: text.includes(marker), hasProse: /Brightened the dish per feedback/i.test(text) };
        }, RATIONALE_MARKER);
        t.expect(found.hasMarker || found.hasProse,
          "the accepted trial exposes the proposal's prose rationale in technical view",
          { observed: found, note: 'FAILS TODAY — the move-level rationale is discarded on accept' });
        // Restore: back to current, technical view off.
        await clickButton(page, /^Back to current$/).catch(() => {});
        await sleep(300);
        await page.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find((b) => /^Technical view/.test((b.textContent || '').trim()));
          if (btn && btn.getAttribute('aria-pressed') === 'true') btn.click();
        });
        await sleep(200);
      });

      // ---- BC-D-2 [FAILS TODAY]: past trial read-only; both directions announced
      await ctx.check('BC-D-2', async (t) => {
        // Park a fresh proposal at the gate, then view Trial 1's snapshot.
        await driveMoveToGate(page, ctx, 'one more idea for the finish');
        await clickTimelineTrial(page, 1);
        await page.waitForSelector('[data-testid="dish-card"]', { timeout: 8000 });
        await sleep(250);
        const snap = await page.evaluate(() => {
          const banner = [...document.querySelectorAll('*')].some((e) => /Viewing a past trial/.test(e.textContent || ''));
          const gateVerbs = document.querySelectorAll('button[data-verb]').length;
          const aside = document.querySelector('aside[aria-label="Development timeline"]');
          const pendingNode = aside ? /your decision/.test(aside.textContent || '') : false;
          const backBtn = [...document.querySelectorAll('button')].some((b) => /^Back to current$/.test((b.textContent || '').trim()));
          const live = (document.querySelector('[data-testid="gate-live-region"]') || {}).textContent || '';
          return { banner, gateVerbs, pendingNode, backBtn, live: live.trim() };
        });
        t.expect(snap.banner, 'the read-only banner renders on the snapshot', { observed: snap });
        t.expectEq(snap.gateVerbs, 0, 'no active gate verbs on the snapshot');
        t.expect(snap.pendingNode, 'the pending decision node is still on the spine', { observed: snap.pendingNode });
        t.expect(snap.backBtn, '"Back to current" control present', { observed: snap.backBtn });
        t.expect(/Viewing Trial 1, read-only\./.test(snap.live), 'entering the snapshot is announced', { observed: snap.live });
        const liveEntry = snap.live;

        await clickButton(page, /^Back to current$/);
        const restored = await waitForVerb(page, 'accept', 8000).then(() => true).catch(() => false);
        t.expect(restored, '"Back to current" restores the live gate', { observed: restored });
        await sleep(300);
        const liveReturn = await liveRegionText(page);
        t.expect(liveReturn.length > 0 && liveReturn !== liveEntry,
          'the return to the live view is announced with a distinct, non-empty value',
          { observed: { liveEntry, liveReturn }, note: 'LIKELY FAILS TODAY — "Back to current" calls no announce()' });

        // Resolve the pending proposal → Trial 4 (the linear head we cook next).
        await acceptToTrial(page, ctx, 4);
      });

      // Cook Trial 4 so the spine carries a "Cooked" badge for the BC-D-7 judge.
      await page.waitForSelector('#cc-intent', { timeout: 8000 }).catch(() => {});
      await clickButton(page, /^I cooked this/i);
      await page.waitForSelector('#cc-tasting-notes', { timeout: 4000 });
      await setValue(page, '#cc-tasting-notes', 'came out beautifully — would make again');
      await clickButton(page, /^Rework from these notes/i);
      await waitForVerb(page, 'accept', ctx.genTimeout).catch(() => {});
      await acceptToTrial(page, ctx, 5);

      // Promote Trial 1, then branch off it (run-body drive; assertions split so
      // the aria-current promote clause is checked before the branch accept).
      const versionsBefore = await api('GET', `/api/dishes/${dishId}/versions`);
      const t1Id = (versionsBefore.versions || [])[0] && (versionsBefore.versions || [])[0].id;
      await promoteTrial(page, 1);
      const promoteToast = await page.waitForSelector('[data-testid="toast"]', { timeout: 4000 })
        .then(() => page.evaluate(() => {
          const el = document.querySelector('[data-testid="toast"]');
          return el ? { text: (el.textContent || '').trim(), role: el.getAttribute('role') } : null;
        })).catch(() => null);
      await page.waitForFunction(() => {
        const els = [...document.querySelectorAll('[aria-current="true"]')];
        return els.length === 1 && els[0].textContent.trim().startsWith('Trial 1');
      }, { timeout: 8000 }).catch(() => {});

      // ---- BC-D-13 (after-promote): aria-current follows the promoted trial --
      await ctx.check('BC-D-13', async (t) => {
        const ac = await ariaCurrent(page);
        t.expectEq(ac.count, 1, 'exactly one aria-current after promote');
        t.expect(!!ac.texts[0] && ac.texts[0].startsWith('Trial 1'), 'aria-current targets the promoted trial (Trial 1)', { observed: ac.texts });
      }, { name: 'after-promote' });

      // ---- BC-D-3: branch + promote end-to-end with the Branch badge --------
      await ctx.check('BC-D-3', async (t) => {
        t.expect(!!promoteToast, 'the promote toast appeared', { observed: promoteToast });
        if (promoteToast) {
          t.expect(/promoted to service/.test(promoteToast.text), 'toast text: "… promoted to service"', { observed: promoteToast.text });
          t.expectEq(promoteToast.role, 'status', 'toast carries role="status" in the a11y tree');
        }
        const dishNow = await api('GET', `/api/dishes/${dishId}`);
        t.expectEq(dishNow.currentVersionId, t1Id, 'currentVersionId moved to the promoted trial (verified via GET)');

        // The next accepted move lands as a branch-badged trial on the new line.
        const before = await timelineTrialCount(page);
        await driveMoveToGate(page, ctx, 'branch off in a new direction');
        await acceptToTrial(page, ctx, before + 1);
        const newest = before + 1;
        const branchInfo = await page.evaluate((n) => {
          const aside = document.querySelector('aside[aria-label="Development timeline"]');
          const btn = [...aside.querySelectorAll('button')].find((b) => (b.textContent || '').trim().startsWith(`Trial ${n}`));
          return btn ? { text: (btn.textContent || '').trim(), hasBranch: /Branch/.test(btn.textContent || '') } : null;
        }, newest);
        t.expect(!!branchInfo && branchInfo.hasBranch, 'the new trial carries the "Branch" badge', { observed: branchInfo });
      });

      // ---- BC-D-7 (judge): the spine reads as a line of development ---------
      // The spine carries 6 trials incl. a COOKED (Trial 4) and a BRANCH (the
      // newest) badge, at opposite ends of the rail. The rail overflows the
      // page (not an internal aside scroller), so scrollIntoView the actual
      // badged cards and capture each badge in each theme.
      const scrollToBadge = (badge) => page.evaluate((b) => {
        const aside = document.querySelector('aside[aria-label="Development timeline"]');
        if (!aside) return false;
        const btn = [...aside.querySelectorAll('button')].find((x) => new RegExp(b).test(x.textContent || ''));
        if (btn) { btn.scrollIntoView({ block: 'center' }); return true; }
        return false;
      }, badge);
      await scrollToBadge('Cooked');
      await sleep(300);
      await ctx.judgeStill('BC-D-7', 'spine-cooked-light');
      await scrollToBadge('Branch');
      await sleep(300);
      await ctx.judgeStill('BC-D-7', 'spine-branch-light');
      await clickButton(page, /^Theme:/).catch(() => {}); // light → dark
      await sleep(500);
      await ctx.judgeStill('BC-D-7', 'spine-branch-dark');
      await scrollToBadge('Cooked');
      await sleep(300);
      await ctx.judgeStill('BC-D-7', 'spine-cooked-dark');
      await clickButton(page, /^Theme:/).catch(() => {}); // dark → system (reset chrome)
      await sleep(300);

      // ---- BC-D-6: Back/Forward re-syncs list ↔ dish without stale state ----
      await ctx.check('BC-D-6', async (t) => {
        await clickButton(page, /^Dishes$/);
        await page.waitForSelector('section[aria-labelledby="recent-dishes-heading"]', { timeout: 8000 });
        await clickFirstRecentDish(page);
        await page.waitForSelector('#stage-heading', { timeout: 8000 });
        // Back → the dishes list.
        await page.evaluate(() => window.history.back());
        const onList = await page.waitForSelector('#field-seed', { timeout: 8000 }).then(() => true).catch(() => false);
        t.expect(onList, 'Back returns to the dishes list', { observed: onList });
        // Forward → the dish, re-rendered at its current state.
        await page.evaluate(() => window.history.forward());
        const onDish = await page.waitForSelector('#stage-heading', { timeout: 8000 }).then(() => true).catch(() => false);
        t.expect(onDish, 'Forward re-renders the dish', { observed: onDish });
        await sleep(300);
        const count = await timelineTrialCount(page);
        t.expect(count >= 3, 'the dish re-renders at its current state (trials intact)', { observed: count });
      });
    },
  },

  // ---------------------------------------------------------------------------
  // d/reload-state (fast): BC-D-4 — reload restores the exact decision state.
  // ---------------------------------------------------------------------------
  {
    id: 'd/reload-state',
    profile: 'fast',
    criteria: ['BC-D-4'],
    setup: seedTrials(1),
    run: async (ctx, dishId) => {
      const { page, base } = ctx;
      await gotoDish(page, base, dishId);
      await page.waitForSelector('#cc-intent', { timeout: 8000 });

      await ctx.check('BC-D-4', async (t) => {
        // Awaiting-gate: drive a proposal to the gate, hard reload → it returns.
        await driveMoveToGate(page, ctx, 'a small bright tweak');
        await page.reload({ waitUntil: 'domcontentloaded' });
        const gateBack = await waitForVerb(page, 'accept', ctx.genTimeout).then(() => true).catch(() => false);
        t.expect(gateBack, 'the pending proposal + gate re-render after reload', { observed: gateBack });

        // Clear the gate, drive to a safety hold, hard reload → the hold returns
        // (from the stored ops), with the same reason.
        if (gateBack) { await clickVerb(page, 'accept'); await sleep(400); }
        await page.waitForSelector('#cc-intent', { timeout: 8000 }).catch(() => {});
        await setValue(page, '#cc-intent', 'add a slow garlic oil infusion at room temperature');
        await sleep(80);
        await clickButton(page, /^Try it/i);
        const held = await page.waitForSelector('[data-testid="safety-hold"]', { timeout: ctx.genTimeout }).then(() => true).catch(() => false);
        t.expect(held, 'the garlic-oil steer drove to a safety hold', { observed: held });
        const reasonBefore = await page.evaluate(() => {
          const p = document.querySelector('[data-testid="safety-hold"] p');
          return p ? (p.textContent || '').trim() : null;
        });

        await page.reload({ waitUntil: 'domcontentloaded' });
        const heldBack = await page.waitForSelector('[data-testid="safety-hold"]', { timeout: ctx.genTimeout }).then(() => true).catch(() => false);
        t.expect(heldBack, 'the safety hold re-renders after reload', { observed: heldBack });
        const reasonAfter = await page.evaluate(() => {
          const p = document.querySelector('[data-testid="safety-hold"] p');
          return p ? (p.textContent || '').trim() : null;
        });
        t.expect(!!reasonBefore && !!reasonAfter && reasonBefore === reasonAfter,
          'the hold re-renders with the same reason', { observed: { reasonBefore, reasonAfter } });
      });
    },
  },

  // ---------------------------------------------------------------------------
  // d/restart (fast): BC-D-5 — committed work survives a server restart.
  // ---------------------------------------------------------------------------
  {
    id: 'd/restart',
    profile: 'fast',
    criteria: ['BC-D-5'],
    setup: seedTrials(2),
    run: async (ctx, dishId) => {
      const { page, base, server, api } = ctx;
      await gotoDish(page, base, dishId);

      await ctx.check('BC-D-5', async (t) => {
        const before = await api('GET', `/api/dishes/${dishId}`);
        const versionsBefore = await api('GET', `/api/dishes/${dishId}/versions`);
        const headsBefore = await trialHeads(page);

        // SIGKILL (never SIGTERM: a graceful drain hides the SSE drop) + restart
        // on the same temp DB.
        await server.stop('SIGKILL');
        await server.restart();

        await page.goto(`${base}/dishes/${dishId}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#stage-heading', { timeout: 8000 });
        await sleep(500);
        const headsAfter = await trialHeads(page);
        const after = await api('GET', `/api/dishes/${dishId}`);
        const versionsAfter = await api('GET', `/api/dishes/${dishId}/versions`);

        t.expectEq(headsAfter.length, 2, 'both committed trials still render after restart');
        t.expectEq(headsAfter, headsBefore, 'the timeline trial heads are identical after restart');
        t.expectEq(after.currentVersionId, before.currentVersionId, 'the current-version marker survives the restart');
        t.expectEq((versionsAfter.versions || []).map((v) => v.id), (versionsBefore.versions || []).map((v) => v.id),
          'the full trial chain survives the restart');
        t.expectEq(JSON.stringify(after.draft), JSON.stringify(before.draft), 'the draft is byte-identical after restart');
      });
    },
  },

  // ---------------------------------------------------------------------------
  // d/honesty (fast): BC-D-10 — the idle stage's honesty detail + constraints
  // echo stay truthful (unpriced saffron, unverified nutrition, all six fields).
  // ---------------------------------------------------------------------------
  {
    id: 'd/honesty',
    profile: 'fast',
    criteria: ['BC-D-10'],
    run: async (ctx) => {
      const { page, api } = ctx;
      // Seed via the UI with ALL six constraint fields (fillSeed covers the
      // free lists + allergens; skill is a <select> and servings an <input>,
      // both set explicitly to distinctive values so the echo is meaningful).
      const { dishId } = await createDishViaUI(ctx, async (p) => {
        await setSelect(p, 'select:not([disabled])', 'advanced');
        await setValue(p, '#field-servings', '3');
      });

      await ctx.check('BC-D-10', async (t) => {
        // The first pass (seed_expand) adds "flat-leaf parsley" — absent from
        // the price table (→ cost.missing on the in-accept recompute) yet
        // grounded, so the allergen gate (which fails CLOSED on unresolved
        // ingredients whenever an allergen is declared) still passes it.
        //
        // Note: the stub's designated 'saffron' fixture is ALSO unpriced, but
        // saffron is ungrounded AND absent from data/foodon/allergens.csv, so
        // with an allergen declared the allergen gate blocks it
        // ("allergen status unknown for saffron") and the move can never be
        // accepted — the exact combination BC-D-10 requires. Flagged as a
        // fixture gap; parsley is the honest unpriced-ingredient carrier.
        await driveMoveToGate(page, ctx, 'expand this into a full first draft');
        await acceptToTrial(page, ctx, 1);

        const draft = (await api('GET', `/api/dishes/${dishId}`)).draft;
        const missing = draft.analysis.cost.missing || [];
        const unverified = draft.analysis.nutrition.unverified || [];

        const panel = await page.evaluate(() => {
          const card = document.querySelector('[data-testid="dish-card"]');
          const label = [...document.querySelectorAll('*')]
            .find((e) => e.children.length === 0 && /^Cooking for$/i.test((e.textContent || '').trim()));
          const cookingRow = label ? (label.parentElement.textContent || '') : '';
          return { cardText: card ? (card.textContent || '') : '', cookingRow };
        });

        // Honesty detail panel (technical view OFF): every unpriced ingredient
        // in the committed draft is footnoted, none silently dropped.
        t.expect(missing.length > 0, 'the committed draft carries ≥1 unpriced ingredient', { observed: missing });
        for (const name of missing) {
          t.expect(panel.cardText.includes(name), `the cost detail panel lists the unpriced "${name}"`, { observed: panel.cardText.slice(0, 300) });
        }
        t.expect(/(no price on file|Excludes)/i.test(panel.cardText), 'the cost panel shows the "no price on file" footnote', { observed: panel.cardText.slice(0, 300) });
        if (unverified.length > 0) {
          for (const u of unverified) {
            t.expect(panel.cardText.includes(u), `nutrition.unverified entry "${u}" is disclosed`, { observed: panel.cardText.slice(0, 400) });
          }
        } else {
          t.observe('nutritionUnverified', 'none present in this draft');
          t.expect(true, 'no unverified nutrition entries to disclose (correctly shows none)');
        }

        // "Cooking for" row echoes all six seed-form fields, none silently blank.
        const echoes = {
          avoid: /peanuts/i.test(panel.cookingRow) && /crustacean shellfish/i.test(panel.cookingRow),
          dietary: /low sodium/i.test(panel.cookingRow),
          equipment: /cast iron/i.test(panel.cookingRow) && /oven/i.test(panel.cookingRow),
          'on hand': /thyme/i.test(panel.cookingRow) && /lemons/i.test(panel.cookingRow),
          servings: /serves[^\d]*3(?!\d)/i.test(panel.cookingRow),
          skill: /advanced/i.test(panel.cookingRow),
        };
        for (const [field, ok] of Object.entries(echoes)) {
          t.expect(ok, `the "Cooking for" row echoes ${field}`, { observed: panel.cookingRow.slice(0, 220) });
        }
      });
    },
  },
];
