// Area C — safety holds & the human-edit override path. One scenario,
// c/safety (fast), owns BC-C-6's hold-input half plus BC-C-7, BC-C-8,
// BC-C-15, BC-C-26, BC-C-27, BC-C-28. Shapes copied from a-intake.mjs (the
// pattern-setter): bounded waits (a state that never arrives is a FAIL with
// observed:'never', never a hang), renderer-side moment arming for the
// hold's mount-focus, generation waits via ctx.genTimeout so parity re-runs
// survive the 25s live-sim window, and committed-state truth read from the
// server (GET /versions) — the "no silent commit" clauses assert on the
// version chain, not a page POST count.
//
// The stub steer fixtures this file drives (server-side, already verified):
//   "garlic oil"  → anaerobic hold (rule anaerobic-garlic-oil)
//   "peanut"      → allergen hold when the dish declares peanuts (allergen-peanuts)
//   "rare chicken"→ min-temp hold (rule min-temp-poultry)
// The seed CONSTRAINTS declare peanuts + crustacean shellfish, so the peanut
// move blocks. "skip the raw garlic-in-oil step" carries NO trigger keyword
// ("garlic-in-oil" ≠ the "garlic oil" substring) so the safer steer recovers.
//
// [post-critic revision] BC-C-26's disclaimer probe now enforces the
// contract's *Visible* definition (rendered, real size, not display/
// visibility/opacity-hidden, not shifted fully off-screen) — attribute-only
// or CSS-hidden text no longer counts — and exercises the "one-interaction-
// reachable" alternative. BC-C-7's focus clause asserts the pre-armed render
// moment (container OR heading); the struck-list uses computed line-through
// on any element, ≥1 (not exact-count), with a content match to the blocked
// ops; the section label accepts "or equivalent"; reason matches run against
// the hold's full text (no first-<p> coupling). BC-C-28 confirms no-commit
// with a bounded poll and a fixed-position-safe alert-visibility test.
import {
  sleep, clickButton, waitForVerb, setValue, SEED_TEXT,
  GARLIC_OIL_STEP, GARLIC_INGREDIENT,
} from '../lib/page.mjs';
import { CONSTRAINTS } from '../lib/api.mjs';

// Disclaimer language a "backstop, not a guarantee" surface would carry — BC-C-26.
const DISCLAIMER_RE = /backstop|not a guarantee|no guarantee|does not guarantee|isn'?t a guarantee|not a substitute|does not replace|no substitute for|not a replacement/i;
// Affordances that could reveal a disclaimer in one interaction (M-4).
const REVEAL_RE = /disclaimer|backstop|guarantee|safety (info|note|notice|limit)|about (the )?safety|safety gate|limits of safety|learn more about safety/i;
// A well-formed op line carries a change verb — used to reject garbage struck text.
const OP_LINE_RE = /(added|changed|removed|remove|add|replace)/i;
const HAPPENED = { add: 'added', replace: 'changed', remove: 'removed' };

