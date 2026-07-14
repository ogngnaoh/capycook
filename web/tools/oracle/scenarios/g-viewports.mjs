// Area G — narrow viewports & mobile reach. Copies a-intake.mjs's shapes:
// bounded waits (a state that never arrives is an assert FAIL, observed
// 'never', never a hang), sub-checks of one criterion sharing the id with a
// distinct name (the report ANDs them), NetLog-free geometric measurement, and
// judgeStill for the judge id. The contract
// (docs/02b-behavior-contract/contract.md) is the only normative text; each
// ctx.check() transcribes one criterion's recipe.
//
// Scenarios here (registry.mjs ids):
//   g/narrow-390       fast · narrow(390×844) — BC-G-5 static surfaces,
//                      BC-G-8 @390 hit-area sweep, BC-G-14 @390 tab-overlap
//                      (gate + idle stage + safety hold), BC-G-6 judge stills.
//   g/narrow-320       fast · reflow(320×800) — BC-G-12 static reflow,
//                      BC-G-14 @320 tab-overlap (gate + idle stage + safety hold).
//   g/narrow-live      live-sim · narrow — BC-G-5 mid-stream clause; a
//                      BC-G-6 proposing still.
//   g/narrow-live-320  live-sim · reflow — BC-G-12 mid-stream clause. Referenced
//                      by registry.mjs (BC-G-12 → ['g/narrow-320',
//                      'g/narrow-live-320']).
//
// One viewport per scenario — never resized mid-scenario. Every overflow
// assertion goes through lib/page.mjs measureOverflow(page).
import {
  sleep, clickButton, clickVerb, waitForVerb, setValue,
  measureOverflow, GARLIC_OIL_STEP, GARLIC_INGREDIENT,
} from '../lib/page.mjs';
import { seedTrials } from '../lib/api.mjs';

