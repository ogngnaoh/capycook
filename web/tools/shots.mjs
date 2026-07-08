// Direction-A evidence capture: drives the redesigned CapyCook workbench
// (task 9's Workbench + GateBar/SafetyHold/IntentBar/CookFlow/TimelineSpine)
// headlessly in one theme and screenshots every reachable screen/state.
// Usage:
//   node tools/shots.mjs <light|dark> <outdir> [--narrow]
// Desktop pass (default): 1440x1000, the 01..10 state set.
// Narrow pass (--narrow): 390x844, the N1..N3 collapsed-layout set, with a
// per-shot horizontal-overflow report on stderr.
//
// Selectors follow the redesign's own vocabulary (src/vocab.ts) and the
// gate's data-verb attributes (src/components/GateBar.tsx /
// SafetyHold.tsx) rather than button text where both are available — text
// regexes are still needed for the handful of controls with no data-verb
// (the seed submit, "Try another way", the mode forms' Cancel/Send/Save,
// the timeline's per-trial cards). Gate/safety-hold verb buttons render a
// demoted mono keyboard-shortcut hint after their label (e.g. "Use itA"),
// so every text regex anchors with ^ only, never $.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const THEME = process.argv[2] === 'dark' ? 'dark' : 'light';
const OUT = process.argv[3] || `./shots/${THEME}`;
const NARROW = process.argv.includes('--narrow');
const BASE = process.env.CAPYCOOK_BASE || 'http://localhost:8098';
const VIEWPORT = NARROW ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}-${THEME}.png`, fullPage: false });
  console.log('saved', `${name}-${THEME}`);
};

// Click the first button whose visible text matches re. Anchor with ^ only
// (never $) — verb buttons carry a trailing aria-hidden shortcut-hint glyph
// ("Use itA") and the "Try another way ▾" disclosure carries a trailing
// glyph too.
const clickButton = (page, re) => page.evaluate((src, flags) => {
  const rx = new RegExp(src, flags);
  const btn = [...document.querySelectorAll('button')].find((b) => rx.test(b.textContent.trim()));
  if (!btn) throw new Error(`no button matching ${src}`);
  btn.click();
}, re.source, re.flags);

const waitForButton = (page, re, timeout = 20000) => page.waitForFunction((src, flags) => {
  const rx = new RegExp(src, flags);
  return [...document.querySelectorAll('button')].some((b) => rx.test(b.textContent.trim()));
}, { timeout }, re.source, re.flags);

const waitForText = (page, text, timeout = 20000) =>
  page.waitForFunction((t) => document.body.textContent.includes(t), { timeout }, text);

// Every gate verb (GateBar's decide/another rows, SafetyHold's two verbs)
// carries data-verb="<GateVerb>" — the redesign's own preferred hook, more
// robust than the demoted-hint-bearing button text.
const clickVerb = (page, verb) => page.evaluate((v) => {
  const btn = document.querySelector(`button[data-verb="${v}"]`);
  if (!btn) throw new Error(`no button[data-verb="${v}"]`);
  btn.click();
}, verb);

const waitForVerb = (page, verb, timeout = 20000) =>
  page.waitForSelector(`button[data-verb="${verb}"]`, { timeout });

// Set a React-controlled input/textarea's value through the native setter so
// the change event fires and the component state updates (used for the
// seed-error recovery and the take-over JSON injection).
const setValue = (page, selector, value) => page.evaluate((sel, val) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`no field ${sel}`);
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, selector, value);

// Fill the seed intake form: the free-text seed, two Big-9 allergen chips
// (now plain toggle buttons, not checkbox labels), and the three
// comma-separated free-list inputs (matched by placeholder — SeedSetup.tsx
// no longer types them, so position isn't a stable anchor).
async function fillSeed(page) {
  await page.type('#field-seed', 'a cozy one-pan roast chicken dinner with root vegetables');
  for (const allergen of ['peanuts', 'crustacean shellfish']) {
    await page.evaluate((a) => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === a);
      if (!btn) throw new Error(`no allergen chip ${a}`);
      btn.click();
    }, allergen);
  }
  await page.type('input[placeholder="vegetarian, low sodium"]', 'low sodium');
  await page.type('input[placeholder="cast iron, oven"]', 'cast iron, oven');
  await page.type('input[placeholder="thyme, lemons"]', 'thyme, lemons');
}

// The garlic-oil-in-oil infusion: technique infuse_oil + a 'garlic' pattern
// trips the anaerobic-garlic-oil critical rule (data/safety/
// anaerobic_lexicon.csv) — the seeded unsafe case the LLM stub and the real
// safety gate both key on (internal/llm/stub.go addGarlicOil).
const GARLIC_OIL_STEP = {
  text: 'Crush the garlic cloves, submerge them in olive oil, and leave the jar at room temperature for two days to infuse.',
  technique: 'infuse_oil', internal_temp_c: null,
  why: 'slow room-temperature infusion carries the garlic through the oil',
};
const GARLIC_INGREDIENT = { name: 'garlic', fdc_id: null, foodon_id: null, qty: 4, unit: 'clove' };

// Wait for a REAL (committed) trial card in the timeline spine — never the
// synthetic pending-decision node, which TimelineSpine renders as a <div>,
// not a <button> (only committed trials are buttons). This matters because
// CookFlow's collapsed prompt renders a "Trial N" label from the very first
// idle render, before any move ever runs (its currentLabel falls back to
// "Trial 1" when there is no current version yet) — a bare waitForText
// would resolve immediately on a false positive.
const waitForTimelineTrial = (page, n, timeout = 20000) => page.waitForFunction((num) => {
  const aside = document.querySelector('aside[aria-label="Development timeline"]');
  if (!aside) return false;
  return [...aside.querySelectorAll('button')].some((b) => b.textContent.trim().startsWith(`Trial ${num}`));
}, { timeout }, n);

// Click a committed trial's card (by 1-based trial number) to view it as a
// read-only snapshot.
const clickTimelineTrial = (page, n) => page.evaluate((num) => {
  const aside = document.querySelector('aside[aria-label="Development timeline"]');
  const btn = aside && [...aside.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(`Trial ${num}`));
  if (!btn) throw new Error(`no Trial ${num} card`);
  btn.click();
}, n);

// measure reports horizontal overflow for the narrow pass: the page vs the
// viewport, the stage region, and any element inside the dish card/stage
// that scrolls wider than it renders.
const measure = (page) => page.evaluate(() => {
  const iw = window.innerWidth;
  const doc = document.documentElement;
  const canvas = document.querySelector('#stage');
  const pane = document.querySelector('[data-testid="dish-card"]');
  const scope = pane || canvas || document.body;
  const over = [];
  scope.querySelectorAll('*').forEach((el) => {
    if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) {
      over.push({
        tag: el.tagName.toLowerCase(),
        testid: el.getAttribute('data-testid') || null,
        cls: (el.className || '').toString().slice(0, 40),
        clientW: el.clientWidth, scrollW: el.scrollWidth,
        text: (el.textContent || '').trim().slice(0, 40),
      });
    }
  });
  // Whole-document offenders: the innermost elements whose right edge crosses
  // the viewport — the actual cause of any page-level horizontal scroll.
  const offenders = [];
  document.body.querySelectorAll('*').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.right > iw + 1 && r.width > 0 && !el.querySelector(':scope > *')) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        testid: el.getAttribute('data-testid') || null,
        right: Math.round(r.right),
        text: (el.textContent || '').trim().slice(0, 45),
      });
    }
  });
  offenders.sort((a, b) => b.right - a.right);
  return {
    innerWidth: iw,
    docScrollWidth: doc.scrollWidth,
    docOverflow: doc.scrollWidth > iw,
    canvasScrollWidth: canvas ? canvas.scrollWidth : null,
    canvasOverflow: canvas ? canvas.scrollWidth > canvas.clientWidth + 1 : null,
    overflowElements: over.slice(0, 6),
    docOffenders: offenders.slice(0, 6),
  };
});

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-first-run', `--window-size=${VIEWPORT.width},${VIEWPORT.height}`],
});
const page = await browser.newPage();
await page.setViewport(VIEWPORT);
// Pin the theme before the app boots (theme.ts reads localStorage on boot).
await page.evaluateOnNewDocument((t) => localStorage.setItem('capycook-theme', t), THEME);

const measures = [];
async function reportMeasure(page, name) {
  const m = await measure(page);
  measures.push({ name, ...m });
  console.log(`overflow ${name}-${THEME}: doc ${m.docScrollWidth}/${m.innerWidth}${m.docOverflow ? ' OVERFLOW' : ' ok'}` +
    `, stage ${m.canvasScrollWidth ?? '-'}${m.canvasOverflow ? ' OVERFLOW' : ' ok'}` +
    (m.overflowElements.length ? `, inner-overflow x${m.overflowElements.length}` : ''));
}

try {
  if (NARROW) {
    await runNarrow(page);
    console.log('MEASURES', JSON.stringify(measures));
  } else {
    await runDesktop(page);
  }
} catch (err) {
  await page.screenshot({ path: `${OUT}/ZZ-failure-${THEME}.png` });
  console.error('FAILED:', err.message);
  console.error('PAGE TEXT:\n' + await page.evaluate(() => document.body.innerText.slice(0, 2500)));
  await browser.close();
  process.exit(1);
}
await browser.close();
console.log('done', THEME, NARROW ? 'narrow' : 'desktop');

// ---------------------------------------------------------------- desktop ---
async function runDesktop(page) {
  // --- 01 seed intake (filled, clean) ---
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await fillSeed(page);
  await shot(page, '01-intake');

  // --- 01b seed errors: blank the seed, submit (GOV.UK error summary) ---
  // Servings stays at its valid default: the number input's native min=1/
  // step=1 constraint would otherwise block the native form submission
  // before the app's own validateSeedForm ever ran (confirmed empirically —
  // an out-of-range value silently swallows the click, no submit event).
  await setValue(page, '#field-seed', '');
  await clickButton(page, /^Develop this dish/i);
  await waitForText(page, 'There is a problem');
  await sleep(150);
  await shot(page, '01b-intake-errors');

  // Recover and continue into the workbench.
  await setValue(page, '#field-seed', 'a cozy one-pan roast chicken dinner with root vegetables');
  await clickButton(page, /^Develop this dish/i);
  await page.waitForFunction(() => location.pathname.startsWith('/dishes/'), { timeout: 8000 });
  await page.waitForSelector('#cc-intent', { timeout: 8000 });

  // --- 03 first proposal (seed_expand, since no version exists yet) ---
  // Best-effort: against the stub LLM the whole move (generate + safety
  // screen + commit) resolves server-side in ~2-5ms — confirmed by direct
  // API polling — so the client's own follow-up GET almost always already
  // observes 'awaiting_gate' before 'proposing' ever paints. Try a short
  // window; if it never appears, skip this one shot and say so on stderr
  // rather than fake it (the rest of the walk is unaffected).
  await page.type('#cc-intent', 'make it richer and more herb-forward');
  await clickButton(page, /^Try it/i);
  try {
    await page.waitForSelector('[data-testid="proposing-card"]', { timeout: 400 });
    await sleep(80); // mid-stream: partial rationale + blinking caret visible
    await shot(page, '03-proposing');
  } catch {
    console.error('SKIPPED 03-proposing: the stub resolves the move before the '
      + 'proposing state is ever observable client-side (server-side timing, '
      + 'not a selector bug) — see task-10-capture-report.md');
  }

  // --- 04 gate on the dish (diff visible on the dish card) ---
  await waitForVerb(page, 'accept', 20000);
  await sleep(250);
  await shot(page, '04-gate-on-dish');

  // --- 04b "Try another way" disclosure open (then back) ---
  await clickButton(page, /^Try another way/i);
  await sleep(180);
  await shot(page, '04b-gate-another-open');
  await clickButton(page, /^← Back$/);
  await sleep(120);

  // --- 04c tweak-it form (then cancel) ---
  await clickVerb(page, 'edit');
  await page.waitForSelector('[data-testid="tweak-form"]', { timeout: 5000 });
  await sleep(150);
  await shot(page, '04c-gate-tweak');
  await clickButton(page, /^Cancel$/i);
  await sleep(120);

  // --- 05 technical view on at the gate (then back off — persisted pref) ---
  await clickButton(page, /^Technical view$/i);
  await sleep(150);
  await shot(page, '05-technical-view');
  await clickButton(page, /^Technical view$/i);
  await sleep(100);

  // --- accept -> Trial 1 ---
  await clickVerb(page, 'accept');
  await waitForTimelineTrial(page, 1);
  await sleep(250);

  // --- 02 idle fiche (with detail panels) ---
  await shot(page, '02-idle-fiche');

  // --- 10 cook-tasting form open (then cancel — don't submit) ---
  await clickButton(page, /^I cooked this/i);
  await page.waitForSelector('#cc-tasting-notes', { timeout: 5000 });
  await page.type('#cc-tasting-notes', 'carrots needed ten more minutes and the sauce was thin — thicken it');
  await sleep(150);
  await shot(page, '10-cook-tasting');
  await clickButton(page, /^Cancel$/i);
  await sleep(120);

  // --- 06 alternatives comparison, pick one -> accept -> Trial 2 ---
  await page.type('#cc-intent', 'make it lighter, less oil');
  await clickButton(page, /^Try it/i);
  await waitForVerb(page, 'accept', 20000);
  await clickButton(page, /^Try another way/i);
  await clickVerb(page, 'alternatives');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="alt-card"]').length >= 2, { timeout: 25000 });
  await sleep(250);
  await shot(page, '06-alternatives');
  await page.evaluate(() => document.querySelectorAll('[data-testid="alt-card"]')[0].click());
  await sleep(200);
  await clickVerb(page, 'accept');
  await waitForTimelineTrial(page, 2);
  await sleep(200);

  // --- 07 safety hold: garlic-oil steer, then recover via "ask for a safer
  //     change" -> accept -> Trial 3 ---
  await page.type('#cc-intent', 'infuse some garlic oil for richness');
  await clickButton(page, /^Try it/i);
  await waitForText(page, 'Safety hold');
  await sleep(200);
  await shot(page, '07-safety-hold');
  await clickVerb(page, 'redirect');
  await page.waitForSelector('#safety-hold-steer', { timeout: 5000 });
  await page.type('#safety-hold-steer', 'use a lemon-herb pan sauce instead');
  await clickButton(page, /^Send$/i);
  await waitForVerb(page, 'accept', 20000);
  await clickVerb(page, 'accept');
  await waitForTimelineTrial(page, 3);
  await sleep(200);

  // --- 08 override modal: take-over with an injected garlic-oil step,
  //     Save draft -> warn-and-confirm; back out and accept the original
  //     (safe) proposal instead -> Trial 4 ---
  await page.type('#cc-intent', 'make it more herby');
  await clickButton(page, /^Try it/i);
  await waitForVerb(page, 'accept', 20000);
  await clickButton(page, /^Try another way/i);
  await clickVerb(page, 'take_over');
  await page.waitForSelector('[data-testid="takeover-form"] textarea', { timeout: 5000 });
  await page.evaluate((step, ing) => {
    const ta = document.querySelector('[data-testid="takeover-form"] textarea');
    const d = JSON.parse(ta.value);
    d.ingredients = [...(d.ingredients ?? []), ing];
    d.steps = [...(d.steps ?? []), step];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, JSON.stringify(d, null, 2));
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, GARLIC_OIL_STEP, GARLIC_INGREDIENT);
  await clickButton(page, /^Save draft$/i);
  await page.waitForSelector('[data-testid="override-prompt"]', { timeout: 5000 });
  await sleep(200);
  await shot(page, '08-override-modal');
  // Dismiss the modal. GateBar's own dispatch() already resolved take_over's
  // promise (runGate swallows the 409 into the override state rather than
  // throwing) and reset itself to 'decide' the moment the 409 landed — so by
  // now the bar is already back on the original safe proposal, no takeover
  // form left to cancel.
  await clickButton(page, /^Go back/i);
  await sleep(120);
  await clickVerb(page, 'accept');        // accept the original safe proposal
  await waitForTimelineTrial(page, 4);
  await sleep(200);

  // --- 09 read-only snapshot of Trial 1 + its Promote-to-trunk control ---
  await clickTimelineTrial(page, 1);
  await waitForText(page, 'Viewing a past trial');
  await sleep(250);
  await shot(page, '09-snapshot-promote');
  await clickButton(page, /^Back to current$/i);
  await sleep(120);
}

// ----------------------------------------------------------------- narrow ---
async function runNarrow(page) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await page.type('#field-seed', 'a cozy one-pan roast chicken dinner with root vegetables');
  await clickButton(page, /^Develop this dish/i);
  await page.waitForFunction(() => location.pathname.startsWith('/dishes/'), { timeout: 8000 });
  await page.waitForSelector('#cc-intent', { timeout: 8000 });

  // --- N1 gate on a narrow viewport (sticky bottom bar + dish card) ---
  await page.type('#cc-intent', 'make it heartier');
  await clickButton(page, /^Try it/i);
  await waitForVerb(page, 'accept', 20000);
  await sleep(250);
  await shot(page, 'N1-gate');
  await reportMeasure(page, 'N1-gate');

  // --- N2 idle fiche on a narrow viewport ---
  await clickVerb(page, 'accept');
  await waitForTimelineTrial(page, 1);
  await sleep(250);
  await shot(page, 'N2-idle');
  await reportMeasure(page, 'N2-idle');

  // --- N3 timeline spine: at <1024px it reflows beneath the stage
  //     (index.css .wb-grid), so scroll it into view. ---
  await page.evaluate(() => {
    document.querySelector('aside[aria-label="Development timeline"]')?.scrollIntoView();
  });
  await sleep(200);
  await shot(page, 'N3-timeline');
  await reportMeasure(page, 'N3-timeline');
}
