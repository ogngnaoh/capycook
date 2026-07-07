// Gate-C evidence capture: drives the redesigned CapyCook loop headlessly in
// one theme and screenshots every reachable screen/state. Usage:
//   node tools/shots.mjs <light|dark> <outdir> [--narrow]
// Desktop pass (default): 1440x1000, the 01..19 state set.
// Narrow pass (--narrow): 390x844, the N1..N5 collapsed-IA set, with a
// per-shot horizontal-overflow report on stderr.
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

// Click the first button whose visible text matches re. Callers anchor with
// ^ where the label is a prefix of a richer textContent (e.g. the redirect
// verb renders "Ask for changes" + a demoted mono "redirect").
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

// Set a React-controlled textarea's value through the native setter so the
// change event fires and the component state updates (used for the take-over
// JSON injection).
const setTextarea = (page, selector, value) => page.evaluate((sel, val) => {
  const ta = document.querySelector(sel);
  if (!ta) throw new Error(`no textarea ${sel}`);
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  setter.call(ta, val);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}, selector, value);

// Ensure the autonomy dial is ON so a deterministic move auto-applies
// (state 19). The header switch spells its state out ("… : on" / "… : off").
async function ensureDialOn(page) {
  const isOff = await page.evaluate(() =>
    [...document.querySelectorAll('button[role="switch"]')].some((b) => /:\s*off/i.test(b.textContent)));
  if (isOff) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button[role="switch"]')].find((x) => /:\s*off/i.test(x.textContent));
      b?.click();
    });
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button[role="switch"]')].some((b) => /:\s*on/i.test(b.textContent)), { timeout: 5000 });
  }
}

// Ensure the autonomy dial is OFF so any move (even a deterministic one)
// pends at the gate instead of auto-applying.
async function ensureDialOff(page) {
  const isOn = await page.evaluate(() =>
    [...document.querySelectorAll('button[role="switch"]')].some((b) => /:\s*on/i.test(b.textContent)));
  if (isOn) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button[role="switch"]')].find((x) => /:\s*on/i.test(x.textContent));
      b?.click();
    });
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button[role="switch"]')].some((b) => /:\s*off/i.test(b.textContent)), { timeout: 5000 });
  }
}

// Fill the seed intake form (used by the desktop 01 and the narrow N5 shots).
async function fillSeed(page) {
  await page.type('textarea', 'a cozy one-pan roast chicken dinner with root vegetables');
  for (const allergen of ['peanuts', 'crustacean shellfish']) {
    await page.evaluate((a) => {
      const label = [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === a);
      if (!label) throw new Error(`no allergen chip ${a}`);
      label.click();
    }, allergen);
  }
  const textInputs = await page.$$('input:not([type="checkbox"]):not([type="number"])');
  await textInputs[0].type('low sodium');       // dietary
  await textInputs[1].type('cast iron, oven');  // equipment
  await textInputs[2].type('thyme, lemons');    // on hand
}

// The garlic-oil-in-oil infusion step: technique infuse_oil + a 'garlic'
// pattern trips the anaerobic-garlic-oil critical rule (data/safety/
// anaerobic_lexicon.csv), the same trigger the old evidence run used.
const GARLIC_OIL_STEP = {
  text: 'Infuse the garlic oil: submerge crushed garlic in olive oil and hold at room temperature for two days.',
  technique: 'infuse_oil', internal_temp_c: null, why: 'slow room-temperature infusion',
};
const GARLIC_INGREDIENT = { name: 'garlic', fdc_id: null, foodon_id: null, qty: 4, unit: 'clove' };