const gotoDish = async (page, base, dishId) => {
  await page.goto(`${base}/dishes/${dishId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#stage-heading', { timeout: 8000 });
  await page.waitForSelector('#cc-intent', { timeout: 8000 }).catch(() => {});
};

// -------------------------------------------------------- state transitions ---
// Each returns a boolean via a bounded wait; a false is a reachability FAIL the
// caller asserts on, never a silent skip.

async function typeIntentToGate(ctx, text) {
  const { page } = ctx;
  const bar = await page.waitForSelector('#cc-intent', { timeout: 8000 }).then(() => true).catch(() => false);
  if (!bar) return false;
  await setValue(page, '#cc-intent', '');
  await page.type('#cc-intent', text);
  await clickButton(page, /^Try it/i);
  return waitForVerb(page, 'accept', ctx.genTimeout).then(() => true).catch(() => false);
}

async function openAnother(page) {
  const has = await page.$('button[data-verb="accept"]');
  if (!has) return false;
  await clickButton(page, /^Try another way/i);
  return page.waitForSelector('button[data-verb="alternatives"]', { timeout: 5000 }).then(() => true).catch(() => false);
}

async function toAlternatives(ctx) {
  const { page } = ctx;
  if (!(await openAnother(page))) return false;
  await clickVerb(page, 'alternatives');
  return page.waitForSelector('[data-testid="alternatives-picker"]', { timeout: ctx.genTimeout }).then(() => true).catch(() => false);
}

async function pickAlt(page) {
  const picked = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="alt-card"]');
    if (!c) return false;
    c.click();
    return true;
  });
  if (!picked) return false;
  return waitForVerb(page, 'accept', 8000).then(() => true).catch(() => false);
}

// take_over the draft with the seeded anaerobic garlic-oil step: the safety
// gate answers 409 confirm-required and the human-edit override dialog
// (BC-C-8's path) renders — the recovery surface BC-G-5/G-12 measure.
async function toTakeoverOverride(ctx) {
  const { page } = ctx;
  if (!(await openAnother(page))) return false;
  await clickVerb(page, 'take_over');
  const form = await page.waitForSelector('[data-testid="takeover-form"] textarea', { timeout: 5000 }).then(() => true).catch(() => false);
  if (!form) return false;
  const injected = await page.evaluate((step, ing) => {
    const ta = document.querySelector('[data-testid="takeover-form"] textarea');
    if (!ta) return false;
    let draft;
    try { draft = JSON.parse(ta.value); } catch { return false; }
    draft.ingredients = Array.isArray(draft.ingredients) ? draft.ingredients : [];
    draft.steps = Array.isArray(draft.steps) ? draft.steps : [];
    draft.ingredients.push(ing);
    draft.steps.push(step);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, JSON.stringify(draft, null, 2));
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, GARLIC_OIL_STEP, GARLIC_INGREDIENT);
  if (!injected) return false;
  await clickButton(page, /^Save draft/i);
  return page.waitForSelector('[data-testid="override-prompt"]', { timeout: ctx.genTimeout }).then(() => true).catch(() => false);
}

async function dismissOverride(page) {
  await clickButton(page, /^Go back/i).catch(() => {});
  await page.waitForFunction(() => !document.querySelector('[data-testid="override-prompt"]'), { timeout: 5000 }).catch(() => {});
}

async function acceptGate(ctx) {
  const { page } = ctx;
  await clickVerb(page, 'accept');
  return page.waitForSelector('#cc-intent', { timeout: ctx.genTimeout }).then(() => true).catch(() => false);
}

async function toSafetyHold(ctx, text) {
  const { page } = ctx;
  const bar = await page.waitForSelector('#cc-intent', { timeout: 8000 }).then(() => true).catch(() => false);
  if (!bar) return false;
  await setValue(page, '#cc-intent', '');
  await page.type('#cc-intent', text);
  await clickButton(page, /^Try it/i);
  return page.waitForSelector('[data-testid="safety-hold"]', { timeout: ctx.genTimeout }).then(() => true).catch(() => false);
}

// ------------------------------------------------------------- measurement ---
// Gate geometry: single-column stage, sticky bottom bar, on-screen & within
// the viewport horizontally (BC-G-5).
const gateLayout = (page) => page.evaluate(() => {
  const gate = document.querySelector('#cc-gate');
  const main = document.querySelector('main.wb-grid') || document.querySelector('main');
  const cs = gate ? getComputedStyle(gate) : null;
  const gcols = main ? getComputedStyle(main).gridTemplateColumns : null;
  // Stage-first ordering (CSS `.wb-grid > section { order:-1 }`): the stage
  // <section> renders above the timeline <aside> even though it is DOM-second.
  // offsetTop reflects post-order layout and is scroll-independent (both are
  // direct children of <main>, one offsetParent), so `stage < timeline` proves
  // the stack order without racing the section's internal scroll.
  const section = document.querySelector('#stage');
  const aside = document.querySelector('aside[aria-label="Development timeline"]');
  const stageTop = section ? section.offsetTop : null;
  const timelineTop = aside ? aside.offsetTop : null;
  const stageBeforeTimeline = (section && aside) ? stageTop < timelineTop : null;
  let rect = null, bottomOnScreen = false, rectInViewportX = false;
  if (gate) {
    gate.scrollIntoView({ block: 'end' });
    const r = gate.getBoundingClientRect();
    rect = { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height) };
    bottomOnScreen = r.bottom <= window.innerHeight + 1 && r.top < window.innerHeight;
    rectInViewportX = r.left >= -1 && r.right <= window.innerWidth + 1;
  }
  return {
    present: !!gate,
    columns: gcols ? gcols.trim().split(/\s+/).length : null,
    gridTemplateColumns: gcols,
    position: cs ? cs.position : null,
    bottom: cs ? cs.bottom : null,
    stageBeforeTimeline, stageTop, timelineTop,
    rect, bottomOnScreen, rectInViewportX,
    innerWidth: window.innerWidth, innerHeight: window.innerHeight,
  };
});

// Hit-area rows for every interactive control inside a surface (BC-G-8 sweep).
// Size (w×h) is scroll-independent, so below-the-fold controls are measured too;
// only display-hidden (zero-size) and off-left skip-links are dropped.
const sweepControls = (page, rootSel) => page.evaluate((sel) => {
  const root = document.querySelector(sel);
  if (!root) return null;
  const els = [...root.querySelectorAll('button, [role="switch"], a[href], input, textarea, select')];
  return els.map((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) return null;   // display:none / unrendered
    if (r.right <= 0) return null;                  // off-screen-left skip links
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || null,
      verb: el.getAttribute('data-verb') || null,
      text: (el.getAttribute('aria-label') || el.value || el.textContent || '').trim().slice(0, 34),
      w: Math.round(r.width), h: Math.round(r.height),
      ok: r.width >= 24 && r.height >= 24,
    };
  }).filter(Boolean);
}, rootSel);

async function sweepInto(page, table, surfaces, label, rootSel) {
  const rows = await sweepControls(page, rootSel);
  if (!rows) return false;                 // surface not present
  for (const row of rows) table.push({ surface: label, ...row });
  surfaces.add(label);
  return true;
}

// Interactive controls clipped past the L/R viewport edges (BC-G-12 "no
// clipping"). Off-left skip links are excluded (they are hidden, not clipped).
const clippedControls = (page) => page.evaluate(() => {
  const iw = window.innerWidth;
  const els = [...document.querySelectorAll('button, [role="switch"], a[href], input, textarea, select')];
  const clipped = [];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 && r.height < 1) continue;
    if (r.right <= 0) continue;                                   // off-left skip links
    if (r.left >= iw || r.bottom <= 0 || r.top >= window.innerHeight) {
      // fully outside the viewport (scrolled away) — only flag horizontal clip
    }
    if (r.right > iw + 1 || r.left < -1) {
      clipped.push({
        tag: el.tagName.toLowerCase(),
        text: (el.getAttribute('aria-label') || el.value || el.textContent || '').trim().slice(0, 34),
        left: Math.round(r.left), right: Math.round(r.right), iw,
      });
    }
  }
  return clipped;
});

// Real-Tab overlap sweep (BC-G-14): at each stop, is the focused control
// majority-hidden UNDER the sticky header or gate bar? "Under" = >50% geometric
// overlap AND the chrome (not the control) is the top element at the control's
// centre — so a control that IS part of the chrome, or sits above it (the
// skip-links' z-50), never counts.
async function tabOverlapSweep(page, maxStops = 30) {
  // Reset the sequential-focus starting point to the document top: a bare
  // blur() leaves Chrome's starting point on the previously-focused control, so
  // the first Tab continues from mid-page and immediately wraps out. Focusing a
  // temporarily-focusable <body> re-origins Tab at the first document focusable.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
  });
  const stops = [];
  let prevKey = null;
  for (let i = 0; i < maxStops; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return { done: true };
      const r = el.getBoundingClientRect();
      const header = document.querySelector('header');
      const gate = document.querySelector('#cc-gate');
      const cx = Math.max(0, Math.min(window.innerWidth - 1, r.left + r.width / 2));
      const cy = Math.max(0, Math.min(window.innerHeight - 1, r.top + r.height / 2));
      const topEl = document.elementFromPoint(cx, cy);
      const obscuredBy = (chrome) => {
        if (!chrome) return false;
        if (chrome.contains(el) || el.contains(chrome)) return false;   // el is the chrome
        const cr = chrome.getBoundingClientRect();
        const ix = Math.max(0, Math.min(r.right, cr.right) - Math.max(r.left, cr.left));
        const iy = Math.max(0, Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top));
        const ratio = (ix * iy) / Math.max(1, r.width * r.height);
        const topInChrome = topEl && (chrome === topEl || chrome.contains(topEl));
        return ratio > 0.5 && topInChrome;
      };
      return {
        done: false,
        desc: { tag: el.tagName.toLowerCase(), id: el.id || null, verb: el.getAttribute('data-verb') || null, text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 28) },
        rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) },
        obscuredByHeader: obscuredBy(header),
        obscuredByGate: obscuredBy(gate),
      };
    });
    if (info.done) break;
    const key = JSON.stringify(info.desc) + JSON.stringify(info.rect);
    if (key === prevKey) break;                                  // focus stuck
    prevKey = key;
    stops.push(info);
    if (stops.length > 2 && JSON.stringify(stops[0].desc) === JSON.stringify(info.desc)) break; // cycled
  }
  await page.evaluate(() => document.body.removeAttribute('tabindex'));
  return stops;
}

// One BC-G-14 sub-check: run the Tab-overlap sweep on the surface currently on
// screen (labelled) and assert no focus stop is majority-hidden by the sticky
// chrome. The contract reuses BC-G-9's surfaces — gate, idle stage, and safety
// hold all keep the sticky header (the idle stage and hold have no gate bar),
// so each is swept at both narrow widths.
async function tabOverlapCheck(ctx, surface, reached) {
  const { page } = ctx;
  await ctx.check('BC-G-14', async (t) => {
    t.observe('surface', surface);
    t.expect(reached, `${surface} reached for the Tab sweep`, { observed: reached ? surface : 'never' });
    if (!reached) return;
    const stops = await tabOverlapSweep(page, 30);
    t.observe('stops', stops.map((s) => ({ el: s.desc, oh: s.obscuredByHeader, og: s.obscuredByGate })));
    t.expect(stops.length > 0, `${surface}: the Tab sweep visited focusable stops`, { observed: stops.length });
    const bad = stops.filter((s) => s.obscuredByHeader || s.obscuredByGate);
    t.expect(bad.length === 0, `${surface}: no focus stop is majority-hidden under the sticky header or gate bar`, { observed: bad });
  }, { name: `tab-${surface}` });
}

// Sweep the CookFlow trigger + its opened tasting form (BC-G-8 recovery-path
// surface). The CookFlow markup carries no data-testid, so it is reached by
// button text within the idle stage.
async function sweepCookFlow(page, table, surfaces) {
  const trigger = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#stage button')].find((x) => /^I cooked this/.test(x.textContent.trim()));
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), text: b.textContent.trim().slice(0, 34) };
  });
  if (!trigger) return false;
  table.push({ surface: 'cookflow', tag: 'button', verb: null, role: null, text: trigger.text, w: trigger.w, h: trigger.h, ok: trigger.w >= 24 && trigger.h >= 24 });
  // Open the tasting form and sweep its controls.
  await clickButton(page, /^I cooked this/i);
  const opened = await page.waitForSelector('#cc-tasting-notes', { timeout: 4000 }).then(() => true).catch(() => false);
  if (opened) {
    const formRows = await page.evaluate(() => {
      const form = document.querySelector('#cc-tasting-notes')?.closest('div');
      if (!form) return [];
      return [...form.querySelectorAll('button, textarea')].map((el) => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName.toLowerCase(), text: (el.textContent || el.getAttribute('aria-label') || 'notes').trim().slice(0, 34), w: Math.round(r.width), h: Math.round(r.height), ok: r.width >= 24 && r.height >= 24 };
      });
    });
    for (const row of formRows) table.push({ surface: 'cookflow', verb: null, role: null, ...row });
    // Cancel the tasting form so the idle intent bar is clear for what follows.
    await clickButton(page, /^Cancel/i).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('#cc-tasting-notes'), { timeout: 3000 }).catch(() => {});
  }
  surfaces.add('cookflow');
  return true;
}

const VW_NARROW = 390;
const VW_REFLOW = 320;

export const scenarios = [

  // ---------------------------------------------------------------------------
  // g/narrow-390 (fast, narrow): BC-G-5 static surfaces · BC-G-8 @390 hit-area
  // sweep · BC-G-14 @390 tab-overlap · BC-G-6 judge stills.
  // ---------------------------------------------------------------------------
  {
    id: 'g/narrow-390',
    profile: 'fast',
    viewport: 'narrow',
    criteria: ['BC-G-5', 'BC-G-8', 'BC-G-14', 'BC-G-6'],
    setup: seedTrials(0),
    run: async (ctx, dishId) => {
      const { page, base } = ctx;
      const hits = [];
      const surfaces = new Set();

      // BC-G-6 still: the seed screen at phone width.
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#field-seed', { timeout: 8000 });
      await ctx.judgeStill('BC-G-6', 'seed');
      // The proposing still is unreachable in the fast profile (stub resolves
      // instantly) — g/narrow-live captures it.

      await gotoDish(page, base, dishId);

      // --- BC-G-5 at the gate --------------------------------------------------
      const atGate = await typeIntentToGate(ctx, 'lean it brighter with lemon and fresh herbs');
      await ctx.check('BC-G-5', async (t) => {
        t.expect(atGate, 'drove the idle intent to a gate', { observed: atGate ? 'gate' : 'never' });
        if (!atGate) return;
        const layout = await gateLayout(page);
        t.observe('gateLayout', layout);
        t.expectEq(layout.columns, 1, 'stage renders a single column at 390');
        t.expect(layout.stageBeforeTimeline === true, 'single column is stage-first (stage renders above the timeline)', { observed: { stageTop: layout.stageTop, timelineTop: layout.timelineTop } });
        t.expect(layout.position === 'sticky', 'gate #cc-gate is position:sticky', { observed: layout.position });
        t.expectEq(layout.bottom, '0px', 'gate #cc-gate is pinned bottom:0');
        t.expect(layout.rectInViewportX, 'gate sits within the viewport horizontally', { observed: layout.rect });
        t.expect(layout.bottomOnScreen, 'gate is on-screen (rect vs viewport)', { observed: layout.rect });
        const ov = await measureOverflow(page);
        t.observe('overflow', ov);
        t.expect(ov.docScrollWidth <= VW_NARROW + 1, `no horizontal overflow at the gate (scrollWidth ${ov.docScrollWidth} ≤ ${VW_NARROW})`, { observed: ov });
        t.expect(ov.offenders.length === 0, 'no leaf element extends past the viewport at the gate', { observed: ov.offenders });
        // Frame the still from the top of the scroll so no card is sliced under
        // the sticky header (a mid-scroll capture read as clipped content to the
        // judge); the sticky gate bar stays pinned on-screen regardless.
        await page.evaluate(() => window.scrollTo(0, 0));
        await sleep(120);
        await ctx.judgeStill('BC-G-6', 'gate');
      }, { name: 'gate' });

      // Hit-area sweep: gate (decide) + header now; gate (another) after opening.
      await sweepInto(page, hits, surfaces, 'gate-decide', '[data-testid="gate-bar"]');
      await sweepInto(page, hits, surfaces, 'header', 'header');

      // --- BC-G-14 @390 tab-overlap: gate (both sticky header + gate bar) ------
      await tabOverlapCheck(ctx, 'gate', atGate);

      // --- BC-G-5 at the alternatives-picker ----------------------------------
      const opened = await openAnother(page);
      if (opened) await sweepInto(page, hits, surfaces, 'gate-another', '[data-testid="gate-bar"]');
      // openAnother already put us in 'another' mode; fire alternatives directly.
      let atAlts = false;
      if (opened) {
        await clickVerb(page, 'alternatives');
        atAlts = await page.waitForSelector('[data-testid="alternatives-picker"]', { timeout: ctx.genTimeout }).then(() => true).catch(() => false);
      }
      await ctx.check('BC-G-5', async (t) => {
        t.expect(atAlts, 'drove the gate to the alternatives-picker', { observed: atAlts ? 'picker' : 'never' });
        if (!atAlts) return;
        const ov = await measureOverflow(page);
        t.observe('overflow', ov);
        t.expect(ov.docScrollWidth <= VW_NARROW + 1, `no horizontal overflow at the alternatives-picker (scrollWidth ${ov.docScrollWidth})`, { observed: ov });
        t.expect(ov.offenders.length === 0, 'no leaf offender at the alternatives-picker', { observed: ov.offenders });
      }, { name: 'alternatives' });
      if (atAlts) await sweepInto(page, hits, surfaces, 'alternatives', '[data-testid="alternatives-picker"]');

      // --- BC-G-5 at the override-prompt (garlic take-over) -------------------
      let atGate2 = false;
      if (atAlts) atGate2 = await pickAlt(page);
      const atOverride = atGate2 ? await toTakeoverOverride(ctx) : false;
      await ctx.check('BC-G-5', async (t) => {
        t.expect(atOverride, 'reached the override-prompt via a garlic take-over', { observed: atOverride ? 'override' : 'never' });
        if (!atOverride) return;
        const ov = await measureOverflow(page);
        t.observe('overflow', ov);
        t.expect(ov.docScrollWidth <= VW_NARROW + 1, `no horizontal overflow at the override-prompt (scrollWidth ${ov.docScrollWidth})`, { observed: ov });
        t.expect(ov.offenders.length === 0, 'no leaf offender at the override-prompt', { observed: ov.offenders });
      }, { name: 'override' });
      if (atOverride) await sweepInto(page, hits, surfaces, 'override', '[data-testid="override-prompt"]');

      // --- BC-G-5 at the idle dish-stage + CookFlow (post-accept) -------------
      // Reach idle+CookFlow reliably for the still, DECOUPLED from the
      // alternatives/take-over churn above. The override "Go back" can strand us
      // off a gate (no accept verb); acceptGate's clickVerb('accept') then THREW,
      // crashing the scenario before this still and the safety-hold one were
      // captured — BC-G-6's judge saw only seed+gate. Reload to a known dish
      // state, ensure a gate (a fresh proposal if the reload didn't restore one),
      // then accept.
      if (atOverride) await dismissOverride(page);
      await gotoDish(page, base, dishId);
      // The reload may restore a gate, the idle intent bar, or the pending
      // alternatives-picker (BC-D-4 — the take-over churn left the dish there).
      // Normalize whichever it is to a gate with an accept verb, then accept.
      let atGateForAccept = await page.$('button[data-verb="accept"]').then(Boolean);
      let via = atGateForAccept ? 'restored-gate' : 'none';
      if (!atGateForAccept && (await page.$('[data-testid="alternatives-picker"]').then(Boolean))) {
        atGateForAccept = await pickAlt(page); via = 'picker';
      }
      if (!atGateForAccept && (await page.$('#cc-intent').then(Boolean))) {
        atGateForAccept = await typeIntentToGate(ctx, 'brighten it with lemon and fresh herbs'); via = 'fresh-proposal';
      }
      const idle = atGateForAccept ? await acceptGate(ctx) : false;
      await ctx.check('BC-G-5', async (t) => {
        t.observe('idleReachedVia', { via, idle });
        t.expect(idle, 'accepted a proposal → idle dish-stage', { observed: idle ? 'idle' : 'never' });
        if (!idle) return;
        const cookflow = await page.evaluate(() => [...document.querySelectorAll('#stage button')].some((b) => /^I cooked this/.test(b.textContent.trim())));
        t.expect(cookflow, 'CookFlow (phone-in-kitchen reference) rendered on the idle stage', { observed: cookflow });
        const ov = await measureOverflow(page);
        t.observe('overflow', ov);
        t.expect(ov.docScrollWidth <= VW_NARROW + 1, `no horizontal overflow at idle + CookFlow (scrollWidth ${ov.docScrollWidth})`, { observed: ov });
        t.expect(ov.offenders.length === 0, 'no leaf offender at idle + CookFlow', { observed: ov.offenders });
        // Frame the CookFlow reference (the "phone-in-kitchen" CTA the criterion
        // names) into view — at 390px it sits below the dish card's fold.
        await page.evaluate(() => {
          const cf = [...document.querySelectorAll('#stage button')].find((b) => /^I cooked this/.test(b.textContent.trim()));
          if (cf) cf.scrollIntoView({ block: 'center' });
        });
        // The accept fired a "saved to the timeline" toast (flash, 2600ms). Wait
        // it out so the fixed bottom toast can't overlap the CookFlow/cost
        // controls in the still (run-027's BC-G-6 caught it over "Recompute
        // cost"). Bounded — proceed anyway if it lingers.
        await page.waitForFunction(() => !document.querySelector('[data-testid="toast"]'), { timeout: 3500 }).catch(() => {});
        await sleep(120);
        await ctx.judgeStill('BC-G-6', 'idle-cookflow');
      }, { name: 'idle-cookflow' });
      if (idle) {
        await sweepInto(page, hits, surfaces, 'spine', 'aside[aria-label="Development timeline"]');
        await sweepCookFlow(page, hits, surfaces);
      }

      // --- BC-G-14 @390 tab-overlap: idle stage (sticky header, no gate bar) ---
      await tabOverlapCheck(ctx, 'idle', idle);

      // --- BC-G-5 at the safety hold ------------------------------------------
      const hold = idle ? await toSafetyHold(ctx, 'add a slow garlic oil confit left at room temperature') : false;
      await ctx.check('BC-G-5', async (t) => {
        t.expect(hold, 'drove a garlic-oil move to the safety hold', { observed: hold ? 'hold' : 'never' });
        if (!hold) return;
        const ov = await measureOverflow(page);
        t.observe('overflow', ov);
        t.expect(ov.docScrollWidth <= VW_NARROW + 1, `no horizontal overflow at the safety hold (scrollWidth ${ov.docScrollWidth})`, { observed: ov });
        t.expect(ov.offenders.length === 0, 'no leaf offender at the safety hold', { observed: ov.offenders });
      }, { name: 'safety-hold' });
      if (hold) await sweepInto(page, hits, surfaces, 'safety-hold', '[data-testid="safety-hold"]');

      // --- BC-G-14 @390 tab-overlap: safety hold (sticky header, no gate bar) --
      await tabOverlapCheck(ctx, 'safety-hold', hold);

      // --- BC-G-8 @390: the accumulated hit-area table ------------------------
      await ctx.check('BC-G-8', async (t) => {
        t.attach('hit-area-table', hits);
        t.observe('surfacesSwept', [...surfaces]);
        t.observe('moveFailedBanner', 'not reachable in fast/stub (SSE move_failed needs the budget profile) — its hit areas are covered by area H / BC-H-4');
        const required = ['gate-decide', 'gate-another', 'header', 'spine', 'alternatives', 'override', 'cookflow', 'safety-hold'];
        const missing = required.filter((s) => !surfaces.has(s));
        t.observe('missingSurfaces', missing);
        t.expect(hits.length > 0, 'measured interactive controls across the 390px surfaces', { observed: hits.length });
        const small = hits.filter((h) => !h.ok);
        t.expect(small.length === 0, 'every control on the 390px surfaces is ≥24×24 CSS px (WCAG 2.5.8)', { observed: small });
        t.expect(missing.length === 0, 'the full 390px recovery+core sweep reached every required surface', { observed: missing });
      }, { name: 'hit-390' });
    },
  },

  // ---------------------------------------------------------------------------
  // g/narrow-320 (fast, reflow): BC-G-12 static reflow · BC-G-14 @320 overlap.
  // ---------------------------------------------------------------------------
  {
    id: 'g/narrow-320',
    profile: 'fast',
    viewport: 'reflow',
    criteria: ['BC-G-12', 'BC-G-14'],
    setup: seedTrials(0),
    run: async (ctx, dishId) => {
      const { page, base } = ctx;

      const reflowCheck = (name, reachExpect) => async (t) => {
        t.expect(reachExpect.reached, reachExpect.label, { observed: reachExpect.reached ? name : 'never' });
        if (!reachExpect.reached) return;
        const ov = await measureOverflow(page);
        t.observe('overflow', ov);
        t.expect(ov.docScrollWidth <= VW_REFLOW + 1, `no horizontal scrolling at ${name} (scrollWidth ${ov.docScrollWidth} ≤ ${VW_REFLOW})`, { observed: ov });
        t.expect(ov.offenders.length === 0, `no leaf element overflows the viewport at ${name}`, { observed: ov.offenders });
        const clipped = await clippedControls(page);
        t.observe('clippedControls', clipped);
        t.expect(clipped.length === 0, `no interactive control is clipped outside the viewport at ${name}`, { observed: clipped });
      };

      // seed screen
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#field-seed', { timeout: 8000 });
      await ctx.check('BC-G-12', reflowCheck('the seed screen', { reached: true, label: 'seed screen rendered' }), { name: 'seed' });

      // idle dish-stage (intent bar + CookFlow)
      await gotoDish(page, base, dishId);
      const idle0 = await page.evaluate(() => [...document.querySelectorAll('#stage button')].some((b) => /^I cooked this/.test(b.textContent.trim())) && !!document.querySelector('#cc-intent'));
      await ctx.check('BC-G-12', reflowCheck('the idle dish-stage', { reached: idle0, label: 'idle dish-stage with intent bar + CookFlow rendered' }), { name: 'idle' });

      // BC-G-14 @320 tab-overlap: idle stage (sticky header, no gate bar)
      await tabOverlapCheck(ctx, 'idle', idle0);

      // gate
      const atGate = await typeIntentToGate(ctx, 'lean it brighter with lemon and fresh herbs');
      await ctx.check('BC-G-12', reflowCheck('the gate', { reached: atGate, label: 'drove the idle intent to a gate' }), { name: 'gate' });

      // BC-G-14 @320 tab-overlap: gate (both sticky header + gate bar)
      await tabOverlapCheck(ctx, 'gate', atGate);

      // alternatives-picker
      const atAlts = await toAlternatives(ctx);
      await ctx.check('BC-G-12', reflowCheck('the alternatives-picker', { reached: atAlts, label: 'drove the gate to the alternatives-picker' }), { name: 'alternatives' });

      // override-prompt (garlic take-over)
      let atGate2 = false;
      if (atAlts) atGate2 = await pickAlt(page);
      const atOverride = atGate2 ? await toTakeoverOverride(ctx) : false;
      await ctx.check('BC-G-12', reflowCheck('the override-prompt', { reached: atOverride, label: 'reached the override-prompt via a garlic take-over' }), { name: 'override' });

      // safety hold (recover to idle first)
      if (atOverride) await dismissOverride(page);
      const idle = atGate2 ? await acceptGate(ctx) : false;
      const hold = idle ? await toSafetyHold(ctx, 'add a slow garlic oil confit left at room temperature') : false;
      await ctx.check('BC-G-12', reflowCheck('the safety hold', { reached: hold, label: 'drove a garlic-oil move to the safety hold' }), { name: 'safety-hold' });

      // BC-G-14 @320 tab-overlap: safety hold (sticky header, no gate bar)
      await tabOverlapCheck(ctx, 'safety-hold', hold);
    },
  },

  // ---------------------------------------------------------------------------
  // g/narrow-live (live-sim, narrow): BC-G-5 mid-stream clause — overflow is
  // sampled DURING streaming, never once at rest.
  // ---------------------------------------------------------------------------
  {
    id: 'g/narrow-live',
    profile: 'live-sim',
    viewport: 'narrow',
    criteria: ['BC-G-5'],
    setup: seedTrials(0),
    run: async (ctx, dishId) => {
      const { page, base } = ctx;
      await gotoDish(page, base, dishId);

      await ctx.check('BC-G-5', async (t) => {
        const bar = await page.waitForSelector('#cc-intent', { timeout: 8000 }).then(() => true).catch(() => false);
        t.expect(bar, 'idle intent bar available', { observed: bar });
        if (!bar) return;
        await page.type('#cc-intent', 'push the whole dish somewhere brighter and more herbal');
        await clickButton(page, /^Try it/i);
        const proposing = await page.waitForSelector('[data-testid="proposing-card"]', { timeout: ctx.genTimeout }).then(() => true).catch(() => false);
        t.expect(proposing, 'proposing state appeared to stream against', { observed: proposing ? 'proposing' : 'never' });
        if (!proposing) return;
        // Sample overflow across the streaming window (recorder is running).
        const samples = [];
        for (let i = 0; i < 5; i++) {
          const ov = await measureOverflow(page);
          samples.push({ at: i, scrollWidth: ov.docScrollWidth, overflow: ov.docOverflow, offenders: ov.offenders.length });
          if (i === 2) await ctx.judgeStill('BC-G-6', 'proposing');
          await sleep(1500);
        }
        t.observe('samples', samples);
        const worst = samples.reduce((a, b) => (b.scrollWidth > a.scrollWidth ? b : a));
        t.expect(samples.every((s) => s.scrollWidth <= VW_NARROW + 1), `never overflows mid-stream (worst scrollWidth ${worst.scrollWidth} ≤ ${VW_NARROW})`, { observed: worst });
        t.expect(samples.every((s) => s.offenders === 0), 'no leaf offender at any mid-stream sample', { observed: samples });
        // Stop-early: enough samples taken; no need to wait out the full window.
      }, { name: 'mid-stream' });
    },
  },

  // ---------------------------------------------------------------------------
  // g/narrow-live-320 (live-sim, reflow): BC-G-12 mid-stream clause at 320px.
  // registry.mjs maps BC-G-12 → ['g/narrow-320', 'g/narrow-live-320'] — this
  // scenario carries the live-sim @320 half; g/narrow-320 carries the static
  // reflow surfaces.
  // ---------------------------------------------------------------------------
  {
    id: 'g/narrow-live-320',
    profile: 'live-sim',
    viewport: 'reflow',
    criteria: ['BC-G-12'],
    setup: seedTrials(0),
    run: async (ctx, dishId) => {
      const { page, base } = ctx;
      await gotoDish(page, base, dishId);

      await ctx.check('BC-G-12', async (t) => {
        const bar = await page.waitForSelector('#cc-intent', { timeout: 8000 }).then(() => true).catch(() => false);
        t.expect(bar, 'idle intent bar available', { observed: bar });
        if (!bar) return;
        await page.type('#cc-intent', 'push the whole dish somewhere brighter and more herbal');
        await clickButton(page, /^Try it/i);
        const proposing = await page.waitForSelector('[data-testid="proposing-card"]', { timeout: ctx.genTimeout }).then(() => true).catch(() => false);
        t.expect(proposing, 'proposing state appeared to stream against', { observed: proposing ? 'proposing' : 'never' });
        if (!proposing) return;
        const samples = [];
        for (let i = 0; i < 5; i++) {
          const ov = await measureOverflow(page);
          const clipped = await clippedControls(page);
          samples.push({ at: i, scrollWidth: ov.docScrollWidth, offenders: ov.offenders.length, clipped: clipped.length });
          await sleep(1500);
        }
        t.observe('samples', samples);
        const worst = samples.reduce((a, b) => (b.scrollWidth > a.scrollWidth ? b : a));
        t.expect(samples.every((s) => s.scrollWidth <= VW_REFLOW + 1), `never overflows mid-stream at 320 (worst scrollWidth ${worst.scrollWidth} ≤ ${VW_REFLOW})`, { observed: worst });
        t.expect(samples.every((s) => s.offenders === 0 && s.clipped === 0), 'no leaf offender and no clipped control at any mid-stream sample', { observed: samples });
      }, { name: 'mid-stream' });
    },
  },
];
