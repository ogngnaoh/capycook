// Area G — modes & a11y chrome (technical view · themes · motion · keyboard
// reach · numeric a11y sweeps). THE NUMERIC-SWEEP area: the in-page walkers
// (Tab sweep, contrast walk, hit-area sweep, boundary contrast) are LOCAL
// helpers here, installed once per document via evaluateOnNewDocument, and
// leaning on lib/contrast.mjs (window.__oracleContrast) for the WCAG math.
// Conventions inherited from a-intake.mjs: bounded waits, ctx.net counts,
// sub-checks share an id with a distinct name (the report ANDs them), judge
// evidence via ctx.judgeStill.
//
// This file provides exactly the two registry scenario ids:
//   g/desktop-modes (fast)     — BC-G-1,2,7,8(desktop),9,10,11,13,15 + G-3 stills
//   g/reduced-motion (live-sim, reducedMotion) — BC-G-4 + G-3 proposing stills
//
// The 390px repeat of G-5/6/8/12/14 belongs to the sibling g-viewports file.
import {
  sleep, clickButton, clickVerb, waitForVerb, setValue, fillSeed, SEED_TEXT,
  GARLIC_OIL_STEP, GARLIC_INGREDIENT,
} from '../lib/page.mjs';
import { seedTrials, CONSTRAINTS } from '../lib/api.mjs';
import { PAGE_SOURCE as CONTRAST_SRC } from '../lib/contrast.mjs';
import { installFaultInjector } from '../lib/net.mjs';

const MOVE_RE = /^\/api\/dishes\/[^/]+\/move$/;
const THEMES = ['light', 'dark'];

// ---------------------------------------------------------------------------
// In-page measurement bundle. Installed via evaluateOnNewDocument so it (and
// window.__oracleContrast) survive every page.goto/reload. All functions are
// self-contained and cross-reference through window.__oracleG so they
// serialize cleanly.
// ---------------------------------------------------------------------------
function G_BUNDLE() {
  const C = () => window.__oracleContrast;
  const parse = (s) => (C() ? C().parseCssColor(s) : null);

  function descOf(el) {
    if (!el || el === document.body) return '(body)';
    if (el === document.documentElement) return '(html)';
    const p = [el.tagName.toLowerCase()];
    if (el.id) p.push('#' + el.id);
    const tid = el.getAttribute && el.getAttribute('data-testid'); if (tid) p.push('@' + tid);
    const verb = el.getAttribute && el.getAttribute('data-verb'); if (verb) p.push('{' + verb + '}');
    const role = el.getAttribute && el.getAttribute('role'); if (role) p.push('[' + role + ']');
    const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28);
    if (txt) p.push('"' + txt + '"');
    return p.join(' ');
  }

  // Effective opaque background behind an element: ascend ancestors,
  // compositing translucent layers until an opaque one is reached.
  function effectiveBg(el) {
    const stack = [];
    let node = el;
    while (node && node.nodeType === 1) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c[3] > 0) { stack.push(c); if (c[3] === 1) break; }
      node = node.parentElement;
    }
    let base = [255, 255, 255];
    if (stack.length && stack[stack.length - 1][3] === 1) base = stack.pop().slice(0, 3);
    for (let i = stack.length - 1; i >= 0; i--) base = C().compositeOver(stack[i], base);
    return base;
  }

  function cumulativeOpacity(el) {
    let o = 1, node = el;
    while (node && node.nodeType === 1) {
      const v = parseFloat(getComputedStyle(node).opacity);
      if (!Number.isNaN(v)) o *= v;
      node = node.parentElement;
    }
    return o;
  }

  function hiddenByAncestor(el) {
    let n = el;
    while (n && n.nodeType === 1) {
      if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') return true;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
      n = n.parentElement;
    }
    return false;
  }

  // Tailwind sr-only: absolutely-positioned, 1px box, clipped.
  function isSrOnly(el) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'absolute') return false;
    const clipped = cs.clip === 'rect(0px, 0px, 0px, 0px)' || cs.clipPath === 'inset(50%)';
    const tiny = parseFloat(cs.width) <= 1 && parseFloat(cs.height) <= 1;
    return clipped || tiny;
  }

  function hasDirectText(el) {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim().length) return true;
    return false;
  }

  // BC-G-10: walk every rendered text node, contrast of resolved color
  // (composited with cumulative opacity) vs effective background.
  function textWalk(screen, theme) {
    const fails = [], seen = new Set();
    let count = 0;
    document.querySelectorAll('body *').forEach((el) => {
      if (!hasDirectText(el)) return;
      if (hiddenByAncestor(el)) return;
      if (isSrOnly(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      const cs = getComputedStyle(el);
      const color = parse(cs.color); if (!color) return;
      const bg = effectiveBg(el);
      const op = cumulativeOpacity(el);
      const alpha = (color[3] === undefined ? 1 : color[3]) * op;
      const fg = C().compositeOver([color[0], color[1], color[2], alpha], bg);
      const ratio = C().contrastRatio(fg, bg);
      const size = parseFloat(cs.fontSize);
      const large = C().isLargeText(size, cs.fontWeight);
      const threshold = large ? 3 : 4.5;
      count++;
      // +0.05 tolerance so a pair exactly on the line is not a rounding fail.
      if (ratio + 0.05 < threshold) {
        const key = cs.color + '|' + bg.join(',') + '|' + Math.round(size) + '|' + cs.fontWeight;
        if (!seen.has(key)) {
          seen.add(key);
          fails.push({
            screen, theme, desc: descOf(el),
            text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 36),
            color: cs.color, bg: 'rgb(' + bg.join(',') + ')',
            ratio: Math.round(ratio * 100) / 100, size, weight: cs.fontWeight,
            large, threshold, opacity: Math.round(op * 100) / 100,
          });
        }
      }
    });
    return { fails, count };
  }

  function visibleInteractive(el) {
    if (hiddenByAncestor(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 0.5 && r.height >= 0.5;
  }

  // BC-G-8: hit-area sweep (pointer target size, theme-independent).
  function hitAreas(screen, scopeSel) {
    const scope = scopeSel ? document.querySelector(scopeSel) : document.body;
    if (!scope) return [];
    const out = [];
    scope.querySelectorAll('button, [role="switch"], a[href], input, select, textarea').forEach((el) => {
      if (!visibleInteractive(el)) return;
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width * 10) / 10, h = Math.round(r.height * 10) / 10;
      out.push({ screen, desc: descOf(el), w, h, ok: w >= 24 && h >= 24 });
    });
    return out;
  }

  function ringColorFromShadow(bs) {
    if (!bs || bs === 'none') return null;
    const m = bs.match(/rgba?\([^)]+\)/);
    return m ? m[0] : null;
  }

  // BC-G-9/G-11: focus-indicator descriptor + focus-ring contrast vs the
  // adjacent (parent effective) background.
  function stopInfo(el) {
    const cs = getComputedStyle(el);
    const ow = parseFloat(cs.outlineWidth) || 0;
    const hasOutline = cs.outlineStyle !== 'none' && ow > 0;
    const hasShadow = !!cs.boxShadow && cs.boxShadow !== 'none';
    const ringColor = hasOutline ? cs.outlineColor : (hasShadow ? ringColorFromShadow(cs.boxShadow) : null);
    const adj = effectiveBg(el.parentElement || el);
    let ringContrast = null;
    const rc = parse(ringColor);
    if (rc && rc[3] > 0) {
      ringContrast = Math.round(C().contrastRatio(C().compositeOver(rc, adj), adj) * 100) / 100;
    }
    return {
      outlineWidth: cs.outlineWidth, outlineStyle: cs.outlineStyle, outlineColor: cs.outlineColor,
      boxShadow: cs.boxShadow === 'none' ? 'none' : (cs.boxShadow || 'none').slice(0, 48),
      hasIndicator: hasOutline || hasShadow, ringColor, ringContrast,
      adjacentBg: 'rgb(' + adj.join(',') + ')',
    };
  }

  // Contrast of a resolved boundary color vs an adjacent background (both
  // sides tried; a boundary reads if it clears ≥3:1 on either side).
  function boundaryContrast(colorStr, innerEl, outerEl) {
    const c = parse(colorStr);
    if (!c || c[3] === 0) return { color: colorStr, best: null };
    const inner = effectiveBg(innerEl);
    const outer = effectiveBg(outerEl || innerEl);
    const cIn = Math.round(C().contrastRatio(C().compositeOver(c, inner), inner) * 100) / 100;
    const cOut = Math.round(C().contrastRatio(C().compositeOver(c, outer), outer) * 100) / 100;
    return { color: colorStr, contrastInner: cIn, contrastOuter: cOut, best: Math.max(cIn, cOut),
      innerBg: 'rgb(' + inner.join(',') + ')', outerBg: 'rgb(' + outer.join(',') + ')' };
  }

  window.__oracleG = { descOf, effectiveBg, textWalk, hitAreas, stopInfo, boundaryContrast };
}

