// Area A — intake & first pass. THE PATTERN-SETTER: every other area's
// scenario file copies the shapes here. The contract
// (docs/02b-behavior-contract/contract.md) is the only normative text; each
// ctx.check() transcribes one criterion's recipe.
//
// Conventions established here:
//  - Bounded waits everywhere; a state that never arrives is an assert FAIL
//    (observed 'never'), not a hang. Generation-seam waits use ctx.genTimeout.
//  - Timing thresholds are measured from renderer-side performance.now()
//    stamps (ctx.armMoment / ctx.readInstrument), never node clocks.
//  - "exactly one POST" counts come from ctx.net (per-page NetLog), never
//    server history: API pre-seeding pollutes the server's ledger.
//  - Double-fire races dispatch synchronously inside ONE page.evaluate — an
//    awaited round-trip between the two dispatches would miss the window.
//  - Sub-checks of one criterion spread across scenarios use the same id
//    with a distinct name; the report ANDs them.
import {
  sleep, clickButton, waitForText, clickVerb, waitForVerb, setValue, fillSeed,
  waitForTimelineTrial, timelineTrialCount, describeActiveElement, SEED_TEXT,
} from '../lib/page.mjs';
import { seedTrials, waitForPending, CONSTRAINTS } from '../lib/api.mjs';
import { installFaultInjector } from '../lib/net.mjs';

const MOVE_RE = /^\/api\/dishes\/[^/]+\/move$/;
const CREATE_RE = /^\/api\/dishes$/;

// House label strings (web/src/vocab.ts MOVE_LABEL) — chips render these.
const MOVE_LABEL = {
  seed_expand: 'First draft', flavor_direction: 'Flavor direction',
  ingredient_change: 'Ingredient change', technique_step: 'Technique step',
  iterate_feedback: 'Rework from tasting notes', scale_servings: 'Scale servings',
  unit_convert: 'Convert units', cost_recompute: 'Recompute cost',
  nutrition_recompute: 'Recompute nutrition',
};

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

// Visible validation feedback near a field: role=alert with text, or an
// aria-describedby'd visible message (BC-A-4 / BC-A-9 accept either form).
const validationFeedback = (page, fieldSel) => page.evaluate((sel) => {
  const visible = (el) => !!el && el.offsetParent !== null && (el.textContent || '').trim().length > 0;
  const alerts = [...document.querySelectorAll('[role="alert"]')].filter(visible);
  const field = document.querySelector(sel);
  let described = null;
  if (field) {
    const ref = field.getAttribute('aria-describedby');
    if (ref) described = ref.split(/\s+/).map((id) => document.getElementById(id)).find(visible) || null;
  }
  return {
    alertTexts: alerts.map((a) => a.textContent.trim().slice(0, 120)),
    describedText: described ? described.textContent.trim().slice(0, 120) : null,
    fieldFocused: field ? document.activeElement === field : false,
  };
}, fieldSel);