export const scenarios = [
  {
    id: 'c/safety',
    profile: 'fast',
    criteria: ['BC-C-6', 'BC-C-7', 'BC-C-8', 'BC-C-15', 'BC-C-26', 'BC-C-27', 'BC-C-28'],
    run: async (ctx) => {
      const { page, base, api } = ctx;

      // ---- shared drivers ---------------------------------------------------
      const freshDish = async () => {
        const d = await api('POST', '/api/dishes', { seed: SEED_TEXT, constraints: CONSTRAINTS });
        return d.id;
      };
      const gotoDish = async (dishId) => {
        await page.goto(`${base}/dishes/${dishId}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#stage-heading', { timeout: 8000 });
      };
      const versionCount = async (dishId) => {
        const v = await api('GET', `/api/dishes/${dishId}/versions`);
        return (v.versions || []).length;
      };
      const waitForVersionCount = async (dishId, target, timeout = 8000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
          if ((await versionCount(dishId)) === target) return true;
          await sleep(150);
        }
        return false;
      };
      // Confirm the version count never leaves `expected` over a bounded window
      // — a delayed silent commit would push it off (BC-C-28 no-commit, m-1).
      const stayedAt = async (dishId, expected, windowMs = 1400) => {
        const start = Date.now();
        while (Date.now() - start < windowMs) {
          if ((await versionCount(dishId)) !== expected) return false;
          await sleep(150);
        }
        return true;
      };
      // Drive a free-text intent to a parked proposal at the gate (safe steer).
      const driveToGate = async (dishId, intent) => {
        await gotoDish(dishId);
        await page.waitForSelector('#cc-intent', { timeout: 8000 });
        await page.type('#cc-intent', intent);
        await clickButton(page, /^Try it/i);
        return waitForVerb(page, 'accept', ctx.genTimeout).then(() => true).catch(() => false);
      };
      // Drive a free-text intent to a safety hold; arm the mount-focus moment
      // BEFORE dispatch so the instrument stamps activeElement the instant the
      // hold renders.
      const driveToHold = async (dishId, intent, momentName) => {
        await gotoDish(dishId);
        await page.waitForSelector('#cc-intent', { timeout: 8000 });
        if (momentName) await ctx.armMoment({ name: momentName, selector: '[data-testid="safety-hold"]' });
        await page.type('#cc-intent', intent);
        await clickButton(page, /^Try it/i);
        const seen = await page.waitForSelector('[data-testid="safety-hold"]', { timeout: ctx.genTimeout })
          .then(() => true).catch(() => false);
        await sleep(220); // let the hold's content settle for the DOM reads
        return seen;
      };

      const readHold = () => page.evaluate(() => {
        const hold = document.querySelector('[data-testid="safety-hold"]');
        if (!hold) return { present: false };
        const active = document.activeElement;
        const verbBtns = [...hold.querySelectorAll('[data-verb]')];
        // Struck-through would-have-added lines: ANY element whose COMPUTED
        // text-decoration is line-through, carrying its own non-empty text, and
        // with no struck descendant (leaf carriers only — never a literal
        // className match, per M-2).
        const struckEls = [...hold.querySelectorAll('*')].filter((el) => {
          const cs = getComputedStyle(el);
          const line = `${cs.textDecorationLine || ''} ${cs.textDecoration || ''}`;
          if (!/line-through/.test(line)) return false;
          if (!(el.textContent || '').trim()) return false;
          return ![...el.querySelectorAll('*')].some((d) => /line-through/.test(getComputedStyle(d).textDecorationLine || ''));
        });
        const struck = struckEls.map((el) => (el.textContent || '').trim());
        const paras = [...hold.querySelectorAll('p')].map((p) => (p.textContent || '').trim()).filter((t) => t.length > 0);
        // Accessible section label: an element (not aria-hidden, no aria-hidden
        // ancestor inside the hold) whose own text names the would-have-added
        // section — "What it would have added" OR an equivalent (M-3).
        const LABEL_RE = /what (it|this) would have added|would have added|would have been added|blocked addition|held (change|addition)|changes .*blocked|would have (added|changed|removed)/i;
        const notAriaHidden = (el) => {
          let n = el;
          while (n && n !== hold.parentElement) {
            if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') return false;
            n = n.parentElement;
          }
          return true;
        };
        let sectionLabelText = null;
        for (const el of hold.querySelectorAll('*')) {
          let own = '';
          for (const nd of el.childNodes) if (nd.nodeType === 3) own += nd.textContent;
          if (LABEL_RE.test(own) && notAriaHidden(el)) { sectionLabelText = own.trim(); break; }
        }
        return {
          present: true,
          role: hold.getAttribute('role'),
          bodyText: (hold.textContent || '').trim(),
          reasonPresent: paras.length > 0,
          reasonSample: paras[0] ? paras[0].slice(0, 180) : '',
          verbs: verbBtns.map((b) => b.getAttribute('data-verb')).sort(),
          verbTexts: verbBtns.map((b) => b.textContent.trim()),
          struck,
          sectionLabelText,
          active: {
            tag: active && active.tagName ? active.tagName.toLowerCase() : null,
            testid: active && active.getAttribute ? active.getAttribute('data-testid') : null,
            text: active ? (active.textContent || '').trim().slice(0, 60) : '',
            isBody: active === document.body,
            isConnected: active ? active.isConnected : false,
          },
        };
      });

      // A disclaimer counts only if it is actually RENDERED and legible — the
      // contract's *Visible* definition. Rejects display/visibility/opacity
      // hidden, 1px sr-only clips, and elements shifted fully off-screen;
      // a below-the-fold footer (reachable by scroll) still counts (C-1).
      const visibleDisclaimer = () => page.evaluate((src, flags) => {
        const rx = new RegExp(src, flags);
        const isVisible = (el) => {
          const cs = window.getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || cs.visibility === 'collapse') return false;
          if (parseFloat(cs.opacity || '1') === 0) return false;
          const r = el.getBoundingClientRect();
          if (r.width <= 1 || r.height <= 1) return false;
          if (r.left <= -r.width || r.top <= -r.height) return false; // shifted fully off-screen
          return true;
        };
        // innerText already excludes display:none / visibility:hidden text.
        const matching = [...document.querySelectorAll('body *')].filter((el) => rx.test(el.innerText || ''));
        const carriers = matching.filter((el) => !matching.some((o) => o !== el && el.contains(o)));
        for (const el of carriers) {
          if (isVisible(el)) return { present: true, sample: (el.innerText || '').trim().slice(0, 90) };
        }
        return { present: false, sample: null };
      }, DISCLAIMER_RE.source, DISCLAIMER_RE.flags);

      // One-interaction reveal: click a non-verb affordance that names a safety
      // disclaimer, if any exists. Returns the affordance text clicked, or null.
      const tryRevealDisclaimer = () => page.evaluate((src, flags) => {
        const rx = new RegExp(src, flags);
        const cands = [...document.querySelectorAll('button, [role="button"], a[href^="#"]')]
          .filter((el) => !el.hasAttribute('data-verb'))
          .filter((el) => rx.test(`${el.textContent || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`));
        if (!cands.length) return null;
        const label = (cands[0].textContent || cands[0].getAttribute('aria-label') || '').trim().slice(0, 40);
        cands[0].click();
        return label || '(affordance)';
      }, REVEAL_RE.source, REVEAL_RE.flags);

      // Idle-or-hold disclaimer verdict: visible now, else revealed by one
      // interaction, else absent.
      const disclaimerReachable = async () => {
        let r = await visibleDisclaimer();
        if (r.present) return { present: true, via: 'visible', sample: r.sample };
        const revealed = await tryRevealDisclaimer();
        if (revealed) {
          await sleep(250);
          r = await visibleDisclaimer();
          if (r.present) return { present: true, via: `revealed via "${revealed}"`, sample: r.sample };
          return { present: false, via: `no disclaimer after clicking "${revealed}"`, sample: null };
        }
        return { present: false, via: 'no visible disclaimer and no reveal affordance', sample: null };
      };

      // Open the take-over form from a gate (via the "Try another way"
      // disclosure).
      const openTakeover = async () => {
        await page.evaluate(() => {
          const btn = [...document.querySelectorAll('#cc-gate button')].find((b) => /Try another way/i.test(b.textContent));
          if (!btn) throw new Error('no "Try another way" button at the gate');
          btn.click();
        });
        await page.waitForFunction(() => !!document.querySelector('#cc-gate [data-verb="take_over"]'), { timeout: 4000 });
        await page.evaluate(() => document.querySelector('#cc-gate [data-verb="take_over"]').click());
        await page.waitForSelector('[data-testid="takeover-form"] textarea', { timeout: 4000 });
      };
      const submitTakeover = async (jsonText) => {
        await setValue(page, '[data-testid="takeover-form"] textarea', jsonText);
        await sleep(60);
        await page.evaluate(() => {
          const btn = [...document.querySelectorAll('[data-testid="takeover-form"] button')].find((b) => /Save draft/i.test(b.textContent));
          if (!btn) throw new Error('no "Save draft" button');
          btn.click();
        });
      };
      const garlicDraftText = async (dishId) => {
        const d = await api('GET', `/api/dishes/${dishId}`);
        const draft = d.draft;
        return JSON.stringify({
          ...draft,
          ingredients: [...(draft.ingredients || []), GARLIC_INGREDIENT],
          steps: [...(draft.steps || []), GARLIC_OIL_STEP],
        });
      };
      const readOverride = () => page.evaluate(() => {
        const dlg = document.querySelector('[data-testid="override-prompt"]');
        const active = document.activeElement;
        return {
          present: !!dlg,
          role: dlg ? dlg.getAttribute('role') : null,
          activeText: active ? (active.textContent || '').trim().slice(0, 40) : null,
          activeIsBody: active === document.body,
          activeConnected: active ? active.isConnected : false,
        };
      });
      const clickInOverride = (re) => page.evaluate((src, flags) => {
        const rx = new RegExp(src, flags);
        const btn = [...document.querySelectorAll('[data-testid="override-prompt"] button')].find((b) => rx.test(b.textContent.trim()));
        if (!btn) throw new Error(`no override button matching ${src}`);
        btn.click();
      }, re.source, re.flags);
      // Visible role="alert" text — geometry-based so a position:fixed banner
      // (offsetParent === null yet on screen) is not misclassified as hidden (M-5).
      const visibleAlertTexts = () => page.evaluate(() =>
        [...document.querySelectorAll('[role="alert"]')].filter((a) => {
          const cs = getComputedStyle(a);
          if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') === 0) return false;
          const r = a.getBoundingClientRect();
          if (r.width <= 1 || r.height <= 1) return false;
          return (a.textContent || '').trim().length > 0;
        }).map((a) => a.textContent.trim().slice(0, 120)));

      // =======================================================================
      // Dish A: the anaerobic garlic-oil journey — hold (C-7), disclaimer on
      // hold (C-26), empty-guard (C-6), safer-steer recovery (C-7), then the
      // human-edit override path (C-27, C-8) off the recovered gate.
      // =======================================================================
      const dishA = await freshDish();
      await gotoDish(dishA);

      // BC-C-26 — the disclaimer on the idle workbench. [LIKELY FAILS TODAY]
      await ctx.check('BC-C-26', async (t) => {
        const r = await disclaimerReachable();
        t.expect(r.present,
          'a visible OR one-interaction-reachable backstop/not-a-guarantee disclaimer is present on the idle workbench',
          { observed: r.present ? `${r.via}: ${r.sample}` : `absent — ${r.via}` });
      }, { name: 'idle' });

      await page.waitForSelector('#cc-intent', { timeout: 8000 });
      await ctx.armMoment({ name: 'garlic-hold', selector: '[data-testid="safety-hold"]' });
      await page.type('#cc-intent', 'add a garlic oil infusion drizzled over the top');
      await clickButton(page, /^Try it/i);
      const garlicHoldSeen = await page.waitForSelector('[data-testid="safety-hold"]', { timeout: ctx.genTimeout })
        .then(() => true).catch(() => false);
      await sleep(220);

      // BC-C-7 (main) — the hold renders fully and takes focus on mount.
      await ctx.check('BC-C-7', async (t) => {
        t.expect(garlicHoldSeen, 'safety-hold rendered for the garlic-oil move', { observed: garlicHoldSeen ? 'present' : 'never' });
        const h = await readHold();
        if (!h.present) { t.expect(false, 'hold present for assertions', { observed: 'never' }); return; }
        t.expectEq(h.role, 'alert', 'hold carries role="alert"');
        t.expect(h.reasonPresent, 'a safety reason paragraph is shown', { observed: h.reasonSample });
        t.expect(/botulinum|garlic|oil|anaerobic/i.test(h.bodyText),
          'the anaerobic reason is present in the hold text', { observed: h.reasonSample });
        t.expectEq(h.verbs.length, 2, 'exactly two data-verb recovery buttons on the hold');
        t.expectEq(h.verbs.join(','), 'redirect,regenerate', 'the two verbs are regenerate + redirect');
        const verbBlob = h.verbTexts.join(' | ');
        t.expect(/Try a different way/i.test(verbBlob) && /Ask for a safer change/i.test(verbBlob),
          'verb labels are "Try a different way" and "Ask for a safer change"', { observed: h.verbTexts });

        // Struck would-have-added lines: ≥1, real op-line shape, content-matched
        // to at least one actual blocked op — only "whenever the proposal
        // carried ops" (M-2).
        const d = await api('GET', `/api/dishes/${dishA}`);
        const blockedOps = (d.blocked && d.blocked.ops) || [];
        if (blockedOps.length > 0) {
          t.expect(h.struck.length >= 1, 'at least one struck-through would-have-added op line', { observed: h.struck });
          t.expect(h.struck.length > 0 && h.struck.every((s) => OP_LINE_RE.test(s)),
            'struck lines read as op lines (carry a change verb), not arbitrary text', { observed: h.struck });
          const wanted = [...new Set(blockedOps.map((o) => HAPPENED[o.op]).filter(Boolean))];
          t.expect(wanted.some((w) => h.struck.some((s) => new RegExp(w, 'i').test(s))),
            'at least one struck line matches a blocked op (its change type is rendered)',
            { observed: { struck: h.struck, wanted } });
          t.observe('struckVsOps', { struckCount: h.struck.length, opCount: blockedOps.length });
        } else {
          t.observe('blockedOps', 'none — struck-line clause not applicable (no ops on the proposal)');
        }

        t.expect(!!h.sectionLabelText && h.sectionLabelText.length > 0,
          'accessible section label ("What it would have added" or equivalent) exposed as text in the a11y tree',
          { observed: h.sectionLabelText });

        // Focus lands on the hold container OR its heading when it first
        // renders — asserted on the pre-armed render moment, not a settle read (M-1).
        const inst = await ctx.readInstrument();
        const moment = inst && inst.moments.find((m) => m.name === 'garlic-hold');
        t.expect(!!moment, 'the hold-render focus moment was captured by the instrument', { observed: moment ? 'captured' : 'missed' });
        if (moment) {
          const a = moment.active;
          const onHoldOrHeading = a.testid === 'safety-hold' || /^h[1-6]$/.test(a.tag || '') || /safety hold/i.test(a.text || '');
          t.expect(onHoldOrHeading && !a.isBody && a.isConnected,
            'at the render instant focus is on the hold container or its heading (not document.body)', { observed: a });
        }
      }, { name: 'main' });

      // BC-C-26 — the disclaimer reachable on the safety hold. [LIKELY FAILS]
      await ctx.check('BC-C-26', async (t) => {
        const r = await disclaimerReachable();
        t.expect(r.present,
          'a visible OR one-interaction-reachable backstop/not-a-guarantee disclaimer is present on a safety hold',
          { observed: r.present ? `${r.via}: ${r.sample}` : `absent — ${r.via}` });
      }, { name: 'hold' });

      // BC-C-6 (hold-input) — the hold's own "Ask for a safer change" Send is
      // disabled while #safety-hold-steer is empty, enabled once text is typed.
      // Independent binding from the gate's redirect form.
      await ctx.check('BC-C-6', async (t) => {
        const opened = await page.evaluate(() => {
          const hold = document.querySelector('[data-testid="safety-hold"]');
          if (!hold) return false;
          const btn = hold.querySelector('[data-verb="redirect"]');
          if (!btn) return false;
          btn.click();
          return true;
        });
        t.expect(opened, 'opened "Ask for a safer change" on the hold', { observed: opened });
        if (!opened) return;
        const hasInput = await page.waitForSelector('#safety-hold-steer', { timeout: 4000 }).then(() => true).catch(() => false);
        t.expect(hasInput, '#safety-hold-steer input rendered', { observed: hasInput });
        if (!hasInput) return;
        const sendState = () => page.evaluate(() => {
          const hold = document.querySelector('[data-testid="safety-hold"]');
          const btn = [...hold.querySelectorAll('button')].find((b) => /^Send/.test(b.textContent.trim()));
          return btn ? { disabled: btn.disabled } : null;
        });
        const empty = await sendState();
        t.expect(empty && empty.disabled === true, 'Send disabled while #safety-hold-steer is empty', { observed: empty });
        await setValue(page, '#safety-hold-steer', 'x');
        await sleep(60);
        const typed = await sendState();
        t.expect(typed && typed.disabled === false, 'Send enabled once steer text is present', { observed: typed });
      }, { name: 'hold-input' });

      // BC-C-7 (recovery) — a safer steer clears the hold with a fresh gate.
      await ctx.check('BC-C-7', async (t) => {
        const formOpen = await page.evaluate(() => !!document.querySelector('#safety-hold-steer'));
        if (!formOpen) {
          await page.evaluate(() => {
            const hold = document.querySelector('[data-testid="safety-hold"]');
            const btn = hold && hold.querySelector('[data-verb="redirect"]');
            if (btn) btn.click();
          });
          await page.waitForSelector('#safety-hold-steer', { timeout: 4000 }).catch(() => {});
        }
        await setValue(page, '#safety-hold-steer', 'skip the raw garlic-in-oil step');
        await sleep(60);
        await page.evaluate(() => {
          const hold = document.querySelector('[data-testid="safety-hold"]');
          const btn = [...hold.querySelectorAll('button')].find((b) => /^Send/.test(b.textContent.trim()));
          btn.click();
        });
        const gate = await waitForVerb(page, 'accept', ctx.genTimeout).then(() => true).catch(() => false);
        t.expect(gate, 'safer steer re-proposes and the fresh proposal parks at the gate', { observed: gate ? 'gate' : 'never' });
        const holdGone = await page.evaluate(() => !document.querySelector('[data-testid="safety-hold"]'));
        t.expect(holdGone, 'the safety hold cleared', { observed: holdGone ? 'cleared' : 'still-held' });
      }, { name: 'recovery' });

      // Dish A is now at a gate with a safe proposal. Use it for the
      // human-edit override path (C-27 first — non-committing — then C-8).

      // BC-C-27 — "Go back — I'll change it" preserves the typed edit. [FAILS TODAY]
      await ctx.check('BC-C-27', async (t) => {
        const atGate = await waitForVerb(page, 'accept', 4000).then(() => true).catch(() => false);
        t.expect(atGate, 'at a gate to open take-over', { observed: atGate });
        if (!atGate) return;
        await openTakeover();
        const submitted = await garlicDraftText(dishA);
        await submitTakeover(submitted);
        const sawOverride = await page.waitForSelector('[data-testid="override-prompt"]', { timeout: 8000 })
          .then(() => true).catch(() => false);
        t.expect(sawOverride, 'the garlic-oil take-over escalates to the override prompt', { observed: sawOverride });
        if (!sawOverride) return;
        await clickInOverride(/Go back/i);
        await sleep(250);
        const after = await page.evaluate(() => {
          const ta = document.querySelector('[data-testid="takeover-form"] textarea');
          return { visible: !!ta && ta.offsetParent !== null, value: ta ? ta.value : null };
        });
        t.expect(after.visible, 'after "Go back" the take-over textarea is visible again', { observed: after.visible });
        t.expectEq(after.value, submitted, 'the textarea value is byte-identical to what was typed before submit');
      }, { name: 'main' });

      // BC-C-8 — the 409 warn-and-confirm dialog: focus on the least-destructive
      // option; Escape (and Go back) back out without committing; confirm applies.
      await ctx.check('BC-C-8', async (t) => {
        const garlic = await garlicDraftText(dishA);
        // C-27's "Go back" (and BC-C-8's own Escape / "Go back") correctly leave
        // the gate in TAKE-OVER mode — textarea open, no decide-mode "accept"
        // verb — so each escalation first reloads to the clean pending gate (the
        // safe proposal is still awaiting; C-27 committed nothing) before
        // re-opening take-over. Navigation only; every assertion is unchanged.
        const escalateOverride = async () => {
          await gotoDish(dishA);
          await waitForVerb(page, 'accept', 8000);
          await openTakeover();
          await submitTakeover(garlic);
          return page.waitForSelector('[data-testid="override-prompt"]', { timeout: 8000 })
            .then(() => true).catch(() => false);
        };

        const atGate = await gotoDish(dishA)
          .then(() => waitForVerb(page, 'accept', 8000)).then(() => true).catch(() => false);
        t.expect(atGate, 'gate still pending after "Go back" (nothing committed by C-27)', { observed: atGate });
        if (!atGate) return;
        const vBefore = await versionCount(dishA);

        // (1) escalate → dialog focused on "Go back".
        const sawOverride = await escalateOverride();
        t.expect(sawOverride, 'take-over safety hit → override prompt', { observed: sawOverride });
        if (!sawOverride) return;
        await sleep(200); // the dialog re-claims focus one macrotask after open
        const ov = await readOverride();
        t.expectEq(ov.role, 'alertdialog', 'override prompt is role="alertdialog"');
        t.expect(/Go back/i.test(ov.activeText || ''), 'focus opens on "Go back — I\'ll change it" (least destructive)',
          { observed: ov.activeText });

        // (2) Escape → closes, nothing committed, focus safe.
        await page.keyboard.press('Escape');
        await sleep(200);
        const afterEsc = await page.evaluate(() => ({
          overrideGone: !document.querySelector('[data-testid="override-prompt"]'),
          activeIsBody: document.activeElement === document.body,
          activeConnected: document.activeElement ? document.activeElement.isConnected : false,
        }));
        t.expect(afterEsc.overrideGone, 'Escape closes the override dialog', { observed: afterEsc });
        t.expect(!afterEsc.activeIsBody && afterEsc.activeConnected, 'after Escape focus is attached and not document.body',
          { observed: afterEsc });
        t.expectEq(await versionCount(dishA), vBefore, 'Escape committed nothing (GET /versions unchanged)');

        // (3) the "Go back" path is focus-safe too (same clause).
        await escalateOverride();
        await sleep(200);
        await clickInOverride(/Go back/i);
        await sleep(200);
        const afterBack = await page.evaluate(() => ({
          overrideGone: !document.querySelector('[data-testid="override-prompt"]'),
          activeIsBody: document.activeElement === document.body,
          activeConnected: document.activeElement ? document.activeElement.isConnected : false,
        }));
        t.expect(afterBack.overrideGone, '"Go back" closes the override dialog', { observed: afterBack });
        t.expect(!afterBack.activeIsBody && afterBack.activeConnected, 'after "Go back" focus is attached and not document.body',
          { observed: afterBack });
        t.expectEq(await versionCount(dishA), vBefore, '"Go back" committed nothing (GET /versions unchanged)');

        // (4) re-open + confirm → the trial commits.
        await escalateOverride();
        await sleep(200);
        await clickInOverride(/Use it anyway/i);
        const committed = await waitForVersionCount(dishA, vBefore + 1, 8000);
        t.expect(committed, '"Use it anyway" applies the human edit as exactly one new trial', {
          observed: committed ? `${vBefore + 1} trials` : `still ${await versionCount(dishA)}`,
        });
      }, { name: 'main', deadlineMs: 45000 });

      // =======================================================================
      // BC-C-15 — the allergen and min-temp rules fire too, each with a
      // rule-specific reason. Fresh dish per rule for clean isolation.
      // =======================================================================
      const dishPeanut = await freshDish();
      const peanutSeen = await driveToHold(dishPeanut, 'fold in some peanut butter for extra richness', 'peanut-hold');
      await ctx.check('BC-C-15', async (t) => {
        t.expect(peanutSeen, 'a peanut move renders the safety hold', { observed: peanutSeen ? 'present' : 'never' });
        const h = await readHold();
        if (!h.present) { t.expect(false, 'peanut hold present', { observed: 'never' }); return; }
        t.expect(/peanut/i.test(h.bodyText) && /allergen/i.test(h.bodyText),
          'the hold shows the allergen-specific reason (declared-allergen wording)', { observed: h.reasonSample });
      }, { name: 'peanut' });

      const dishChicken = await freshDish();
      const chickenSeen = await driveToHold(dishChicken, 'leave the rare chicken pink in the centre', 'chicken-hold');
      await ctx.check('BC-C-15', async (t) => {
        t.expect(chickenSeen, 'an under-temp rare-chicken move renders the safety hold', { observed: chickenSeen ? 'present' : 'never' });
        const h = await readHold();
        if (!h.present) { t.expect(false, 'chicken hold present', { observed: 'never' }); return; }
        t.expect(/internal temp(erature)?/i.test(h.bodyText) && /(FSIS|165\s*°?\s*F|74\s*°?\s*C)/i.test(h.bodyText),
          'the hold shows the min-temp-specific reason (FSIS internal-temperature wording)', { observed: h.reasonSample });
      }, { name: 'rare-chicken' });

      // =======================================================================
      // BC-C-28 — a wrong-shape take-over draft (valid JSON, wrong shape) is
      // rejected before commit. Fresh gate per sub-case so the failing
      // steps-deleted commit cannot contaminate the ingredients-string probe.
      // [FAILS TODAY — bare JSON.parse client-side + Go zero-value decode]
      // =======================================================================
      const dishB1 = await freshDish();
      const b1AtGate = await driveToGate(dishB1, 'brighten it with lemon and fresh herbs');
      await ctx.check('BC-C-28', async (t) => {
        t.expect(b1AtGate, 'at a gate for the ingredients-as-string probe', { observed: b1AtGate });
        if (!b1AtGate) return;
        const vBefore = await versionCount(dishB1);
        const d = await api('GET', `/api/dishes/${dishB1}`);
        const badText = JSON.stringify({ ...d.draft, ingredients: 'oops all one string' });
        await openTakeover();
        await submitTakeover(badText);
        await sleep(400);
        const alerts = await visibleAlertTexts();
        t.expect(alerts.length > 0, 'ingredients-as-string: Save blocked with a visible error', { observed: alerts });
        const stayed = await stayedAt(dishB1, vBefore);
        t.expect(stayed, 'ingredients-as-string: no trial committed (GET /versions stays unchanged)',
          { observed: stayed ? `${vBefore} (held)` : `rose to ${await versionCount(dishB1)}` });
      }, { name: 'ingredients-string' });

      const dishB2 = await freshDish();
      const b2AtGate = await driveToGate(dishB2, 'brighten it with lemon and fresh herbs');
      await ctx.check('BC-C-28', async (t) => {
        t.expect(b2AtGate, 'at a gate for the steps-deleted probe', { observed: b2AtGate });
        if (!b2AtGate) return;
        const vBefore = await versionCount(dishB2);
        const d = await api('GET', `/api/dishes/${dishB2}`);
        const noSteps = { ...d.draft };
        delete noSteps.steps;
        await openTakeover();
        await submitTakeover(JSON.stringify(noSteps));
        await sleep(400);
        const alerts = await visibleAlertTexts();
        t.expect(alerts.length > 0, 'steps-deleted: Save blocked with a visible error', { observed: alerts });
        const stayed = await stayedAt(dishB2, vBefore);
        t.expect(stayed, 'steps-deleted: no trial committed (GET /versions stays unchanged)',
          { observed: stayed ? `${vBefore} (held)` : `rose to ${await versionCount(dishB2)}` });
      }, { name: 'steps-deleted' });
    },
  },
];