// ---------------------------------------------------------------------------
// Node-side helpers.
// ---------------------------------------------------------------------------
// Navigation with a bounded retry — a single stalled goto (occasional under
// the heavy multi-navigation journey) should not fail a whole surface.
async function nav(page, url, sel) {
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForSelector(sel, { timeout: 10000 });
      return;
    } catch (e) { last = e; await sleep(500); }
  }
  throw last;
}
const gotoHome = (page, base) => nav(page, `${base}/`, '#field-seed');
const gotoDish = (page, base, id) => nav(page, `${base}/dishes/${id}`, '#stage-heading');

// A fresh dish driven into the anaerobic safety hold. Robust: if a prior
// submit already blocked server-side, the hold restores on load (BC-D-4), so
// a reload path retries without a second POST.
async function driveToHold(ctx) {
  const { page, base } = ctx;
  const id = await newDish(ctx);
  await gotoDish(page, base, id);
  let ok = await page.waitForSelector('[data-testid="safety-hold"]', { timeout: 2000 }).then(() => true).catch(() => false);
  if (!ok) {
    await page.waitForSelector('#cc-intent', { timeout: 8000 });
    await page.type('#cc-intent', 'add a slow garlic oil confit step');
    await clickButton(page, /^Try it/i);
    ok = await page.waitForSelector('[data-testid="safety-hold"]', { timeout: ctx.genTimeout }).then(() => true).catch(() => false);
  }
  if (!ok) {
    await gotoDish(page, base, id);
    ok = await page.waitForSelector('[data-testid="safety-hold"]', { timeout: ctx.genTimeout }).then(() => true).catch(() => false);
  }
  if (!ok) throw new Error('safety hold never rendered');
  return id;
}

async function newDish(ctx) {
  const d = await ctx.api('POST', '/api/dishes', { seed: SEED_TEXT, constraints: CONSTRAINTS });
  return d.id;
}

async function driveToGate(ctx, id, steer = 'brighten the finish with a citrus note') {
  const { page, base } = ctx;
  await gotoDish(page, base, id);
  await page.waitForSelector('#cc-intent', { timeout: 8000 });
  await page.type('#cc-intent', steer);
  await clickButton(page, /^Try it/i);
  await waitForVerb(page, 'accept', ctx.genTimeout);
}

// A fresh dish carried through one accepted first pass → idle with Trial 1
// committed (ingredients with fdc/foodon ids + a ver-id on the spine). The
// seed dish itself is empty until the first pass lands.
async function newTrialDish(ctx) {
  const { page } = ctx;
  const id = await newDish(ctx);
  await driveToGate(ctx, id);
  await clickVerb(page, 'accept');
  await page.waitForFunction(() => !document.querySelector('button[data-verb="accept"]'), { timeout: ctx.genTimeout }).catch(() => {});
  await page.waitForSelector('#cc-intent', { timeout: 8000 });
  return id;
}

// Set the active theme. On the workbench the real header toggle is used
// (system→light→dark cycle, ≤3 clicks). When there is no usable toggle — the
// seed screen has none, and an open modal <dialog> renders the header inert —
// the [data-theme] pin + localStorage are set directly (same CSS environment;
// the toggle's own behaviour is proven separately by BC-G-2).
async function setTheme(page, target) {
  const mode = await page.evaluate((tgt) => {
    const btn = [...document.querySelectorAll('button')].find((b) => /^Theme:/.test(b.textContent.trim()));
    const modalOpen = !!document.querySelector('dialog[open]');
    const usable = btn && !(modalOpen && !btn.closest('dialog[open]'));
    if (!usable) {
      document.documentElement.setAttribute('data-theme', tgt);
      localStorage.setItem('capycook-theme', tgt);
      return 'direct';
    }
    return 'toggle';
  }, target);
  if (mode === 'toggle') {
    for (let i = 0; i < 4; i++) {
      const cur = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      if (cur === target) break;
      await clickButton(page, /^Theme:/);
      await sleep(60);
    }
    // Safety net — if the cycle did not land the target (e.g. a control went
    // inert mid-flip), force the pin directly so measurement never runs off-theme.
    const cur = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    if (cur !== target) {
      await page.evaluate((tgt) => {
        document.documentElement.setAttribute('data-theme', tgt);
        localStorage.setItem('capycook-theme', tgt);
      }, target);
    }
  }
  await sleep(60);
}

// Real Tab keypresses from a body-focused start (programmatic .focus() skips
// :focus-visible). Records focused style at each stop, then a resting pass
// reads the same tagged elements unfocused. Bounded + cycle-detected.
async function tabSweep(page) {
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  const stops = [];
  const seen = new Set();
  for (let i = 0; i < 250; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate((idx) => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return { end: true };
      const r = el.getBoundingClientRect();
      const sig = el.tagName + '|' + (el.id || '') + '|' + (el.getAttribute('data-verb') || '')
        + '|' + (el.getAttribute('data-testid') || '') + '|' + (el.textContent || '').trim().slice(0, 24)
        + '|' + Math.round(r.left) + ',' + Math.round(r.top);
      el.setAttribute('data-oracle-stop', String(idx));
      return { end: false, sig, desc: window.__oracleG.descOf(el), focused: window.__oracleG.stopInfo(el) };
    }, i);
    if (info.end) break;
    if (seen.has(info.sig)) break; // wrapped — full cycle observed
    seen.add(info.sig);
    stops.push(info);
  }
  const resting = await page.evaluate(() => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const map = {};
    document.querySelectorAll('[data-oracle-stop]').forEach((el) => {
      map[el.getAttribute('data-oracle-stop')] = window.__oracleG.stopInfo(el);
      el.removeAttribute('data-oracle-stop');
    });
    return map;
  });
  stops.forEach((s, i) => { s.resting = resting[String(i)] || null; });
  return stops;
}