// measure reports horizontal overflow for the narrow pass: the page vs the
// viewport, the canvas region, and any element inside the canvas/draft that
// scrolls wider than it renders (the step-chip-row check).
const measure = (page) => page.evaluate(() => {
  const iw = window.innerWidth;
  const doc = document.documentElement;
  const canvas = document.querySelector('#canvas-region');
  const pane = document.querySelector('[data-testid="draft-pane"], [data-testid="proposed-draft"]');
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
    `, canvas ${m.canvasScrollWidth ?? '-'}${m.canvasOverflow ? ' OVERFLOW' : ' ok'}` +
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
  await shot(page, '01-seed-intake');

  // --- 01b seed errors: empty the seed, submit, GOV.UK summary ---
  await setTextarea(page, '#field-seed', '');
  await clickButton(page, /^start dish$/i);
  await waitForText(page, 'There is a problem');
  await sleep(150);
  await shot(page, '01b-seed-errors');

  // Refill and continue into the workbench.
  await page.type('#field-seed', 'a cozy one-pan roast chicken dinner with root vegetables');
  await clickButton(page, /^start dish$/i);
  await page.waitForFunction(() => location.pathname.startsWith('/dishes/'), { timeout: 8000 });

  // --- 02 workbench, empty draft ---
  await waitForText(page, 'bench is clear');
  await sleep(250);
  await shot(page, '02-workbench-empty');

  // --- 03 first proposal at the pass: proposal-as-recipe canvas ---
  await clickButton(page, /^propose a move$/i);
  await waitForButton(page, /^accept$/i);
  await sleep(300);
  await shot(page, '03-pass-proposal-canvas');

  // --- 03b technical view on (then back off — persisted pref) ---
  await clickButton(page, /^technical view$/i);
  await sleep(200);
  await shot(page, '03b-technical-view-on');
  await clickButton(page, /^technical view$/i);
  await sleep(100);

  // --- 03c More ▾ open (then close) ---
  await clickButton(page, /^more/i);
  await sleep(200);
  await shot(page, '03c-gate-more-open');
  await clickButton(page, /^more/i);
  await sleep(100);

  // --- 04 edit form (More → Edit; Cancel after) ---
  await clickButton(page, /^more/i);
  await clickButton(page, /^edit$/i);
  await page.waitForSelector('[data-testid="edit-form"]');
  await sleep(200);
  await shot(page, '04-edit-form');
  await clickButton(page, /^cancel$/i);
  await sleep(100);

  // --- 05 take-over form (More → Take over; left open for 06) ---
  await clickButton(page, /^more/i);
  await clickButton(page, /^take over$/i);
  await page.waitForSelector('[data-testid="take-over-form"]');
  await sleep(200);
  await shot(page, '05-take-over-form');

  // --- 06 override prompt: inject a garlic-oil step, Save draft -> warn ---
  await page.evaluate((step, ing) => {
    const ta = document.querySelector('[data-testid="take-over-form"] textarea');
    const draft = JSON.parse(ta.value);
    draft.ingredients = [...(draft.ingredients ?? []), ing];
    draft.steps = [...(draft.steps ?? []), step];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, JSON.stringify(draft, null, 2));
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }, GARLIC_OIL_STEP, GARLIC_INGREDIENT);
  await clickButton(page, /^save draft$/i);
  await page.waitForSelector('[data-testid="override-prompt"]');
  await sleep(200);
  await shot(page, '06-override-prompt');
  await clickButton(page, /^back$/i);   // dismiss the dialog (and the panel)
  await sleep(150);

  // --- 07 accept -> Trial 1: idle fiche with the trial strip ---
  await clickButton(page, /^accept$/i);
  await waitForText(page, 'Trial 1');
  await sleep(300);
  await shot(page, '07-accepted-idle-fiche');

  // --- 07b dashboard expanded (then collapse) ---
  await page.evaluate(() => document.querySelector('[data-testid="dashboard-line"]')?.closest('button')?.click());
  await page.waitForSelector('[data-testid="analysis-detail"]:not([hidden])');
  await sleep(200);
  await shot(page, '07b-dashboard-expanded');
  await page.evaluate(() => document.querySelector('[data-testid="dashboard-line"]')?.closest('button')?.click());
  await sleep(100);

  // --- 08 alternatives comparison (steer, propose, More -> Alternatives) ---
  await page.type('[data-testid="steering-pane"] textarea', 'brighter — add citrus somewhere');
  await clickButton(page, /^propose a move$/i);
  await waitForButton(page, /^accept$/i);
  await clickButton(page, /^more/i);
  await clickButton(page, /^alternatives$/i);
  await page.waitForFunction(() => document.querySelectorAll('[role="radio"]').length >= 2, { timeout: 25000 });
  await sleep(300);
  await shot(page, '08-alternatives-comparison');

  // --- 09 safety hold: accept the alternative, then a garlic-oil steer ---
  await clickButton(page, /^accept$/i);
  await waitForText(page, 'Trial 2');
  await page.type('[data-testid="steering-pane"] textarea', 'infuse some garlic oil for richness');
  await clickButton(page, /^propose a move$/i);
  await waitForText(page, 'Safety hold');
  await sleep(300);
  await shot(page, '09-safety-hold-evidence');

  // --- 10 ask for changes while blocked (form open, then Send) ---
  await clickButton(page, /^ask for changes/i);
  await page.waitForSelector('[data-testid="redirect-form"]');
  await sleep(200);
  await shot(page, '10-ask-for-changes-blocked');
  await page.type('[data-testid="redirect-form"] textarea', 'use a lemon-herb pan sauce instead');
  await clickButton(page, /^send$/i);

  // --- 11 recovered proposal at the pass, then accept -> Trial 3 ---
  await waitForButton(page, /^accept$/i, 25000);
  await sleep(300);
  await shot(page, '11-recovered-pass');
  await clickButton(page, /^accept$/i);
  await waitForText(page, 'Trial 3');
  await sleep(200);

  // --- 12 Trials expansion (full history), then collapse ---
  await clickButton(page, /^trials/i);
  await waitForText(page, 'Promote');
  await sleep(200);
  await shot(page, '12-trials-expanded');
  await clickButton(page, /^trials/i);
  await sleep(150);

  // --- 13 read-only snapshot of Trial 1, then back ---
  await page.evaluate(() => {
    const strip = document.querySelector('[data-testid="trial-strip"]');
    const pill = strip.querySelector('ol li button');   // first pill = Trial 1
    pill.click();
  });
  await waitForText(page, 'read-only snapshot');
  await sleep(250);
  await shot(page, '13-snapshot');
  await clickButton(page, /^back to current draft$/i);
  await sleep(150);

  // --- 14 promote a non-current trial (expand Trials first) ---
  await clickButton(page, /^trials/i);
  await page.waitForSelector('[data-testid="version-history"]');
  await page.evaluate(() => {
    // Promote the first non-current trial in the history list.
    const btn = [...document.querySelectorAll('[data-testid="version-history"] button')]
      .find((b) => b.textContent.trim() === 'Promote');
    if (!btn) throw new Error('no Promote button');
    btn.click();
  });
  await waitForText(page, 'promoted to service');
  await sleep(300);
  await shot(page, '14-promoted');
  await clickButton(page, /^trials/i); // collapse
  await sleep(150);

  // --- 15 tasting notes on the current pill ---
  await clickButton(page, /^i cooked this$/i);
  await page.waitForSelector('[data-testid="cook-feedback-form"]');
  await waitForText(page, 'Tasting notes');
  await page.type('[data-testid="cook-feedback-form"] textarea',
    'carrots needed ten more minutes and the sauce was thin — thicken it');
  await sleep(200);
  await shot(page, '15-tasting-notes');

  // --- 16 post-cook rework proposal at the pass, then accept ---
  await clickButton(page, /^propose a rework$/i);
  await waitForButton(page, /^accept$/i, 25000);
  await sleep(300);
  await shot(page, '16-postcook-proposal');
  await clickButton(page, /^accept$/i);
  await waitForText(page, 'Bench ready');
  await sleep(250);

  // --- 17 dial ON -> deterministic move auto-applies (collapsed entry) ---
  await ensureDialOn(page);
  await page.select('[data-testid="steering-pane"] select', 'scale_servings');
  await clickButton(page, /^propose a move$/i);
  await page.waitForSelector('[data-testid="auto-advanced"]', { timeout: 15000 });
  await page.evaluate(() => document.querySelector('[data-testid="auto-advanced"]').setAttribute('open', ''));
  await sleep(300);
  await shot(page, '17-dial-auto-applied');

  // --- 18 skip link: first Tab from the top reveals the skip-to-gate link ---
  // A literal reload can't be used: the static handler 301-loops on any
  // /dishes/:id deep-link (SPA fallback rewrites to /index.html, which
  // http.FileServer redirects back to /). So reset focus to the top of the
  // document instead — the same thing the shot proves: the skip link is the
  // first tab stop and reveals on focus.
  await page.evaluate(() => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
  });
  await page.keyboard.press('Tab');
  await sleep(200);
  await shot(page, '18-skip-link');

  // --- 19 focus the gate toolbar at the pass (focus-visible ring) ---
  // State 17 left the dial ON and the move-type on scale_servings; both would
  // make this move auto-apply past the gate. Dial off + auto move type so the
  // proposal reliably lands at the pass.
  await ensureDialOff(page);
  await page.select('[data-testid="steering-pane"] select', '');
  await clickButton(page, /^propose a move$/i);
  await waitForButton(page, /^accept$/i);
  await sleep(300);
  // Tab until focus lands inside the gate bar toolbar (keyboard focus, so
  // :focus-visible paints the ring). The toolbar is one tab stop (roving).
  let inGate = false;
  for (let i = 0; i < 25 && !inGate; i++) {
    await page.keyboard.press('Tab');
    inGate = await page.evaluate(() =>
      !!document.activeElement?.closest('[data-testid="gate-bar"]'));
  }
  if (!inGate) throw new Error('never reached the gate bar via Tab');
  // Roving-tabindex: ArrowRight moves focus off the filled ACCEPT primary onto
  // the ghost "Ask for changes" button, where the 2px terracotta focus ring
  // reads clearly against the transparent fill.
  await page.keyboard.press('ArrowRight');
  await sleep(200);
  await shot(page, '19-focus-gate');
}