export const scenarios = [

  // ---------------------------------------------------------------------------
  // a/seed-validation (fast): BC-A-1, BC-A-2, BC-A-12, BC-A-7
  // ---------------------------------------------------------------------------
  {
    id: 'a/seed-validation',
    profile: 'fast',
    criteria: ['BC-A-1', 'BC-A-2', 'BC-A-12', 'BC-A-7'],
    run: async (ctx) => {
      const { page, base, net } = ctx;
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#field-seed', { timeout: 8000 });

      await ctx.check('BC-A-1', async (t) => {
        const mark = net.mark();
        await clickButton(page, /^Develop this dish/i);
        await sleep(300);
        const summary = await page.evaluate(() => {
          const el = document.querySelector('[role="alert"]');
          if (!el) return null;
          const a = el.querySelector('a');
          return {
            text: el.textContent.trim(),
            focused: document.activeElement === el,
            linkHref: a ? (a.getAttribute('href') || '') : null,
          };
        });
        t.expect(!!summary, 'error summary (role=alert) rendered', { observed: summary });
        if (summary) {
          t.expectMatch(summary.text, /There is a problem/, 'summary headline');
          t.expectMatch(summary.text, /Enter a seed — say what you want to cook\./, 'seed message present');
          t.expect(summary.focused, 'summary container took focus (GOV.UK pattern)', { observed: summary.focused });
          t.expect(summary.linkHref !== null && /field-/.test(summary.linkHref),
            'message is a link targeting the field', { observed: summary.linkHref });
        }
        t.expectEq(net.count({ method: 'POST', pathRe: CREATE_RE, since: mark }), 0, 'no POST /api/dishes fired');
      }, { journeyCritical: false });

      await ctx.check('BC-A-2', async (t) => {
        await page.type('#field-seed', SEED_TEXT);
        for (const bad of ['0', '1.5']) {
          await setValue(page, '#field-servings', bad);
          const mark = ctx.net.mark();
          await clickButton(page, /^Develop this dish/i);
          await sleep(300);
          const summary = await page.evaluate(() => {
            const el = document.querySelector('[role="alert"]');
            return el ? { text: el.textContent.trim(), focused: document.activeElement === el } : null;
          });
          t.expect(!!summary && /Enter servings as a whole number, at least 1\./.test(summary.text),
            `servings="${bad}" → servings message visible`, { observed: summary && summary.text });
          t.expect(!!summary && summary.focused, `servings="${bad}" → summary focused`);
          t.expectEq(ctx.net.count({ method: 'POST', pathRe: CREATE_RE, since: mark }), 0, `servings="${bad}" → no dish created`);
        }
        await setValue(page, '#field-servings', '2');
      });

      // BC-A-12 double-click half — the form is valid at this point.
      await ctx.check('BC-A-12', async (t) => {
        const mark = net.mark();
        // Synchronous double-click, then an IN-PAGE 5ms sampling loop until
        // the route resolves: both clicks land before React can commit the
        // disabled state (the race under test), and the tight renderer-side
        // poll observes the in-flight window even when the local stub
        // round-trips in tens of milliseconds.
        const during = await page.evaluate(async () => {
          const find = () => [...document.querySelectorAll('button')].find((b) => /^Develop this dish|^Developing/.test(b.textContent.trim()));
          const btn = find();
          btn.click(); btn.click();
          const out = { sawDisabled: false, focusDroppedToBody: false, samples: 0 };
          const t0 = performance.now();
          while (performance.now() - t0 < 4000 && !location.pathname.startsWith('/dishes/')) {
            const b = find();
            if (b && (b.disabled || b.getAttribute('aria-disabled') === 'true')) out.sawDisabled = true;
            if (document.activeElement === document.body) out.focusDroppedToBody = true;
            out.samples += 1;
            await new Promise((r) => setTimeout(r, 5));
          }
          return out;
        });
        t.observe('duringFlight', during);
        await page.waitForFunction(() => location.pathname.startsWith('/dishes/'), { timeout: 8000 });
        await sleep(200);
        t.expectEq(net.count({ method: 'POST', pathRe: CREATE_RE, since: mark }), 1, 'double-click → exactly one POST /api/dishes');
        t.expect(during.sawDisabled, 'submit affordance visibly disabled in flight', { observed: during });
        t.expect(!during.focusDroppedToBody, 'focus not dropped to document.body during flight', { observed: during });
      }, { name: 'double-click' });

      // BC-A-7 rides the dish A-12 just created.
      await ctx.check('BC-A-7', async (t) => {
        const path = await page.evaluate(() => location.pathname);
        t.expect(path.startsWith('/dishes/'), 'creation navigated to /dishes/:id', { observed: path });
        const title = await page.evaluate(() => document.querySelector('h1') && document.querySelector('h1').textContent.trim());
        await page.goto(`${ctx.base}${path}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#stage-heading', { timeout: 8000 });
        const title2 = await page.evaluate(() => document.querySelector('h1') && document.querySelector('h1').textContent.trim());
        t.expectEq(title2, title, 'cold load of the same URL renders the same dish');
      });

      // BC-A-12 Enter half — no synchronous lock exists on the Enter path.
      await ctx.check('BC-A-12', async (t) => {
        await page.goto(`${ctx.base}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#field-seed', { timeout: 8000 });
        await fillSeed(page);
        await setValue(page, '#field-servings', '2');
        await page.focus('#field-seed');
        // Start the in-page in-flight sampler BEFORE the Enters (same
        // assertions as the double-click half, per the recipe).
        await page.evaluate(() => {
          window.__a12enter = (async () => {
            const out = { sawDisabled: false, focusDroppedToBody: false, samples: 0 };
            const t0 = performance.now();
            while (performance.now() - t0 < 6000 && !location.pathname.startsWith('/dishes/')) {
              const b = [...document.querySelectorAll('button')].find((x) => /^Develop this dish|^Developing/.test(x.textContent.trim()));
              if (b && (b.disabled || b.getAttribute('aria-disabled') === 'true')) out.sawDisabled = true;
              if (document.activeElement === document.body) out.focusDroppedToBody = true;
              out.samples += 1;
              await new Promise((r) => setTimeout(r, 5));
            }
            return out;
          })();
        });
        const mark = ctx.net.mark();
        // Two rapid Enters through the raw input pipeline; no awaited
        // evaluates in between.
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => location.pathname.startsWith('/dishes/'), { timeout: 8000 });
        await sleep(300);
        const during = await page.evaluate(() => window.__a12enter);
        t.observe('duringFlight', during);
        t.expectEq(ctx.net.count({ method: 'POST', pathRe: CREATE_RE, since: mark }), 1, 'double-Enter → exactly one POST /api/dishes');
        t.expect(await page.evaluate(() => location.pathname.startsWith('/dishes/')), 'landed on exactly one /dishes/:id');
        t.expect(during.sawDisabled, 'submit affordance visibly disabled in flight (Enter path)', { observed: during });
        t.expect(!during.focusDroppedToBody, 'focus not dropped to document.body (Enter path)', { observed: during });
      }, { name: 'double-enter' });
    },
  },

  // ---------------------------------------------------------------------------
  // a/auto-first-pass (live-sim): BC-A-3 main + mid-flight + fourth boundary,
  // BC-A-8 judge stills
  // ---------------------------------------------------------------------------
  {
    id: 'a/auto-first-pass',
    profile: 'live-sim',
    criteria: ['BC-A-3', 'BC-A-8'],
    run: async (ctx) => {
      const { page, base, net } = ctx;
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#field-seed', { timeout: 8000 });
      // Let the first real paint reach the screencast before the still —
      // run-006 fed the judge a pre-paint black frame for this moment.
      await sleep(600);
      await ctx.judgeStill('BC-A-8', 'seed-screen');
      await fillSeed(page);

      // Arm BEFORE the create: renderer-side stamps for "within 2s".
      await ctx.armMoment({ name: 'dish-rendered', selector: '#stage-heading' });
      await ctx.armMoment({ name: 'proposing-appeared', selector: '[data-testid="proposing-card"]' });

      await ctx.check('BC-A-3', async (t) => {
        const mark = net.mark();
        await clickButton(page, /^Develop this dish/i);
        await page.waitForFunction(() => location.pathname.startsWith('/dishes/'), { timeout: 8000 });
        await sleep(2600); // the ≤2s window, plus render slack — stamps decide
        const inst = await ctx.readInstrument();
        const rendered = inst.moments.find((m) => m.name === 'dish-rendered');
        const proposing = inst.moments.find((m) => m.name === 'proposing-appeared');
        t.observe('moments', inst.moments);
        t.expect(!!proposing, 'proposing state appeared without user input', { observed: proposing ? 'appeared' : 'never' });
        if (proposing && rendered) {
          t.expect(proposing.t - rendered.t <= 2000, 'proposing within 2s of dish render', { observed: Math.round(proposing.t - rendered.t) + 'ms' });
        }
        t.expect(inst.liveLog.some((l) => /Proposing a move…/.test(l.text)), 'live region announced "Proposing a move…"',
          { observed: inst.liveLog.map((l) => l.text).slice(0, 6) });
        t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 1, 'exactly one auto-fired POST …/move');
      }, { name: 'main' });

      await ctx.judgeStill('BC-A-8', 'post-create');

      // Mid-flight boundary: hard-reload while the auto-fired pass generates.
      await ctx.check('BC-A-3', async (t) => {
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#stage-heading', { timeout: 8000 });
        await sleep(2500);
        const proposingVisible = await page.evaluate(() => !!document.querySelector('[data-testid="proposing-card"]'));
        t.expect(proposingVisible, 'proposing state (not idle) re-renders after mid-flight reload', { observed: proposingVisible });
        t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE }), 1, 'still exactly one lifetime POST …/move for the dish');
      }, { name: 'mid-flight' });

      // Capture mid-proposing DEEPER into the window than post-create so the
      // two journey frames are genuinely distinct moments (run-006/007 judges
      // saw near-identical banners; once BC-B-3 streams rationale during
      // generation, this frame will visibly differ).
      await sleep(4000);
      await ctx.judgeStill('BC-A-8', 'mid-proposing');

      // Land the pass at the gate for the judge's fourth frame. If the auto
      // pass never fired (today), fire the move manually so BC-A-8's journey
      // evidence still exists — the manual fallback is exactly what a cook
      // must discover today, which is what the judge should see.
      const sawGate = await waitForVerb(page, 'accept', ctx.genTimeout).then(() => true).catch(() => false);
      if (!sawGate) {
        const idle = await page.evaluate(() => !!document.querySelector('#cc-intent'));
        if (idle) {
          await page.type('#cc-intent', 'a first pass at this dish');
          await clickButton(page, /^Try it/i);
          await waitForVerb(page, 'accept', ctx.genTimeout).catch(() => {});
        }
      }
      await ctx.judgeStill('BC-A-8', 'at-the-gate');

      // Fourth boundary: a failed auto-fired pass falls back to manual —
      // never a silent auto-retry. Fresh dish on the same server, with the
      // auto-fired POST …/move aborted by fault injection.
      await ctx.check('BC-A-3', async (t) => {
        await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#field-seed', { timeout: 8000 });
        await fillSeed(page);
        const removeFaults = await installFaultInjector(page, [
          { method: 'POST', pathRe: MOVE_RE, action: 'abort', times: 1 },
        ]);
        try {
          const mark = net.mark();
          await clickButton(page, /^Develop this dish/i);
          await page.waitForFunction(() => location.pathname.startsWith('/dishes/'), { timeout: 8000 });
          await sleep(2500);
          const fired = net.count({ method: 'POST', pathRe: MOVE_RE, since: mark });
          t.expectEq(fired, 1, 'auto pass fired exactly once (then failed)');
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForSelector('#stage-heading', { timeout: 8000 });
          await sleep(2500);
          const proposingVisible = await page.evaluate(() => !!document.querySelector('[data-testid="proposing-card"]'));
          t.expect(!proposingVisible, 'after a failed auto pass + reload the workbench is idle (no auto-retry)', { observed: proposingVisible ? 'proposing' : 'idle' });
          t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 1, 'lifetime count still one — no silent auto-retry');
        } finally {
          await removeFaults();
        }
      }, { name: 'fourth-boundary' });
    },
  },

  // ---------------------------------------------------------------------------
  // a/auto-first-pass-settled (fast): BC-A-3 first + third boundaries
  // ---------------------------------------------------------------------------
  {
    id: 'a/auto-first-pass-settled',
    profile: 'fast',
    criteria: ['BC-A-3'],
    setup: seedTrials(1),
    run: async (ctx, dishId) => {
      const { page, base, net } = ctx;

      // First boundary: a decided dish never auto-fires on revisit/reload.
      await ctx.check('BC-A-3', async (t) => {
        await gotoDish(page, base, dishId);
        const mark = net.mark();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#stage-heading', { timeout: 8000 });
        await sleep(1500);
        t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 0, 'hard reload of a decided dish fires no move');
        await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#field-seed', { timeout: 8000 });
        await gotoDish(page, base, dishId);
        await sleep(1500);
        t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 0, 'navigate away and back fires no move');
      }, { name: 'first-boundary' });

      // Third boundary: an undecided pending proposal survives reload with
      // the lifetime move count still exactly one.
      await ctx.check('BC-A-3', async (t) => {
        await page.waitForSelector('#cc-intent', { timeout: 8000 });
        const mark = net.mark();
        await page.type('#cc-intent', 'try a brighter finish');
        await clickButton(page, /^Try it/i);
        await waitForVerb(page, 'accept', ctx.genTimeout);
        t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 1, 'one move dispatched to the gate');
        await page.reload({ waitUntil: 'domcontentloaded' });
        const gateBack = await waitForVerb(page, 'accept', 8000).then(() => true).catch(() => false);
        t.expect(gateBack, 'pending proposal + gate re-render after reload (BC-D-4 seam)', { observed: gateBack });
        await sleep(500);
        t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 1, 'lifetime move count still exactly one after reload');
      }, { name: 'third-boundary' });
    },
  },

  // ---------------------------------------------------------------------------
  // a/idle-intent (fast): BC-A-4, BC-A-9, BC-A-14, BC-A-6, BC-A-10,
  // BC-A-5 (chip variant)
  // ---------------------------------------------------------------------------
  {
    id: 'a/idle-intent',
    profile: 'fast',
    criteria: ['BC-A-4', 'BC-A-9', 'BC-A-14', 'BC-A-6', 'BC-A-10', 'BC-A-5'],
    setup: seedTrials(1),
    run: async (ctx, dishId) => {
      const { page, base, net, api } = ctx;
      await gotoDish(page, base, dishId);
      await page.waitForSelector('#cc-intent', { timeout: 8000 });

      await ctx.check('BC-A-4', async (t) => {
        for (const via of ['click', 'enter']) {
          const mark = net.mark();
          if (via === 'click') await clickButton(page, /^Try it/i);
          else { await page.focus('#cc-intent'); await page.keyboard.press('Enter'); }
          await sleep(300);
          const fb = await validationFeedback(page, '#cc-intent');
          t.expect(fb.alertTexts.length > 0 || fb.describedText !== null,
            `${via}: visible validation feedback on empty intent`, { observed: fb });
          t.expect(fb.fieldFocused, `${via}: #cc-intent keeps/receives focus`, { observed: fb.fieldFocused });
          t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 0, `${via}: no move request sent`);
        }
      });

      await ctx.check('BC-A-9', async (t) => {
        await clickButton(page, /^Scale servings/i);
        await page.waitForSelector('#cc-scale-servings', { timeout: 4000 });
        for (const bad of ['', '0', '-1']) {
          await setValue(page, '#cc-scale-servings', bad);
          const mark = net.mark();
          await clickButton(page, /^Scale it/i);
          await sleep(300);
          const fb = await validationFeedback(page, '#cc-scale-servings');
          t.expect(fb.alertTexts.length > 0 || fb.describedText !== null,
            `"${bad}": visible message programmatically associated`, { observed: fb });
          t.expect(fb.fieldFocused, `"${bad}": field focused`, { observed: fb.fieldFocused });
          t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 0, `"${bad}": no move request sent`);
        }
        // Close the scale form the only way IntentBar offers — a valid
        // submit (same servings = a no-op scale; dial ON auto-applies).
        // Leaving it open would hide the "Scale servings…" chip from BC-A-6.
        const servingsNow = await page.evaluate(() => {
          const el = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /^Serves$/i.test(e.textContent.trim()));
          return el ? Number(el.parentElement.textContent.replace(/\D/g, '')) : 2;
        });
        await setValue(page, '#cc-scale-servings', String(servingsNow || 2));
        await clickButton(page, /^Scale it/i);
        await waitForPill(page, 'Ready', ctx.genTimeout).catch(() => {});
        await sleep(400);
      });

      // BC-A-14: a suggested-next chip is real. The recipe drives it: accept
      // a proposal whose suggested_next is non-empty IN the UI, so the chips
      // render on the idle bar (an API pre-seed accept does not populate the
      // in-session suggestion state).
      await ctx.check('BC-A-14', async (t) => {
        await page.waitForSelector('#cc-intent', { timeout: 8000 });
        await page.type('#cc-intent', 'push the flavors somewhere new');
        await clickButton(page, /^Try it/i);
        await waitForVerb(page, 'accept', ctx.genTimeout);
        await clickVerb(page, 'accept');
        await waitForPill(page, 'Ready', ctx.genTimeout).catch(() => {});
        await page.waitForSelector('#cc-intent', { timeout: 8000 });
        const chip = await page.evaluate(() => {
          const label = [...document.querySelectorAll('#cc-steer span')].find((s) => /^Try next —/.test(s.textContent.trim()));
          if (!label) return null;
          const row = label.parentElement;
          const btn = row.querySelector('button');
          return btn ? { text: btn.textContent.trim() } : null;
        });
        t.expect(!!chip, 'a "Try next —" chip renders on the idle intent bar', { observed: chip });
        if (!chip) return;
        const knownLabels = Object.values(MOVE_LABEL);
        t.expect(knownLabels.some((l) => chip.text.startsWith(l)),
          'chip accessible name is the move label, never empty or a raw slug', { observed: chip.text, expected: knownLabels });
        t.expect(!/^[a-z_]+$/.test(chip.text), 'name is not a raw wire slug', { observed: chip.text });
        await ctx.armMoment({ name: 'chip-proposing', selector: '[data-testid="proposing-card"]' });
        const mark = net.mark();
        await page.evaluate(() => {
          const label = [...document.querySelectorAll('#cc-steer span')].find((s) => /^Try next —/.test(s.textContent.trim()));
          label.parentElement.querySelector('button').click();
        });
        await waitForVerb(page, 'accept', ctx.genTimeout);
        t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 1, 'chip dispatched exactly one move');
        const post = net.slice(mark).find((e) => e.kind === 'request' && e.method === 'POST' && MOVE_RE.test(e.path));
        const moveType = post && post.postData ? (JSON.parse(post.postData).moveType || '') : '(none)';
        t.expect(Object.keys(MOVE_LABEL).includes(moveType), 'dispatched a concrete suggested moveType', { observed: moveType });
        t.expectEq(chip.text, MOVE_LABEL[moveType] ?? '(unknown moveType)',
          'clicked chip label corresponds to the dispatched moveType');
        const inst = await ctx.readInstrument();
        t.expect(inst.moments.some((m) => m.name === 'chip-proposing'), 'proposing surface appeared (BC-B-1 surface)');
        await clickVerb(page, 'accept');
        await sleep(400);
      });

      // BC-A-6 + BC-A-10 share the four deterministic moves (dial ON: the
      // dish was created with the default dial, which is ON).
      const draft0 = await api('GET', `/api/dishes/${dishId}`);
      const dialOn = await page.evaluate(() => {
        const sw = document.querySelector('[role="switch"]');
        return sw ? sw.getAttribute('aria-checked') === 'true' : null;
      });

      // Chip reads are scoped to the "Just the math —" ROW: suggested-next
      // chips render the same MOVE_LABEL strings inside the same #cc-steer
      // container, so a container-wide label match over-counts (critic
      // finding — a "Recompute nutrition" suggested chip would make 5).
      const readMathChips = () => page.evaluate(() => {
        const label = [...document.querySelectorAll('#cc-steer span')].find((s) => /^Just the math —/.test(s.textContent.trim()));
        if (!label) return null;
        // The auto tag is its own <span>auto</span> child (AutoTag) — the
        // text concatenates with the label ("Convert unitsauto"), so detect
        // the element, not a word-boundary regex.
        return [...label.parentElement.querySelectorAll('button')].map((c) => ({
          text: c.textContent.trim(),
          hasAuto: [...c.querySelectorAll('span')].some((s) => s.textContent.trim().toLowerCase() === 'auto'),
        }));
      });

      await ctx.check('BC-A-6', async (t) => {
        t.expectEq(dialOn, true, 'autonomy dial is ON (dish default)');
        const tags = await readMathChips();
        t.expect(tags !== null, '"Just the math —" row renders', { observed: tags });
        t.expectEq((tags || []).length, 4, 'all four "Just the math" chips render', { observed: tags });
        t.expect((tags || []).every((c) => c.hasAuto), 'dial ON → every chip carries the "auto" tag', { observed: tags });
      }, { name: 'tags-on' });

      // BC-A-10 drives the four deterministic moves ITSELF, reading the
      // draft between moves so every assertion binds to the move that
      // caused it (a later unit conversion may legitimately change
      // quantities — critic finding). BC-A-6's dispatch clause then asserts
      // the wire traffic post-hoc from the NetLog. Clicks are scoped to the
      // math row (same-label suggested chips exist).
      const targetServings = draft0.draft.constraints.servings * 2;

      const clickMathChip = (re) => page.evaluate((src, flags) => {
        const rx = new RegExp(src, flags);
        const label = [...document.querySelectorAll('#cc-steer span')].find((s) => /^Just the math —/.test(s.textContent.trim()));
        const btn = label && [...label.parentElement.querySelectorAll('button')].find((b) => rx.test(b.textContent.trim()));
        if (!btn) throw new Error(`no math chip ${src}`);
        btn.click();
      }, re.source, re.flags);

      const fireMath = async (re) => {
        await clickMathChip(re);
        await waitForPill(page, 'Ready', ctx.genTimeout).catch(() => {});
        await sleep(400);
      };

      const readUi = () => page.evaluate(() => ({
        serves: [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /^Serves$/i.test(e.textContent.trim()))?.parentElement?.textContent.trim() || null,
        rows: [...document.querySelectorAll('[data-testid="ingredient-row"]')].map((r) => r.textContent.trim()),
        body: document.body.textContent,
      }));

      const wireMark = net.mark();

      await ctx.check('BC-A-10', async (t) => {
        // Scale it → N: proportional quantities + servings display.
        await clickMathChip(/^Scale servings/i);
        await page.waitForSelector('#cc-scale-servings', { timeout: 4000 });
        await setValue(page, '#cc-scale-servings', String(targetServings));
        await fireMath(/^Scale it/i);
        const afterScale = (await api('GET', `/api/dishes/${dishId}`)).draft;
        const factor = targetServings / draft0.draft.constraints.servings;
        t.expectEq(afterScale.constraints.servings, targetServings, 'servings scaled on the draft');
        for (const ing0 of draft0.draft.ingredients) {
          const now = afterScale.ingredients.find((i) => i.name === ing0.name);
          if (!now) continue;
          const want = ing0.qty * factor;
          t.expect(Math.abs(now.qty - want) < 0.05 * Math.max(1, want), `${ing0.name}: qty scaled proportionally`, { observed: now.qty, expected: want });
        }
        let ui = await readUi();
        t.expect(ui.serves === null || ui.serves.includes(String(targetServings)), 'servings display shows the target', { observed: ui.serves });

        // Convert units: each converted row matches the server draft
        // (formatQty renders value + U+2009 thin space + unit).
        await fireMath(/^Convert units/i);
        const afterConvert = (await api('GET', `/api/dishes/${dishId}`)).draft;
        ui = await readUi();
        let matchedRows = 0;
        for (const ing of afterConvert.ingredients) {
          const row = ui.rows.find((r) => r.includes(ing.name));
          if (!row) continue;
          matchedRows += 1;
          const qtyRendered = `${ing.qty}\u2009${ing.unit}`;
          t.expect(row.includes(qtyRendered) || row.includes(String(ing.qty)), `${ing.name}: row shows the server draft quantity/unit`, { observed: row.slice(0, 80), expected: qtyRendered });
        }
        // A UI that stops naming ingredients would make every find() miss \u2014
        // the mirror clause must not silently no-op (self-test mutation
        // 'freeze-dish-numbers' enforces this).
        t.expect(matchedRows > 0, 'ingredient rows identifiable by server ingredient names', { observed: matchedRows, sample: ui.rows.slice(0, 2) });

        // Recompute cost → the visible figure equals the server draft.
        await fireMath(/^Recompute cost/i);
        const afterCost = (await api('GET', `/api/dishes/${dishId}`)).draft;
        ui = await readUi();
        const cost = `$${afterCost.analysis.cost.per_serving_usd.toFixed(2)}`;
        t.expect(ui.body.includes(cost), 'cost figure equals the server draft', { expected: cost });

        // Recompute nutrition → headline USDA figures equal the server draft.
        await fireMath(/^Recompute nutrition/i);
        const afterNutrition = (await api('GET', `/api/dishes/${dishId}`)).draft;
        ui = await readUi();
        const cal = String(Math.round(afterNutrition.analysis.nutrition.calories * 10) / 10);
        const sodium = String(Math.round(afterNutrition.analysis.nutrition.sodium_mg * 10) / 10);
        t.expect(ui.body.includes(`${cal} kcal`), 'calories cell equals the server draft', { expected: `${cal} kcal` });
        t.expect(ui.body.includes(`${sodium} mg`), 'sodium cell equals the server draft', { expected: `${sodium} mg` });
      });

      await ctx.check('BC-A-6', async (t) => {
        const posts = net.slice(wireMark).filter((e) => e.kind === 'request' && e.method === 'POST' && MOVE_RE.test(e.path));
        const types = posts.map((p) => { try { return JSON.parse(p.postData || '{}').moveType; } catch { return '(unparsable)'; } });
        t.expectEq(types.length, 4, 'the four chips dispatched exactly one POST each', { observed: types });
        t.expectEq(types, ['scale_servings', 'unit_convert', 'cost_recompute', 'nutrition_recompute'], 'each chip dispatched its own moveType');
      }, { name: 'dispatch' });

      // Dial OFF → the auto tags disappear (BC-A-6's other half; math-row
      // scoped, same reason as tags-on).
      await ctx.check('BC-A-6', async (t) => {
        await page.evaluate(() => document.querySelector('[role="switch"]').click());
        await sleep(400);
        const tags = await readMathChips();
        t.expect(tags !== null && tags.length > 0 && tags.every((c) => !c.hasAuto), 'dial OFF → no auto tags', { observed: tags });
        await page.evaluate(() => document.querySelector('[role="switch"]').click()); // back ON
        await sleep(400);
      }, { name: 'tags-off' });

      // BC-A-5 chip variant: synchronous double-click per chip — no shared
      // dispatch lock exists in IntentBar today.
      await ctx.check('BC-A-5', async (t) => {
        const doubleFire = async (re, label) => {
          const mark = net.mark();
          await page.evaluate((src, flags) => {
            const rx = new RegExp(src, flags);
            const btn = [...document.querySelectorAll('#cc-steer button')].find((b) => rx.test(b.textContent.trim()));
            if (!btn) throw new Error(`no chip ${src}`);
            btn.click(); btn.click();
          }, re.source, re.flags);
          await waitForPill(page, 'Ready', ctx.genTimeout).catch(() => {});
          await sleep(500);
          t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 1, `${label}: double-click → exactly one POST`);
          // Clear any parked state so the next chip starts idle.
          const gate = await page.evaluate(() => !!document.querySelector('button[data-verb="accept"]'));
          if (gate) { await clickVerb(page, 'accept'); await sleep(400); }
        };
        // The Scale move's form-submit path ("Scale it →") shares the same
        // missing lock — race it too (critic finding).
        await clickMathChip(/^Scale servings/i);
        await page.waitForSelector('#cc-scale-servings', { timeout: 4000 });
        await setValue(page, '#cc-scale-servings', String(targetServings * 2));
        await doubleFire(/^Scale it/i, 'scale_servings form submit');
        await doubleFire(/^Convert units/i, 'unit_convert chip');
        await doubleFire(/^Recompute cost/i, 'cost_recompute chip');
        await doubleFire(/^Recompute nutrition/i, 'nutrition_recompute chip');
        // And one "Try next —" chip when present.
        const hasNext = await page.evaluate(() => {
          const label = [...document.querySelectorAll('#cc-steer span')].find((s) => /^Try next —/.test(s.textContent.trim()));
          return !!(label && label.parentElement.querySelector('button'));
        });
        if (hasNext) {
          const mark = net.mark();
          await page.evaluate(() => {
            const label = [...document.querySelectorAll('#cc-steer span')].find((s) => /^Try next —/.test(s.textContent.trim()));
            const btn = label.parentElement.querySelector('button');
            btn.click(); btn.click();
          });
          await waitForVerb(page, 'accept', ctx.genTimeout).catch(() => {});
          await sleep(500);
          t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 1, 'Try-next chip: double-click → exactly one POST');
        } else {
          t.observe('tryNextChip', 'absent at this point in the journey — deterministic chips covered the race');
          t.expect(true, 'deterministic chip races executed');
        }
      }, { name: 'chips' });
    },
  },

  // ---------------------------------------------------------------------------
  // a/inflight-lock (live-sim): BC-A-5 main, BC-A-13 cancel half
  // ---------------------------------------------------------------------------
  {
    id: 'a/inflight-lock',
    profile: 'live-sim',
    criteria: ['BC-A-5', 'BC-A-13'],
    setup: seedTrials(1),
    run: async (ctx, dishId) => {
      const { page, base, net } = ctx;
      await gotoDish(page, base, dishId);
      await page.waitForSelector('#cc-intent', { timeout: 8000 });

      const INTENT = 'lean the whole dish toward smoke and citrus';

      await ctx.check('BC-A-5', async (t) => {
        // Arm the dispatch moment: the intent bar unmounts when proposing
        // begins — where does focus land at that instant?
        await ctx.armMoment({ name: 'intent-unmounted', kind: 'disappear', selector: '#cc-intent' });
        const mark = net.mark();
        await page.focus('#cc-intent');
        await page.type('#cc-intent', INTENT);
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter'); // immediate second submit attempt
        await sleep(1200);
        const gone = await page.evaluate(() => {
          const el = document.querySelector('#cc-intent');
          return !el || el.disabled || el.getAttribute('aria-disabled') === 'true';
        });
        t.expect(gone, 'intent affordance visibly unavailable in flight', { observed: gone });
        t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 1, 'exactly one POST despite the second submit');
        const banner = await page.evaluate(() => !!document.querySelector('[data-testid="move-failed-banner"]'));
        t.expect(!banner, 'no unhandled error banner', { observed: banner });
        const inst = await ctx.readInstrument();
        const m = inst.moments.find((x) => x.name === 'intent-unmounted');
        t.expect(!!m, 'dispatch moment captured', { observed: m ? 'captured' : 'missed' });
        if (m) {
          t.expect(!m.active.isBody, 'focus at dispatch is not document.body', { observed: m.active });
          t.expect(m.active.isConnected, 'focus at dispatch is attached', { observed: m.active });
          t.expect(!m.active.isStop, 'focus at dispatch is not Stop (BC-B-4 prohibition)', { observed: m.active });
        }
      }, { name: 'main' });

      // BC-A-13 cancel half: Stop mid-generation restores the typed intent.
      await ctx.check('BC-A-13', async (t) => {
        const stop = await page.evaluate(() => {
          const btn = [...document.querySelectorAll('button')].find((b) => /^Stop$/.test(b.textContent.trim()));
          if (btn) btn.click();
          return !!btn;
        });
        t.expect(stop, 'Stop control present mid-generation and clicked', { observed: stop });
        await waitForPill(page, 'Ready', 15000).catch(() => {});
        await page.waitForSelector('#cc-intent', { timeout: 8000 });
        const value = await page.evaluate(() => document.querySelector('#cc-intent').value);
        t.expectEq(value, INTENT, 'after cancel the in-flight intent text is restored');
      }, { name: 'cancel-restore' });
    },
  },

  // ---------------------------------------------------------------------------
  // a/create-fail (fast): BC-A-11 — backend dies before the create POST
  // ---------------------------------------------------------------------------
  {
    id: 'a/create-fail',
    profile: 'fast',
    criteria: ['BC-A-11'],
    run: async (ctx) => {
      const { page, base, server, net } = ctx;
      await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#field-seed', { timeout: 8000 });
      await fillSeed(page);

      await ctx.check('BC-A-11', async (t) => {
        await server.stop('SIGKILL'); // the SPA is already loaded; only the API dies
        await clickButton(page, /^Develop this dish/i);
        await sleep(1500);
        const state = await page.evaluate(() => {
          const el = document.querySelector('[role="alert"]');
          return {
            summary: el ? el.textContent.trim().slice(0, 160) : null,
            focused: el ? document.activeElement === el : false,
            path: location.pathname,
          };
        });
        t.expect(!!state.summary, 'error summary rendered on create failure', { observed: state });
        t.expect(state.focused, 'error summary focused', { observed: state.focused });
        t.expectEq(state.path, '/', 'app did not navigate away from the seed screen');
      });
    },
  },

  // ---------------------------------------------------------------------------
  // a/move-fail (fast + fault injection): BC-A-13 failure half
  // ---------------------------------------------------------------------------
  {
    id: 'a/move-fail',
    profile: 'fast',
    criteria: ['BC-A-13'],
    setup: seedTrials(0),
    run: async (ctx, dishId) => {
      const { page, base, net } = ctx;
      await gotoDish(page, base, dishId);
      await page.waitForSelector('#cc-intent', { timeout: 8000 });

      const INTENT = 'give it a crunchy topping that survives the oven';
      const removeFaults = await installFaultInjector(page, [
        { method: 'POST', pathRe: MOVE_RE, action: 'abort' },
      ]);
      try {
        await ctx.check('BC-A-13', async (t) => {
          await page.type('#cc-intent', INTENT);
          await clickButton(page, /^Try it/i);
          await sleep(1500);
          const failureSurfaced = await page.evaluate(() =>
            !!document.querySelector('[data-testid="move-failed-banner"]')
            || [...document.querySelectorAll('[role="alert"],[role="status"]')].some((el) => el.offsetParent !== null && (el.textContent || '').trim().length > 0));
          t.expect(failureSurfaced, 'the failure is surfaced (banner or live region)', { observed: failureSurfaced });
          const intentValue = await page.evaluate(() => {
            const el = document.querySelector('#cc-intent');
            return el ? el.value : '(intent bar not rendered)';
          });
          t.expectEq(intentValue, INTENT, 'typed intent text preserved after the failure');
        }, { name: 'intent-fail' });

        await ctx.check('BC-A-13', async (t) => {
          const barBack = await page.waitForSelector('#cc-intent', { timeout: 5000 }).then(() => true).catch(() => false);
          t.expect(barBack, 'intent bar available for the scale variant', { observed: barBack });
          if (!barBack) return;
          await clickButton(page, /^Scale servings/i);
          await page.waitForSelector('#cc-scale-servings', { timeout: 4000 });
          await setValue(page, '#cc-scale-servings', '7');
          await clickButton(page, /^Scale it/i);
          await sleep(1500);
          const scaleState = await page.evaluate(() => {
            const el = document.querySelector('#cc-scale-servings');
            return el ? el.value : '(scale form closed)';
          });
          t.expectEq(scaleState, '7', 'typed scale value preserved after the failure');
        }, { name: 'scale-fail' });
      } finally {
        await removeFaults();
      }
    },
  },
];