// Real Tab presses from a body-focused start until focus lands on the
// proposing card's Stop control; returns its hit rect + focused/resting focus
// styles (the live-sim-only surface no fast sweep can reach).
async function tabToStop(page) {
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    window.scrollTo(0, 0);
  });
  const visited = [];
  const seen = new Set();
  let consecutiveEnd = 0;
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return { end: true };
      const card = el.closest('[data-testid="proposing-card"]');
      const isStop = el.tagName === 'BUTTON' && /^Stop$/.test((el.textContent || '').trim()) && !!card;
      const rect = el.getBoundingClientRect();
      const sig = el.tagName + '|' + (el.id || '') + '|' + (el.textContent || '').trim().slice(0, 16) + '|' + Math.round(rect.left) + ',' + Math.round(rect.top);
      if (!isStop) return { isStop: false, desc: window.__oracleG.descOf(el), sig, proposing: !!document.querySelector('[data-testid="proposing-card"]') };
      el.setAttribute('data-oracle-stop', 'stop');
      return { isStop: true, desc: window.__oracleG.descOf(el), focused: window.__oracleG.stopInfo(el),
        w: Math.round(rect.width * 10) / 10, h: Math.round(rect.height * 10) / 10 };
    });
    if (r.end) {
      // A stale focus-navigation starting point can eat the first Tab; nudge a
      // few times before concluding, but a genuine wrap past the end still ends.
      consecutiveEnd++;
      if (visited.length > 0 || consecutiveEnd >= 4) break;
      continue;
    }
    consecutiveEnd = 0;
    if (r.isStop) {
      const resting = await page.evaluate(() => {
        const el = document.querySelector('[data-oracle-stop="stop"]');
        if (!el) return null;
        if (el.blur) el.blur();
        const info = window.__oracleG.stopInfo(el);
        el.removeAttribute('data-oracle-stop');
        return info;
      });
      return { reached: true, desc: r.desc, focused: r.focused, resting, w: r.w, h: r.h };
    }
    visited.push(r.desc);
    if (seen.has(r.sig)) break; // cycled without finding Stop
    seen.add(r.sig);
  }
  return { reached: false, visited: visited.slice(0, 20), proposingPresent: await page.evaluate(() => !!document.querySelector('[data-testid="proposing-card"]')) };
}

const walkText = async (page, screen, theme, M) => {
  const { fails, count } = await page.evaluate((s, th) => window.__oracleG.textWalk(s, th), screen, theme);
  M.text.push(...fails);
  M.textScreens.push({ screen, theme, count, fails: fails.length });
};

const measureHit = async (page, screen, scopeSel, M) => {
  const areas = await page.evaluate((s, sc) => window.__oracleG.hitAreas(s, sc), screen, scopeSel || null);
  M.hit.push(...areas);
};

const sweep = async (page, screen, theme, M) => {
  const stops = await tabSweep(page);
  M.tab[`${screen}@${theme}`] = stops;
};