// ----------------------------------------------------------------- narrow ---
async function runNarrow(page) {
  // --- N5 seed intake (390px) ---
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
  await fillSeed(page);
  await shot(page, 'N5-seed-intake');
  await reportMeasure(page, 'N5-seed-intake');

  await clickButton(page, /^start dish$/i);
  await page.waitForFunction(() => location.pathname.startsWith('/dishes/'), { timeout: 8000 });
  await waitForText(page, 'bench is clear');

  // Propose from the Develop tab (steering pane is hidden unless Develop is
  // the active narrow tab), then the pending proposal auto-switches to Recipe.
  await selectTab(page, 'develop');
  await clickButton(page, /^propose a move$/i);
  await waitForButton(page, /^accept$/i);
  await sleep(400);

  // --- N1 recipe tab at the pass ---
  await selectTab(page, 'recipe');
  await sleep(200);
  await shot(page, 'N1-recipe-tab');
  await reportMeasure(page, 'N1-recipe-tab');

  // --- N2 develop tab (steering thread + move form) ---
  await selectTab(page, 'develop');
  await sleep(200);
  await shot(page, 'N2-develop-tab');
  await reportMeasure(page, 'N2-develop-tab');

  // Accept -> Trial 1 so the History tab has a record to show.
  await clickButton(page, /^accept$/i);
  await waitForText(page, 'Trial 1');
  await sleep(300);

  // --- N3 history tab (trial record) ---
  await selectTab(page, 'history');
  await sleep(200);
  await shot(page, 'N3-history-tab');
  await reportMeasure(page, 'N3-history-tab');

  // --- N4 safety hold: garlic-oil steer -> auto-switch to Recipe ---
  await selectTab(page, 'develop');
  await page.type('[data-testid="steering-pane"] textarea', 'infuse some garlic oil for richness');
  await clickButton(page, /^propose a move$/i);
  await waitForText(page, 'Safety hold');
  await sleep(400);
  await shot(page, 'N4-safety-hold');
  await reportMeasure(page, 'N4-safety-hold');
}

// selectTab clicks a narrow RailTabs tab by id. A function declaration (not a
// const arrow) so it is hoisted above runNarrow's calls.
function selectTab(page, id) {
  return page.evaluate((tabId) => {
    const tab = document.querySelector(`#rail-tab-${tabId}`);
    if (!tab) throw new Error(`no rail tab ${tabId}`);
    tab.click();
  }, id);
}
