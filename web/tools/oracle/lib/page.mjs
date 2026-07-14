// Selector vocabulary — adapted from tools/shots.mjs / tools/demo.mjs, the
// proven drivers of the redesigned UI, and mirrored in the contract's
// informative appendix. Rules that carry over: anchor button-text regexes
// with ^ only (never $ — verb buttons carry a trailing aria-hidden shortcut
// glyph); prefer data-verb for gate/hold verbs; committed timeline trials are
// <button>s while the synthetic pending node is a <div> (a bare text wait
// false-positives on CookFlow's collapsed "Trial N" label).
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const clickButton = (page, re) => page.evaluate((src, flags) => {
  const rx = new RegExp(src, flags);
  const btn = [...document.querySelectorAll('button')].find((b) => rx.test(b.textContent.trim()));
  if (!btn) throw new Error(`no button matching ${src}`);
  btn.click();
}, re.source, re.flags);

export const waitForButton = (page, re, timeout = 20000) => page.waitForFunction((src, flags) => {
  const rx = new RegExp(src, flags);
  return [...document.querySelectorAll('button')].some((b) => rx.test(b.textContent.trim()));
}, { timeout }, re.source, re.flags);

export const waitForText = (page, text, timeout = 20000) =>
  page.waitForFunction((t) => document.body.textContent.includes(t), { timeout }, text);

export const clickVerb = (page, verb) => page.evaluate((v) => {
  const btn = document.querySelector(`button[data-verb="${v}"]`);
  if (!btn) throw new Error(`no button[data-verb="${v}"]`);
  btn.click();
}, verb);

export const waitForVerb = (page, verb, timeout = 20000) =>
  page.waitForSelector(`button[data-verb="${verb}"]`, { timeout });

// Set a React-controlled input/textarea through the native setter so the
// input event fires and component state updates.
export const setValue = (page, selector, value) => page.evaluate((sel, val) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`no field ${sel}`);
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, val);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, selector, value);

export const SEED_TEXT = 'a cozy one-pan roast chicken dinner with root vegetables';

// Fill the seed intake form. Allergen chips are plain toggle buttons; the
// three free-list inputs are placeholder-anchored (SeedSetup no longer types
// them, so position isn't a stable anchor).
export async function fillSeed(page, { seed = SEED_TEXT, allergens = ['peanuts', 'crustacean shellfish'] } = {}) {
  await page.type('#field-seed', seed);
  for (const allergen of allergens) {
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

export const waitForTimelineTrial = (page, n, timeout = 20000) => page.waitForFunction((num) => {
  const aside = document.querySelector('aside[aria-label="Development timeline"]');
  if (!aside) return false;
  return [...aside.querySelectorAll('button')].some((b) => b.textContent.trim().startsWith(`Trial ${num}`));
}, { timeout }, n);

export const clickTimelineTrial = (page, n) => page.evaluate((num) => {
  const aside = document.querySelector('aside[aria-label="Development timeline"]');
  const btn = aside && [...aside.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(`Trial ${num}`));
  if (!btn) throw new Error(`no Trial ${num} card`);
  btn.click();
}, n);

export const timelineTrialCount = (page) => page.evaluate(() => {
  const aside = document.querySelector('aside[aria-label="Development timeline"]');
  if (!aside) return 0;
  return [...aside.querySelectorAll('button')].filter((b) => /^Trial \d+/.test(b.textContent.trim())).length;
});

// The seeded unsafe fixtures both the LLM stub and the real safety gate key
// on (data/safety/anaerobic_lexicon.csv; internal/llm/stub.go addGarlicOil) —
// used by the human-edit override path (BC-C-8/C-27/C-28).
export const GARLIC_OIL_STEP = {
  text: 'Crush the garlic cloves, submerge them in olive oil, and leave the jar at room temperature for two days to infuse.',
  technique: 'infuse_oil', internal_temp_c: null,
  why: 'slow room-temperature infusion carries the garlic through the oil',
};
export const GARLIC_INGREDIENT = { name: 'garlic', fdc_id: null, foodon_id: null, qty: 4, unit: 'clove' };

// Describe document.activeElement in serializable form — the vocabulary every
// focus assertion in the contract uses (attached? body? Stop?).
export const describeActiveElement = (page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return { none: true };
  return {
    tag: el.tagName ? el.tagName.toLowerCase() : null,
    id: el.id || null,
    testid: el.getAttribute ? el.getAttribute('data-testid') : null,
    verb: el.getAttribute ? el.getAttribute('data-verb') : null,
    text: (el.textContent || '').trim().slice(0, 60),
    isBody: el === document.body,
    isConnected: el.isConnected,
    isStop: !!(el.tagName === 'BUTTON' && /^Stop/.test((el.textContent || '').trim())),
  };
});

// Horizontal-overflow report for the narrow/reflow criteria (BC-G-5/G-12) —
// carried over from tools/shots.mjs `measure`.
export const measureOverflow = (page) => page.evaluate(() => {
  const iw = window.innerWidth;
  const doc = document.documentElement;
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
  return { innerWidth: iw, docScrollWidth: doc.scrollWidth, docOverflow: doc.scrollWidth > iw, offenders: offenders.slice(0, 8) };
});