// ---------------------------------------------------------------------------
export const scenarios = [

  // =========================================================================
  // g/desktop-modes (fast): the numeric-sweep spine on the desktop viewport.
  // =========================================================================
  {
    id: 'g/desktop-modes',
    profile: 'fast',
    viewport: 'desktop',
    theme: 'light',
    criteria: ['BC-G-1', 'BC-G-2', 'BC-G-7', 'BC-G-8', 'BC-G-9', 'BC-G-10', 'BC-G-11', 'BC-G-13', 'BC-G-15', 'BC-G-3'],
    setup: seedTrials(1),
    run: async (ctx, dishId) => {
      const { page, base } = ctx;
      await page.evaluateOnNewDocument(CONTRAST_SRC);
      await page.evaluateOnNewDocument(G_BUNDLE);
      // Zero CSS transitions AND keyframe animations so a theme flip and any
      // entrance fade settle instantly. A contrast/boundary walk taken
      // mid-transition reads an interpolated background (e.g. ivory fading
      // into a dark panel); one taken during the `.cc-rise` entrance fade
      // (opacity 0→1, .18s, index.css) reads a partially-transparent
      // foreground composited toward the background. Both are measurement
      // artifacts, not the settled truth a user reads — the cc-rise case was
      // the BC-G-10 root cause (25 light-theme pairs flagged at opacity
      // 0.45–0.72, every one clearing AA at its final opacity 1). cc-rise uses
      // `animation-fill-mode: both`, so `animation-duration:0s` snaps it to its
      // `to` state (opacity 1). Transitions/animations are cosmetic ≤180ms; no
      // G check depends on their timing. Scoped to this scenario only —
      // g/reduced-motion never injects this (its motion clause must read the
      // app's own reduced-motion CSS).
      await page.evaluateOnNewDocument(() => {
        const add = () => {
          const s = document.createElement('style');
          s.id = 'oracle-no-motion';
          s.textContent = '*,*::before,*::after{transition-duration:0s !important;transition-delay:0s !important;animation-duration:0s !important;animation-delay:0s !important;}';
          (document.head || document.documentElement).appendChild(s);
        };
        if (document.head) add(); else document.addEventListener('DOMContentLoaded', add);
      });

      // -------- BC-G-7 · skip links are the first two focusables ----------
      await ctx.check('BC-G-7', async (t) => {
        const g7 = await newDish(ctx);           // fresh dish (keep setup dishId idle)
        await driveToGate(ctx, g7);              // land a proposal at the gate
        await page.reload({ waitUntil: 'domcontentloaded' }); // fresh load, gate restored (BC-D-4)
        await waitForVerb(page, 'accept', ctx.genTimeout).catch(() => {});
        await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
        const first = await (async () => {
          await page.keyboard.press('Tab');
          return page.evaluate(() => ({ text: (document.activeElement.textContent || '').trim(), tag: document.activeElement.tagName }));
        })();
        const second = await (async () => {
          await page.keyboard.press('Tab');
          return page.evaluate(() => ({ text: (document.activeElement.textContent || '').trim(), tag: document.activeElement.tagName }));
        })();
        t.observe('firstTwo', { first, second });
        t.expectMatch(first.text, /Skip to the dish/, 'first Tab stop is "Skip to the dish"');
        t.expectMatch(second.text, /Skip to the decision/, 'second Tab stop is "Skip to the decision"');
        // Activating skip-1 → stage heading.
        await page.evaluate(() => {
          const a = [...document.querySelectorAll('a.skip-link')].find((x) => /Skip to the dish/.test(x.textContent));
          a.focus();
        });
        await page.keyboard.press('Enter');
        await sleep(80);
        const onStage = await page.evaluate(() => document.activeElement.id === 'stage-heading');
        t.expect(onStage, 'activating "Skip to the dish" lands focus on #stage-heading', { observed: onStage });
        // Activating skip-2 → the live decision surface (the gate's first verb).
        await page.evaluate(() => {
          const a = [...document.querySelectorAll('a.skip-link')].find((x) => /Skip to the decision/.test(x.textContent));
          a.focus();
        });
        await page.keyboard.press('Enter');
        await sleep(80);
        const onDecision = await page.evaluate(() => {
          const el = document.activeElement;
          return { verb: el.getAttribute && el.getAttribute('data-verb'), inGate: !!el.closest && !!el.closest('[data-testid="gate-bar"]') };
        });
        t.expect(onDecision.inGate && !!onDecision.verb, 'activating "Skip to the decision" lands focus in the gate', { observed: onDecision });
      });

      // -------- BC-G-2 · theme cycles system→light→dark, persists, pins ----
      // Persistence is verified as its two composed halves — the toggle WRITE
      // to localStorage, and applyStoredTheme's boot-READ — because the
      // harness re-seeds `capycook-theme` on every document (browser.mjs), so
      // a single toggled value cannot survive a literal reload here.
      await ctx.check('BC-G-2', async (t) => {
        await gotoDish(page, base, dishId);
        const attr = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        const ls = () => page.evaluate(() => localStorage.getItem('capycook-theme'));
        const label = () => page.evaluate(() => {
          const b = [...document.querySelectorAll('button')].find((x) => /^Theme:/.test(x.textContent.trim()));
          return b ? b.textContent.trim() : null;
        });
        // Normalise to system first (≤3 clicks from any start).
        for (let i = 0; i < 3 && (await attr()) !== null; i++) { await clickButton(page, /^Theme:/); await sleep(60); }
        t.expectEq(await attr(), null, 'system state clears [data-theme]');
        t.expectMatch(await label(), /Theme: system/, 'label reads system');
        await clickButton(page, /^Theme:/); await sleep(60);
        t.expectEq(await attr(), 'light', 'system → light pins [data-theme="light"]');
        t.expectEq(await ls(), 'light', 'light written to localStorage');
        await clickButton(page, /^Theme:/); await sleep(60);
        t.expectEq(await attr(), 'dark', 'light → dark pins [data-theme="dark"]');
        t.expectEq(await ls(), 'dark', 'dark written to localStorage (the persistence WRITE)');
        t.expectMatch(await label(), /Theme: dark/, 'label tracks dark');
        // Boot-READ: on reload, applyStoredTheme applies whatever localStorage
        // holds at boot. (The harness re-seed makes that value the seeded one,
        // so we assert data-theme tracks localStorage — the read mechanism.)
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#stage-heading', { timeout: 8000 });
        const bootAttr = await attr();
        const bootLs = await ls();
        const norm = (bootLs === 'light' || bootLs === 'dark') ? bootLs : null;
        t.observe('bootAfterReload', { bootAttr, bootLs });
        t.expectEq(bootAttr, norm, 'reload: applyStoredTheme applies the persisted localStorage theme (boot-READ)');
        t.observe('harnessNote', 'browser.mjs seeds capycook-theme per document — a single toggled value cannot survive a literal reload here; persistence is verified as WRITE (localStorage set by the toggle) + boot-READ (data-theme tracks localStorage on load).');
        // Back to system clears both attribute and localStorage.
        for (let i = 0; i < 3 && (await attr()) !== null; i++) { await clickButton(page, /^Theme:/); await sleep(60); }
        t.expectEq(await attr(), null, 'cycling back to system clears the attribute');
        t.expectEq(await ls(), null, 'system removes the localStorage pin');
      });

      // -------- BC-G-1 · technical view reveals/hides the machinery -------
      // The markers live in different states: fdc/foodon chips + the spine
      // ver-id show on the idle committed dish (ingredient rows render there);
      // "Structured diff" + the conf % show at a gate (a live proposal). The
      // toggle is one control across both. (technicalView is unseeded by the
      // harness, so its reload-persistence is testable normally.)
      await ctx.check('BC-G-1', async (t) => {
        const id = await newTrialDish(ctx);       // idle, Trial 1 committed
        const versions = await ctx.api('GET', `/api/dishes/${id}/versions`);
        const verId = (versions.versions && versions.versions[0] && versions.versions[0].id) || null;
        const pressed = () => page.evaluate(() => {
          const b = [...document.querySelectorAll('button')].find((x) => /^Technical view$/.test(x.textContent.trim()));
          return b ? b.getAttribute('aria-pressed') : null;
        });
        const readMarkers = () => page.evaluate((vid) => {
          const body = document.body.textContent;
          const aside = document.querySelector('aside[aria-label="Development timeline"]');
          return {
            structuredDiff: body.includes('Structured diff · JSON-Pointer ops'),
            conf: /conf\s+\d+%/.test(body),
            provenance: !!document.querySelector('[data-testid="ingredient-row"]') && /fdc:|foodon:/.test(body),
            verId: !!(vid && aside && aside.textContent.includes(vid)),
            ruleId: /rule_id:/.test(body),
          };
        }, verId);
        // Ensure OFF baseline.
        if ((await pressed()) === 'true') { await clickButton(page, /^Technical view$/); await sleep(120); }
        const idleOff = await readMarkers();
        // IDLE markers ON: fdc/foodon chips + ver-id.
        await clickButton(page, /^Technical view$/); await sleep(150);
        t.expectEq(await pressed(), 'true', 'aria-pressed true after enabling');
        const idleOn = await readMarkers();
        t.observe('idle', { off: idleOff, on: idleOn, verId });
        t.expect(idleOn.provenance, '≥1 fdc:/foodon: chip on an ingredient row (idle)', { observed: idleOn.provenance });
        t.expect(idleOn.verId, 'ver-id line on the spine card (idle)', { observed: idleOn.verId });
        t.expect(!idleOff.provenance && !idleOff.verId, 'OFF hides chips + ver-id', { observed: idleOff });
        // Persist across reload (technical stays ON, idle markers return).
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#cc-intent', { timeout: 8000 });
        t.expectEq(await pressed(), 'true', 'technical setting persists across reload');
        t.expect((await readMarkers()).provenance, 'chips still present after reload (persisted ON)');
        // GATE markers ON: Structured diff + conf %.
        await page.type('#cc-intent', 'deepen the umami without adding salt');
        await clickButton(page, /^Try it/i);
        await waitForVerb(page, 'accept', ctx.genTimeout);
        const gateOn = await readMarkers();
        t.observe('gate', { on: gateOn });
        t.expect(gateOn.structuredDiff, '"Structured diff · JSON-Pointer ops" on the dish card (gate)', { observed: gateOn.structuredDiff });
        t.expect(gateOn.conf, 'confidence percentage on the proposal header (gate)', { observed: gateOn.conf });
        t.expect(gateOn.verId, 'ver-id line on the spine card (gate)', { observed: gateOn.verId });
        // Toggle OFF → the gate machinery is gone.
        await clickButton(page, /^Technical view$/); await sleep(150);
        const gateOff = await readMarkers();
        t.expect(!gateOff.structuredDiff && !gateOff.conf, 'OFF hides ops JSON + conf', { observed: gateOff });

        // rule_id on a hold (the hold marker of the same toggle).
        const held = await driveToHold(ctx).then(() => true).catch(() => false);
        t.expect(held, 'safety hold reached for the rule_id marker', { observed: held });
        if (held) {
          if ((await pressed()) !== 'true') { await clickButton(page, /^Technical view$/); await sleep(150); }
          const holdOn = (await readMarkers()).ruleId;
          await clickButton(page, /^Technical view$/); await sleep(150);
          const holdOff = (await readMarkers()).ruleId;
          t.expect(holdOn, 'technical ON shows rule_id: on the hold', { observed: holdOn });
          t.expect(!holdOff, 'technical OFF hides rule_id:', { observed: holdOff });
        }
      }, { deadlineMs: 90000 });

      // -------- BC-G-15 · 1.4.12 text-spacing overrides break nothing -----
      await ctx.check('BC-G-15', async (t) => {
        const probe = () => page.evaluate(() => {
          const st = document.createElement('style');
          st.id = 'oracle-1412';
          st.textContent = '*{line-height:1.5 !important;letter-spacing:0.12em !important;word-spacing:0.16em !important;}'
            + 'p,li,h1,h2,h3,h4{margin-bottom:2em !important;}';
          document.head.appendChild(st);
          void document.body.offsetHeight;
          const clipped = [];
          document.querySelectorAll('body *').forEach((el) => {
            const cs = getComputedStyle(el);
            if (!/hidden|clip/.test(cs.overflow + cs.overflowX + cs.overflowY)) return;
            if (cs.textOverflow === 'ellipsis' || cs.whiteSpace === 'nowrap') return; // intentional 1-line clamp
            let text = false;
            for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) text = true;
            if (!text) return;
            if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) {
              clipped.push({ desc: window.__oracleG.descOf(el), sh: el.scrollHeight, ch: el.clientHeight, sw: el.scrollWidth, cw: el.clientWidth });
            }
          });
          // Occlusion: every interactive control in the viewport still hit-testable.
          const occluded = [];
          document.querySelectorAll('button, [role="switch"], a[href], input, select, textarea').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) return;
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return;
            const top = document.elementFromPoint(cx, cy);
            if (!(top && (top === el || el.contains(top) || top.contains(el)))) {
              occluded.push({ desc: window.__oracleG.descOf(el) });
            }
          });
          const verbs = [...document.querySelectorAll('[data-testid="gate-bar"] button[data-verb], [data-testid="safety-hold"] button[data-verb]')]
            .map((b) => ({ desc: window.__oracleG.descOf(b), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) }));
          document.getElementById('oracle-1412')?.remove();
          return { clipped, occluded, verbs };
        });

        // Seed screen.
        await gotoHome(page, base);
        const seed = await probe();
        // Gate screen.
        const gid = await newDish(ctx);
        await driveToGate(ctx, gid);
        const gate = await probe();
        // Safety hold.
        await driveToHold(ctx).catch(() => {});
        const hold = await probe();

        t.attach('text-spacing', { seed, gate, hold });
        const totalClipped = seed.clipped.length + gate.clipped.length + hold.clipped.length;
        const totalOccluded = seed.occluded.length + gate.occluded.length + hold.occluded.length;
        t.expectEq(totalClipped, 0, 'no text clipped by overflow-hidden containers under 1.4.12 overrides', );
        t.expectEq(totalOccluded, 0, 'no interactive control occluded under 1.4.12 overrides');
        t.expect(gate.verbs.length >= 2 && gate.verbs.every((v) => v.w > 0 && v.h > 0), 'gate verbs still present and sized', { observed: gate.verbs });
        t.expect(hold.verbs.length >= 1, 'safety-hold verbs still present', { observed: hold.verbs });
      }, { deadlineMs: 90000 });

      // ===================================================================
      // Measurement journey — visit each surface once per theme, populate M,
      // capture BC-G-3 stills. Each surface guarded; unreached ones become
      // explicit notes, never silent skips.
      // ===================================================================
      const M = { text: [], textScreens: [], hit: [], tab: {}, dial: [], borders: [], reached: {}, notes: [] };
      await runJourney(ctx, dishId, M);

      // -------- BC-G-8 · hit areas ≥24×24 (desktop half) ------------------
      await ctx.check('BC-G-8', async (t) => {
        const under = M.hit.filter((a) => !a.ok);
        t.observe('surfacesSwept', [...new Set(M.hit.map((a) => a.screen))]);
        t.attach('hit-areas-smallest', [...M.hit].sort((a, b) => (a.w * a.h) - (b.w * b.h)).slice(0, 10));
        t.expect(M.hit.length > 0, 'interactive controls were measured', { observed: M.hit.length });
        t.expect(M.reached.seed && M.reached.idle && M.reached.gate, 'core surfaces reached for the sweep', { observed: M.reached });
        t.attach('under-24', under);
        t.expectEq(under.length, 0, 'every measured control is ≥24×24 CSS px');
        M.notes.forEach((n) => t.observe('note:' + n.slice(0, 24), n));
      }, { name: 'desktop' });

      // -------- BC-G-9 · focus visible at every Tab stop, both themes -----
      await ctx.check('BC-G-9', async (t) => {
        const keys = Object.keys(M.tab);
        let total = 0; const bad = [];
        for (const k of keys) {
          for (const s of M.tab[k]) {
            total++;
            const f = s.focused, r = s.resting || {};
            const distinct = f.hasIndicator && (f.outlineWidth !== r.outlineWidth || f.outlineStyle !== r.outlineStyle || f.boxShadow !== r.boxShadow);
            if (!distinct) bad.push({ where: k, desc: s.desc, focused: f, resting: r });
          }
        }
        t.observe('screensSwept', keys);
        t.observe('themesCovered', [...new Set(keys.map((k) => k.split('@')[1]))]);
        t.expect(total > 0, 'Tab stops were captured', { observed: total });
        t.expect(keys.some((k) => k.endsWith('@light')) && keys.some((k) => k.endsWith('@dark')), 'swept in both themes', { observed: keys });
        t.attach('focus-invisible-stops', bad.slice(0, 20));
        t.expectEq(bad.length, 0, 'every Tab stop shows a focus indicator distinct from its resting state');
      });

      // -------- BC-G-11 · focus indicator ≥3:1 vs adjacent bg -------------
      await ctx.check('BC-G-11', async (t) => {
        const weak = [];
        let measured = 0;
        for (const k of Object.keys(M.tab)) {
          for (const s of M.tab[k]) {
            // A stop with NO focus indicator is BC-G-9's concern, not G-11's.
            if (!s.focused.hasIndicator) continue;
            const rc = s.focused.ringContrast;
            // An indicator that IS present but whose colour can't be resolved
            // (transparent outline, unparsed shadow) must FAIL here, never be
            // silently skipped (critic m2).
            if (rc === null || rc === undefined) {
              weak.push({ where: k, desc: s.desc, ringContrast: null, reason: 'ring colour unresolved', focused: s.focused });
              continue;
            }
            measured++;
            if (rc + 0.02 < 3) weak.push({ where: k, desc: s.desc, ringContrast: rc, ringColor: s.focused.ringColor, adjacentBg: s.focused.adjacentBg });
          }
        }
        t.expect(measured > 0, 'focus-ring colors were resolved at Tab stops', { observed: measured });
        t.attach('focus-ring-below-3to1', weak.slice(0, 20));
        t.expectEq(weak.length, 0, 'the focus indicator clears 3:1 against its adjacent background at every stop, both themes');
      });

      // -------- BC-G-10 · text contrast meets AA numerically -------------
      // [LIKELY FAILS TODAY — the --color-faint pairs measure ~2.7–4.0:1].
      await ctx.check('BC-G-10', async (t) => {
        t.observe('screensWalked', M.textScreens);
        t.observe('reached', M.reached);
        t.expect(M.textScreens.some((s) => s.count > 0), 'text nodes were walked', { observed: M.textScreens.length });
        // The contract enumerates the walked surfaces including the critical
        // banner + override-prompt; require them reached so a failure-swallowing
        // guard can never green a run that skipped the highest-stakes pairs.
        const required = ['seed', 'idle', 'gate', 'safety-hold', 'action-error', 'override'];
        const missing = required.filter((s) => !M.reached[s]);
        t.expectEq(missing.length, 0, `all enumerated G-10 surfaces walked (missing: ${missing.join(',') || 'none'})`);
        t.expect(M.textScreens.some((s) => s.screen === 'cookflow' && s.theme === 'dark'), 'CookFlow caption walked in dark too', { observed: M.textScreens.filter((s) => s.screen === 'cookflow') });
        // Rank worst offenders for the evidence table.
        const sorted = [...M.text].sort((a, b) => a.ratio - b.ratio);
        t.attach('contrast-failures', sorted.slice(0, 40));
        t.observe('failCount', M.text.length);
        // The contract's pass condition: every pair clears its threshold.
        t.expectEq(M.text.length, 0, 'every text/background pair clears its WCAG AA threshold in both themes');
      });

      // -------- BC-G-13 · dial/invalid/hold boundaries ≥3:1 --------------
      await ctx.check('BC-G-13', async (t) => {
        t.attach('dial', M.dial);
        t.attach('boundaries', M.borders);
        // Dial track + thumb, both states, both themes.
        let dialMeasured = 0;
        for (const d of M.dial) {
          dialMeasured++;
          t.expect(d.trackContrast !== null && d.trackContrast + 0.02 >= 3,
            `dial ${d.state}/${d.theme}: track ≥3:1 (${d.trackContrast})`, { observed: d });
          t.expect(d.thumbContrast !== null && d.thumbContrast + 0.02 >= 3,
            `dial ${d.state}/${d.theme}: thumb ≥3:1 (${d.thumbContrast})`, { observed: d });
        }
        t.expect(dialMeasured >= 4, 'dial measured in both states × both themes', { observed: dialMeasured });
        // Invalid seed border + safety-hold border, both themes.
        for (const b of M.borders) {
          t.expect(b.best !== null && b.best + 0.02 >= 3,
            `${b.kind}/${b.theme}: boundary ≥3:1 (best ${b.best})`, { observed: b });
        }
        t.expect(M.borders.some((b) => b.kind === 'invalid-seed') && M.borders.some((b) => b.kind === 'safety-hold'),
          'both invalid-field and safety-hold borders measured', { observed: M.borders.map((b) => b.kind) });
      });
    },
  },

  // =========================================================================
  // g/reduced-motion (live-sim, reducedMotion): motion stilled, alive-signal
  // survives — AND the live-sim-only Stop control's hit/focus/ring (BC-G-8/9/11
  // sub-checks), measurable only here where the proposing state persists for
  // the ~25s latency. BC-G-4 + BC-G-3 proposing stills. NB: no transition
  // disable here — the motion clause must read the app's own reduced-motion CSS.
  // =========================================================================
  {
    id: 'g/reduced-motion',
    profile: 'live-sim',
    viewport: 'desktop',
    theme: 'light',
    reducedMotion: true,
    criteria: ['BC-G-4', 'BC-G-3', 'BC-G-8', 'BC-G-9', 'BC-G-11'],
    setup: seedTrials(0),
    run: async (ctx, dishId) => {
      const { page, base, net } = ctx;
      await page.evaluateOnNewDocument(CONTRAST_SRC);
      await page.evaluateOnNewDocument(G_BUNDLE);
      // A tiny renderer-side observer stamps when the streamed rationale <p>
      // first carries text (measured from move dispatch, not doc load).
      await page.evaluateOnNewDocument(() => {
        window.__g4 = { t0: performance.now(), firstTextT: null };
        const scan = () => {
          if (window.__g4.firstTextT !== null) return;
          const card = document.querySelector('[data-testid="proposing-card"]');
          if (!card) return;
          const p = card.querySelector('p');
          const txt = p ? (p.textContent || '').trim() : '';
          if (txt.length > 0) window.__g4.firstTextT = performance.now() - window.__g4.t0;
        };
        const start = () => { new MutationObserver(scan).observe(document.documentElement, { subtree: true, childList: true, characterData: true }); scan(); };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
      });

      // API-created dish (setup) + direct navigation: BC-A-3's auto-fire only
      // triggers on the in-app create journey, so the manual dispatch below —
      // which arms the __g4 timing baseline at click — keeps its semantics.
      await gotoDish(page, base, dishId);
      const idle = await page.waitForSelector('#cc-intent', { timeout: 8000 }).then(() => true).catch(() => false);

      // Dispatch the first pass ONCE; the proposing state (and its Stop control)
      // persists on screen for the ~25s stub latency window.
      let proposing = false;
      let mark = net.mark();
      let motion = null;
      if (idle) {
        await page.type('#cc-intent', 'lean the whole dish toward smoke and citrus');
        mark = net.mark();
        await page.evaluate(() => { window.__g4.t0 = performance.now(); window.__g4.firstTextT = null; });
        await clickButton(page, /^Try it/i);
        proposing = await page.waitForSelector('[data-testid="proposing-card"]', { timeout: ctx.genTimeout }).then(() => true).catch(() => false);
        // Measure motion + the light proposing still IMMEDIATELY — before the
        // Stop sweep spends seconds — so both are captured well inside the 25s
        // window even under machine load (timing-safety, not a behaviour change).
        if (proposing) {
          motion = await page.evaluate(() => {
            const dur = (el) => {
              if (!el) return null;
              const cs = getComputedStyle(el);
              const toS = (v) => Math.max(...String(v).split(',').map((x) => {
                x = x.trim();
                return x.endsWith('ms') ? parseFloat(x) / 1000 : parseFloat(x) || 0;
              }));
              return { animation: toS(cs.animationDuration), transition: toS(cs.transitionDuration) };
            };
            return {
              card: dur(document.querySelector('[data-testid="proposing-card"]')),
              spinner: dur(document.querySelector('[data-testid="proposing-spinner"]')),
              caret: dur(document.querySelector('[data-testid="proposing-caret"]')),
            };
          });
          // Direct screenshot, not judgeStill: the screencast recorder lags the
          // proposing paint and captured an IDLE frame here in run-034. A direct
          // shot composites the live DOM (the proposing surface is confirmed
          // present) — deterministic. BC-G-3.
          await page.evaluate(() => window.scrollTo(0, 0));
          await ctx.judgeShot('BC-G-3', 'proposing-light');
        }
      }

      // Measure the Stop control in BOTH themes while proposing is on screen.
      // Pin the theme DIRECTLY (not via the toggle) — clicking the toggle
      // re-mounts a focused button mid-generation, leaving a stale
      // focus-navigation starting point that eats the next real Tab. Real Tab
      // (not .focus()) is still used to LAND on the Stop so :focus-visible fires.
      const pinTheme = (t) => page.evaluate((th) => {
        document.documentElement.setAttribute('data-theme', th);
        localStorage.setItem('capycook-theme', th);
      }, t);
      const stopMeas = {};
      if (proposing) {
        for (const theme of THEMES) {
          await pinTheme(theme);
          await sleep(80);
          stopMeas[theme] = await tabToStop(page);
        }
        await pinTheme('light');
        await sleep(60);
      }

      // ---- BC-G-8 (live-sim half): Stop control ≥24×24 ----
      await ctx.check('BC-G-8', async (t) => {
        t.expect(proposing, 'proposing state reached (Stop control present)', { observed: proposing });
        const s = stopMeas.light;
        t.expect(!!(s && s.reached), 'Stop control reached by real Tab', { observed: s });
        if (s && s.reached) t.expect(s.w >= 24 && s.h >= 24, `Stop control ≥24×24 (${s.w}×${s.h})`, { observed: s });
      }, { name: 'stop-live' });

      // ---- BC-G-9 (live-sim half): Stop focus indicator, both themes ----
      await ctx.check('BC-G-9', async (t) => {
        t.attach('stop-focus', stopMeas);
        for (const theme of THEMES) {
          const s = stopMeas[theme];
          const reached = !!(s && s.reached);
          t.expect(reached, `Stop reachable by real Tab (${theme})`, { observed: s });
          if (!reached) continue;
          const f = s.focused, r = s.resting || {};
          const distinct = f.hasIndicator && (f.outlineWidth !== r.outlineWidth || f.outlineStyle !== r.outlineStyle || f.boxShadow !== r.boxShadow);
          t.expect(distinct, `Stop focus indicator distinct from resting (${theme})`, { observed: { focused: f, resting: r } });
        }
      }, { name: 'stop-live' });

      // ---- BC-G-11 (live-sim half): Stop focus ring ≥3:1, both themes ----
      await ctx.check('BC-G-11', async (t) => {
        for (const theme of THEMES) {
          const s = stopMeas[theme];
          if (!(s && s.reached)) { t.expect(false, `Stop reached to measure the ring (${theme})`, { observed: s }); continue; }
          const rc = s.focused.ringContrast;
          t.expect(rc !== null && rc !== undefined && rc + 0.02 >= 3, `Stop focus ring ≥3:1 vs adjacent bg (${theme}, ${rc})`, { observed: s.focused });
        }
      }, { name: 'stop-live' });

      // ---- BC-G-4: motion stilled + alive-signal + BC-G-3 proposing stills ----
      await ctx.check('BC-G-4', async (t) => {
        t.expect(proposing, 'proposing surface appeared', { observed: proposing });
        t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 1, 'exactly one move dispatched');
        if (!proposing) return;

        // Motion clause: computed animation/transition durations ~0s on the
        // proposing surface (reduced-motion zeros them to 0.01ms). Captured at
        // dispatch (above) to stay inside the 25s window.
        t.observe('motion', motion);
        const stilled = (m) => m && m.animation <= 0.01 && m.transition <= 0.01;
        t.expect(stilled(motion && motion.spinner), 'spinner animation stilled (~0s)', { observed: motion && motion.spinner });
        t.expect(stilled(motion && motion.caret), 'caret animation stilled (~0s)', { observed: motion && motion.caret });
        t.expect(stilled(motion && motion.card), 'proposing card rise animation stilled (~0s)', { observed: motion && motion.card });

        // Capture the dark BC-G-3 proposing still (light was captured at
        // dispatch); if the proposal already landed, the still just shows the
        // gate — legibility-judged either way. Direct pin (no click) keeps the
        // proposing surface undisturbed.
        // Use the real toggle (setTheme), not pinTheme: a direct [data-theme]
        // pin is state-driven-reverted to light by the app on the next streaming
        // re-render, so run-027's "dark" proposing still was actually a light
        // frame. setTheme flips React theme state, which sticks through
        // re-renders; the longer settle lets the dark repaint reach a fresh
        // screencast frame before the still.
        await setTheme(page, 'dark');
        await sleep(260);
        await page.evaluate(() => window.scrollTo(0, 0));
        await ctx.judgeShot('BC-G-3', 'proposing-dark');
        await setTheme(page, 'light');
        await sleep(60);

        // Alive-signal clause: rationale text appears at t ≤ 20s (renderer
        // clock). [B-3 FAILS TODAY — text streams AFTER generation, so this
        // clause is expected to fail today; reported with the cross-ref.]
        const start = Date.now();
        let firstT = null;
        while (Date.now() - start < 21000) {
          firstT = await page.evaluate(() => window.__g4.firstTextT);
          if (firstT !== null && firstT <= 20000) break;
          await sleep(500);
        }
        t.observe('rationaleFirstTextMs', firstT);
        t.expect(firstT !== null && firstT <= 20000,
          'streamed rationale text appears within 20s (BC-B-3 alive-signal; FAILS TODAY — streams after generation)',
          { observed: firstT === null ? 'never within 20s' : Math.round(firstT) + 'ms' });
      });
    },
  },
];

// ---------------------------------------------------------------------------
// The measurement journey. Populates M across the reachable surfaces × themes.
// ---------------------------------------------------------------------------
async function runJourney(ctx, dishId, M) {
  const { page, base } = ctx;
  const guard = async (name, fn) => {
    try { await fn(); M.reached[name] = true; }
    catch (e) { M.reached[name] = false; M.notes.push(`surface "${name}" not reached: ${String(e && e.message || e).slice(0, 120)}`); }
  };

  // ---- SEED screen (home) ----
  await guard('seed', async () => {
    await gotoHome(page, base);
    for (const theme of THEMES) {
      await setTheme(page, theme);
      await walkText(page, 'seed', theme, M);
      await ctx.judgeStill('BC-G-3', `seed-${theme}`);
      await sweep(page, 'seed', theme, M);
    }
    await measureHit(page, 'seed', null, M);
  });

  // ---- SEED error state: G-13 invalid border + G-10 error-summary text ----
  await guard('seed-error', async () => {
    await gotoHome(page, base);
    await page.evaluate(() => window.scrollTo(0, 0));
    await clickButton(page, /^Develop this dish/i); // empty seed → error summary
    await page.waitForSelector('[role="alert"]', { timeout: 4000 });
    for (const theme of THEMES) {
      await setTheme(page, theme);
      await walkText(page, 'seed-error', theme, M);
      const b = await page.evaluate((th) => {
        const f = document.getElementById('field-seed');
        if (!f) return null;
        const r = window.__oracleG.boundaryContrast(getComputedStyle(f).borderTopColor, f, f.parentElement);
        return { kind: 'invalid-seed', theme: th, ariaInvalid: f.getAttribute('aria-invalid'), ...r };
      }, theme);
      if (b) M.borders.push(b);
    }
  });

  // ---- IDLE dish-stage (intent bar + CookFlow + spine) ----
  await guard('idle', async () => {
    await gotoDish(page, base, dishId);
    await page.waitForSelector('#cc-intent', { timeout: 8000 });
    for (const theme of THEMES) {
      await setTheme(page, theme);
      await walkText(page, 'idle', theme, M);
      await ctx.judgeStill('BC-G-3', `idle-${theme}`);
      await sweep(page, 'idle', theme, M);
    }
    await measureHit(page, 'idle', null, M);
    // BC-G-13 dial track/thumb, both states × both themes.
    for (const theme of THEMES) {
      await setTheme(page, theme);
      for (const want of [true, false]) {
        await page.evaluate((w) => {
          const sw = document.querySelector('[role="switch"]');
          if (sw && (sw.getAttribute('aria-checked') === 'true') !== w) sw.click();
        }, want);
        await sleep(300);
        const rec = await page.evaluate((th, w) => {
          const sw = document.querySelector('[role="switch"]');
          if (!sw) return null;
          const G = window.__oracleG, C = window.__oracleContrast;
          const swCs = getComputedStyle(sw);
          const parentBg = G.effectiveBg(sw.parentElement || sw);
          const tb = C.parseCssColor(swCs.borderTopColor);
          const trackContrast = tb && tb[3] > 0 ? Math.round(C.contrastRatio(C.compositeOver(tb, parentBg), parentBg) * 100) / 100 : null;
          const dot = sw.querySelector('span[aria-hidden="true"]');
          const swBg = G.effectiveBg(sw);
          let thumbKind = null, thumbColor = null, thumbContrast = null;
          if (dot) {
            const dcs = getComputedStyle(dot);
            const fill = C.parseCssColor(dcs.backgroundColor);
            if (fill && fill[3] > 0) { thumbKind = 'fill'; thumbColor = dcs.backgroundColor; thumbContrast = Math.round(C.contrastRatio(C.compositeOver(fill, swBg), swBg) * 100) / 100; }
            else { const bd = C.parseCssColor(dcs.borderTopColor); thumbKind = 'border'; thumbColor = dcs.borderTopColor; if (bd && bd[3] > 0) thumbContrast = Math.round(C.contrastRatio(C.compositeOver(bd, swBg), swBg) * 100) / 100; }
          }
          return { theme: th, state: w ? 'on' : 'off', ariaChecked: sw.getAttribute('aria-checked'), trackColor: swCs.borderTopColor, trackContrast, thumbKind, thumbColor, thumbContrast };
        }, theme, want);
        if (rec) M.dial.push(rec);
      }
      // leave the dial ON.
      await page.evaluate(() => { const sw = document.querySelector('[role="switch"]'); if (sw && sw.getAttribute('aria-checked') !== 'true') sw.click(); });
    }
    await setTheme(page, 'light');
    // CookFlow tasting form open — walk + Tab-sweep in BOTH themes (M2: the
    // form's #cc-tasting-notes + Rework/Cancel controls join the sweep).
    await guard('cookflow', async () => {
      await clickButton(page, /^I cooked this/i);
      await page.waitForSelector('#cc-tasting-notes', { timeout: 4000 });
      for (const theme of THEMES) {
        await setTheme(page, theme);
        await walkText(page, 'cookflow', theme, M);
        await sweep(page, 'cookflow', theme, M);
      }
      await setTheme(page, 'light');
      await measureHit(page, 'cookflow', null, M);
      await clickButton(page, /^Cancel$/i).catch(() => {});
    });
  });

  // ---- action-error critical banner (via aborted move) ----
  await guard('action-error', async () => {
    const aid = await newDish(ctx);
    await gotoDish(page, base, aid);
    await page.waitForSelector('#cc-intent', { timeout: 8000 });
    const remove = await installFaultInjector(page, [{ method: 'POST', pathRe: MOVE_RE, action: 'abort' }]);
    try {
      await page.type('#cc-intent', 'push it somewhere new');
      await clickButton(page, /^Try it/i);
      await page.waitForSelector('[role="alert"]', { timeout: 6000 });
      for (const theme of THEMES) {
        await setTheme(page, theme);
        await walkText(page, 'action-error', theme, M);
        await sweep(page, 'action-error', theme, M); // M2: the banner's Dismiss control joins the sweep
      }
      await setTheme(page, 'light');
      await measureHit(page, 'action-error', 'div[role="alert"]', M);
    } finally { await remove(); }
  });

  // ---- GATE (fresh dish, disclosure opened for the full verb set) ----
  await guard('gate', async () => {
    const gid = await newDish(ctx);
    await driveToGate(ctx, gid);
    for (const theme of THEMES) {
      await setTheme(page, theme);
      await walkText(page, 'gate', theme, M);
      await ctx.judgeStill('BC-G-3', `gate-${theme}`);
      await sweep(page, 'gate', theme, M);
    }
    await setTheme(page, 'light');
    // Hit areas with the disclosure OPEN (all six verbs present).
    await clickButton(page, /^Try another way/i).catch(() => {});
    await page.waitForSelector('button[data-verb="take_over"]', { timeout: 4000 }).catch(() => {});
    await measureHit(page, 'gate', '[data-testid="gate-bar"]', M);
    await measureHit(page, 'gate-header', 'header', M);
    await measureHit(page, 'gate-spine', 'aside[aria-label="Development timeline"]', M);

    // ---- ALTERNATIVES picker (from the same gate) ----
    await guard('alternatives', async () => {
      await clickVerb(page, 'alternatives');
      await page.waitForSelector('[data-testid="alternatives-picker"]', { timeout: ctx.genTimeout });
      for (const theme of THEMES) {
        await setTheme(page, theme);
        await walkText(page, 'alternatives', theme, M);
        await sweep(page, 'alternatives', theme, M); // M2: both themes
      }
      await setTheme(page, 'light');
      await measureHit(page, 'alternatives', '[data-testid="alternatives-picker"]', M);
    });
  });

  // ---- OVERRIDE dialog (human-edit take_over that trips safety) ----
  await guard('override', async () => {
    const oid = await newDish(ctx);
    await driveToGate(ctx, oid);
    const d = await ctx.api('GET', `/api/dishes/${oid}`);
    const draft = JSON.parse(JSON.stringify(d.draft));
    draft.steps = [...(draft.steps || []), GARLIC_OIL_STEP];
    draft.ingredients = [...(draft.ingredients || []), GARLIC_INGREDIENT];
    await clickButton(page, /^Try another way/i);
    await page.waitForSelector('button[data-verb="take_over"]', { timeout: 4000 });
    await clickVerb(page, 'take_over');
    await page.waitForSelector('[data-testid="takeover-form"] textarea', { timeout: 4000 });
    await setValue(page, '[data-testid="takeover-form"] textarea', JSON.stringify(draft));
    await clickButton(page, /^Save draft/i);
    await page.waitForSelector('[data-testid="override-prompt"]', { timeout: ctx.genTimeout });
    // The override is a modal <dialog> (showModal): focus is trapped to its two
    // buttons, so the sweep reaches exactly them; setTheme direct-pins because
    // the header toggle is inert under the modal (M2: both themes).
    for (const theme of THEMES) {
      await setTheme(page, theme);
      await walkText(page, 'override', theme, M);
      await sweep(page, 'override', theme, M);
    }
    await setTheme(page, 'light');
    await measureHit(page, 'override', '[data-testid="override-prompt"]', M);
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(120);
  });

  // ---- SAFETY HOLD (fresh dish, garlic oil) ----
  await guard('safety-hold', async () => {
    await driveToHold(ctx);
    for (const theme of THEMES) {
      await setTheme(page, theme);
      await walkText(page, 'safety-hold', theme, M);
      await ctx.judgeStill('BC-G-3', `safety-hold-${theme}`);
      await sweep(page, 'safety-hold', theme, M);
      const b = await page.evaluate((th) => {
        const hold = document.querySelector('[data-testid="safety-hold"]');
        if (!hold) return null;
        const r = window.__oracleG.boundaryContrast(getComputedStyle(hold).borderTopColor, hold, hold.parentElement);
        return { kind: 'safety-hold', theme: th, ...r };
      }, theme);
      if (b) M.borders.push(b);
    }
    await setTheme(page, 'light');
    await measureHit(page, 'safety-hold', '[data-testid="safety-hold"]', M);
  });

  // ---- Explicit swept/skipped ledger (never a silent skip) ----
  M.notes.push('Stop control (proposing card) is a live-sim-only surface, absent in the fast g/desktop-modes profile; its hit area (BC-G-8), focus indicator (BC-G-9) and focus-ring contrast (BC-G-11) are measured in g/reduced-motion, where the proposing state persists for the ~25s latency window (stop-live sub-checks, both themes).');
  M.notes.push('move-failed-banner is the budget/SSE surface (h/budget, BC-H-4) and reconnect-banner the SSE-drop surface (h/sse-drop, BC-H-2); neither renders in the fast profile. The action-error critical banner (bg-critical-surface/text-critical) is swept here in its place for the highest-stakes text pair.');
}
