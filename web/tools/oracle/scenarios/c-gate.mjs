// Area C — the gate & its decisions (the "main" half of the C criteria that
// live on the decision surface itself, not on a safety hold or an
// alternatives race). Owner criteria: BC-C-1, BC-C-2, BC-C-3, BC-C-4 (gate
// half), BC-C-5, BC-C-6 (gate half), BC-C-9, BC-C-11 (judge), BC-C-13,
// BC-C-16, BC-C-17, BC-C-18, BC-C-19, BC-C-21, BC-C-22, BC-C-23.
//
// Pattern copied verbatim from a-intake.mjs: bounded waits (a state that
// never arrives is an assert FAIL, observed 'never', not a hang), POST counts
// from ctx.net (never server history), synchronous double-dispatch races in
// ONE page.evaluate, sub-checks of one criterion spread across check() calls
// sharing the id (the report ANDs them).
//
// Empirical facts pinned 2026-07-11 against the live stub (READ-ONLY
// internal/llm/stub.go + internal/proposal/diff.go):
//  - Free-text intent (empty moveType) → the server picks seed_expand when no
//    version exists, else iterate_feedback. Both are CREATIVE, so a free-text
//    intent always parks at the gate regardless of the dial (never a
//    deterministic auto-apply). That is the workhorse "give me a gate" driver.
//  - The `spring clean` steer fixture (B4) yields ONE proposal whose diff adds
//    an ingredient (/ingredients/N), edits a step IN PLACE (/steps/0/text +
//    /why), and REMOVES a flavor claim (/flavor_rationale/0) — the exact
//    BC-C-16 recipe. Driven with a NON-flavor-adding move (technique_step) so
//    the flavor removal surfaces as a real `remove` op (a flavor-adding
//    template pairs it into a positional replace instead).
import {
  sleep, clickButton, clickVerb, waitForVerb, setValue, describeActiveElement,
  timelineTrialCount, waitForTimelineTrial, clickTimelineTrial,
} from '../lib/page.mjs';
import { seedTrials, waitForPending } from '../lib/api.mjs';
import { installFaultInjector } from '../lib/net.mjs';

const MOVE_RE = /^\/api\/dishes\/[^/]+\/move$/;
const GATE_RE = /^\/api\/dishes\/[^/]+\/gate$/;

const gotoDish = async (page, base, dishId) => {
  await page.goto(`${base}/dishes/${dishId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#stage-heading', { timeout: 8000 });
};

const dialState = (page) => page.evaluate(() => {
  const sw = document.querySelector('[role="switch"]');
  return sw ? sw.getAttribute('aria-checked') : null;
});

const atGate = (page) => page.evaluate(() => !!document.querySelector('button[data-verb="accept"]'));

const readToast = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-testid="toast"]');
  return el ? { text: el.textContent.trim(), role: el.getAttribute('role') } : null;
});

export const scenarios = [

  // ---------------------------------------------------------------------------
  // c/gate-verbs (fast): the long journey through the gate — one dish, many
  // decisions. Owns BC-C-1/2/3/4/5/6/11/13/16/17/18/22/23.
  // ---------------------------------------------------------------------------
  {
    id: 'c/gate-verbs',
    profile: 'fast',
    criteria: [
      'BC-C-1', 'BC-C-2', 'BC-C-3', 'BC-C-4', 'BC-C-5', 'BC-C-6', 'BC-C-11',
      'BC-C-13', 'BC-C-16', 'BC-C-17', 'BC-C-18', 'BC-C-22', 'BC-C-23',
    ],
    setup: seedTrials(1),
    run: async (ctx, dishId) => {
      const { page, base, net, api } = ctx;
      await gotoDish(page, base, dishId);
      await page.waitForSelector('#cc-intent', { timeout: 8000 });

      // --- journey helpers (closures over ctx) --------------------------------
      // serverEnsureIdle resolves any parked proposal over the API (never the
      // page NetLog — so it can't pollute a POST count) so the dish is idle
      // server-side. The rapid non-reload move/accept cycling of a long journey
      // desyncs the page's expectedMove/SSE bookkeeping; a reset that reloads
      // (below) re-syncs it deterministically, which is why every check starts
      // from a hard reset rather than nursing the previous check's DOM state.
      const serverEnsureIdle = async () => {
        const d = await api('GET', `/api/dishes/${dishId}`).catch(() => null);
        if (d && d.state === 'awaiting_gate') {
          const p = (d.pendingProposals || (d.pendingProposal ? [d.pendingProposal] : [])).filter(Boolean)[0];
          if (p) await api('POST', `/api/dishes/${dishId}/gate`, { proposalId: p.id, verb: 'accept' }).catch(() => {});
        }
      };

      // ensureIdle = resolve server-side + hard reload → a clean idle intent bar
      // with fresh SSE/expectedMove state and no residual banners or open forms.
      const ensureIdle = async () => {
        await serverEnsureIdle();
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#cc-intent', { timeout: ctx.genTimeout });
      };

      // fireIntent submits a free-text intent from the (already idle) bar → a
      // creative proposal parks at the gate (seed_expand/iterate_feedback; both
      // creative, so they park regardless of the dial).
      const fireIntent = async (intent) => {
        await page.type('#cc-intent', intent);
        await clickButton(page, /^Try it/i);
        await waitForVerb(page, 'accept', ctx.genTimeout);
      };

      const driveIntent = async (intent) => { await ensureIdle(); await fireIntent(intent); };

      const openDisclosure = async () => {
        await clickButton(page, /^Try another way/i);
        await waitForVerb(page, 'regenerate', 6000);
      };

      // dispatchAndReload lands a specific move type at the gate deterministically
      // (BC-C-16 needs predictable diffs the free-text classifier can't promise):
      // fire the move over the API, then reload so the pending proposal
      // re-renders at the gate (the BC-D-4 restore seam).
      const dispatchAndReload = async (moveType, steer = '') => {
        await serverEnsureIdle();
        await api('POST', `/api/dishes/${dishId}/move`, { moveType, steer });
        await waitForPending(api, dishId, ctx.genTimeout);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForVerb(page, 'accept', ctx.genTimeout);
      };

      // -----------------------------------------------------------------------
      // BC-C-1 — creative proposals always halt at the gate; /versions unchanged
      // until a verb fires, in BOTH dial states.
      // -----------------------------------------------------------------------
      await ctx.check('BC-C-1', async (t) => {
        // Force the dial ON rather than trust the dish default (BC-C-1 is about
        // the dial-ON behavior, not what the seed happens to default to).
        if (await dialState(page) === 'false') {
          await page.evaluate(() => document.querySelector('[role="switch"]').click());
          await sleep(300);
        }
        t.expectEq(await dialState(page), 'true', 'dial forced ON for the dial-ON run');
        const before = (await api('GET', `/api/dishes/${dishId}/versions`)).versions.length;
        await driveIntent('lean the whole dish smoky and bright');
        t.expect(await atGate(page), 'creative proposal parks at the gate (dial ON)', { observed: 'accept verb present' });
        const after = (await api('GET', `/api/dishes/${dishId}/versions`)).versions.length;
        t.expectEq(after, before, 'dial ON: /versions unchanged while the proposal is parked');
        await clickVerb(page, 'accept');
        await page.waitForSelector('#cc-intent', { timeout: ctx.genTimeout });
      }, { name: 'dial-on' });

      // -----------------------------------------------------------------------
      // BC-C-2 — all six verbs reachable by mouse and keyboard; roving arrows.
      // -----------------------------------------------------------------------
      await ctx.check('BC-C-2', async (t) => {
        await driveIntent('add a bright herby finish');
        const decide = await page.evaluate(() => {
          const vis = (v) => { const b = document.querySelector(`button[data-verb="${v}"]`); return !!b && b.offsetParent !== null; };
          return { accept: vis('accept'), edit: vis('edit') };
        });
        t.expect(decide.accept && decide.edit, 'Use it + Tweak it visible (rendered, not merely present) up front', { observed: decide });

        // Roving tabindex on the decide row (APG toolbar): Arrow keys move focus.
        await page.focus('button[data-verb="accept"]');
        await page.keyboard.press('ArrowRight');
        const right = await describeActiveElement(page);
        t.expectEq(right.verb, 'edit', 'ArrowRight roves accept→edit in the decide toolbar');
        await page.keyboard.press('ArrowLeft');
        const left = await describeActiveElement(page);
        t.expectEq(left.verb, 'accept', 'ArrowLeft roves edit→accept (wrap-aware)');

        await openDisclosure();
        const more = await page.evaluate(() =>
          ['regenerate', 'alternatives', 'redirect', 'take_over'].map((v) => !!document.querySelector(`button[data-verb="${v}"]`)));
        t.expect(more.every(Boolean), 'disclosure reveals regenerate / alternatives / redirect / take_over', { observed: more });
        await page.focus('button[data-verb="regenerate"]');
        await page.keyboard.press('ArrowRight');
        const another = await describeActiveElement(page);
        t.expectEq(another.verb, 'alternatives', 'ArrowRight roves within the disclosure toolbar too');
        await ensureIdle();
      });

      // -----------------------------------------------------------------------
      // BC-C-22 — the "Try another way" disclosure carries aria-expanded.
      // [LIKELY FAILS TODAY — aria-expanded appears nowhere in the shipped bar.]
      // -----------------------------------------------------------------------
      await ctx.check('BC-C-22', async (t) => {
        await driveIntent('give it a crunchy topping that survives the oven');
        const closed = await page.evaluate(() => {
          const btn = [...document.querySelectorAll('#cc-gate button')].find((b) => /Try another way/.test(b.textContent));
          return btn ? btn.getAttribute('aria-expanded') : '(no toggle found)';
        });
        t.expectEq(closed, 'false', 'disclosure toggle exposes aria-expanded="false" when closed');
        await clickButton(page, /^Try another way/i);
        await waitForVerb(page, 'regenerate', 6000);
        const fourPresent = await page.evaluate(() =>
          ['regenerate', 'alternatives', 'redirect', 'take_over'].every((v) => !!document.querySelector(`button[data-verb="${v}"]`)));
        t.expect(fourPresent, 'four verbs revealed on activation');
        const opened = await page.evaluate(() => {
          const btn = [...document.querySelectorAll('#cc-gate button')].find((b) => b.getAttribute('aria-expanded') !== null);
          return btn ? btn.getAttribute('aria-expanded') : '(no aria-expanded anywhere in the gate)';
        });
        t.expectEq(opened, 'true', 'aria-expanded="true" once the four verbs are revealed');
        await ensureIdle();
      });

      // -----------------------------------------------------------------------
      // BC-C-16 — inline add / change / remove preview with SR annotations.
      // ONE proposal (technique_step + the `spring clean` fixture) carries all
      // three markup kinds the contract's recipe demands: an ADDED ingredient,
      // an IN-PLACE-CHANGED step (steps/0), and a REMOVED flavor claim. Driven
      // via the API + reload for a deterministic diff; technical view OFF.
      // -----------------------------------------------------------------------
      await ctx.check('BC-C-16', async (t) => {
        await dispatchAndReload('technique_step', 'spring clean');
        const r = await page.evaluate(() => {
          const struck = (el) => !!(el && el.querySelector('.line-through'));
          const ings = [...document.querySelectorAll('[data-testid="ingredient-row"]')];
          const steps = [...document.querySelectorAll('[data-testid="step-row"]')];
          const flavors = [...document.querySelectorAll('[data-testid="flavor-row"]')];
          const addedIng = ings.find((x) => /row-add/.test(x.className));
          const chStep = steps.find((x) => /row-change/.test(x.className));
          const remFlavor = flavors.find((x) => /removed:/.test(x.textContent));
          return {
            addedIng: addedIng ? { text: addedIng.textContent.trim().slice(0, 60), New: /New/.test(addedIng.textContent), added: /added:/.test(addedIng.textContent) } : null,
            chStep: chStep ? { text: chStep.textContent.trim().slice(0, 60), was: /was:/.test(chStep.textContent), now: /now:/.test(chStep.textContent), struck: struck(chStep) } : null,
            remFlavor: remFlavor ? { text: remFlavor.textContent.trim().slice(0, 60), removed: /removed:/.test(remFlavor.textContent), struck: struck(remFlavor) } : null,
          };
        });
        // Added ingredient — "New" marker + sr-only "added:".
        t.expect(!!r.addedIng, 'added ingredient row rendered (row-add)', { observed: r.addedIng });
        if (r.addedIng) {
          t.expect(r.addedIng.New, 'added ingredient carries a visible "New" marker');
          t.expect(r.addedIng.added, 'added ingredient carries an SR-only "added:" announcement');
        }
        // Changed step (in place) — old struck through + new value + sr-only
        // was/now. (This is the markup that was previously unreachable.)
        t.expect(!!r.chStep, 'changed step row rendered (row-change)', { observed: r.chStep });
        if (r.chStep) {
          t.expect(r.chStep.struck, 'changed step shows the OLD value struck through');
          t.expect(r.chStep.was, 'changed step carries an SR-only "was:" label');
          t.expect(r.chStep.now, 'changed step carries an SR-only "now:" label');
        }
        // Removed flavor — struck through + sr-only "removed:".
        t.expect(!!r.remFlavor, 'removed flavor row rendered', { observed: r.remFlavor });
        if (r.remFlavor) {
          t.expect(r.remFlavor.struck, 'removed flavor is struck through');
          t.expect(r.remFlavor.removed, 'removed flavor carries an SR-only "removed:" announcement');
        }
        await clickVerb(page, 'accept');
        await page.waitForSelector('#cc-intent', { timeout: ctx.genTimeout });
      });

      // -----------------------------------------------------------------------
      // BC-C-18 — each gate sub-form moves focus into its first input.
      // -----------------------------------------------------------------------
      await ctx.check('BC-C-18', async (t) => {
        await driveIntent('nudge the seasoning a little');
        // Tweak it (opens from decide mode).
        await clickVerb(page, 'edit');
        await page.waitForSelector('[data-testid="tweak-form"]', { timeout: 4000 });
        await sleep(120);
        const tweakAE = await describeActiveElement(page);
        t.expectEq(tweakAE.tag, 'input', 'Tweak it → focus lands in the first input', { observed: tweakAE });
        await clickButton(page, /^Cancel$/);
        await waitForVerb(page, 'accept', 4000);
        // Ask for changes (redirect).
        await openDisclosure();
        await clickVerb(page, 'redirect');
        await page.waitForSelector('#gate-redirect-input', { timeout: 4000 });
        await sleep(120);
        const redirAE = await describeActiveElement(page);
        t.expectEq(redirAE.id, 'gate-redirect-input', 'Ask for changes → focus lands in the redirect input', { observed: redirAE });
        await clickButton(page, /^Cancel$/);
        await waitForVerb(page, 'accept', 4000);
        // Edit it myself (take-over).
        await openDisclosure();
        await clickVerb(page, 'take_over');
        await page.waitForSelector('[data-testid="takeover-form"] textarea', { timeout: 4000 });
        await sleep(120);
        const takeAE = await describeActiveElement(page);
        t.expectEq(takeAE.tag, 'textarea', 'Edit it myself → focus lands in the textarea', { observed: takeAE });
        await ensureIdle();
      });

      // -----------------------------------------------------------------------
      // BC-C-6 (gate half) — Ask-for-changes Send guarded empty; a real steer
      // re-proposes. (The safety-hold input half is owned by c/safety.)
      // -----------------------------------------------------------------------
      await ctx.check('BC-C-6', async (t) => {
        await driveIntent('take it somewhere new entirely');
        await openDisclosure();
        await clickVerb(page, 'redirect');
        await page.waitForSelector('#gate-redirect-input', { timeout: 4000 });
        const sendState = () => page.evaluate(() => {
          const btn = [...document.querySelectorAll('[data-testid="redirect-form"] button')].find((b) => /^Send/.test(b.textContent.trim()));
          return btn ? btn.disabled : null;
        });
        t.expect(await sendState() === true, 'Send disabled while the steer is empty');
        await setValue(page, '#gate-redirect-input', 'lean into charred citrus and smoke');
        await sleep(120);
        t.expect(await sendState() === false, 'Send enabled once the steer is non-empty');
        const mark = net.mark();
        await clickButton(page, /^Send$/);
        await waitForVerb(page, 'accept', ctx.genTimeout);
        t.expectEq(net.count({ method: 'POST', pathRe: GATE_RE, since: mark }), 1, 'redirect dispatched exactly one POST …/gate');
        t.expect(await atGate(page), 'a fresh proposal re-proposed and parked at the gate', { observed: 'accept verb present' });
        await ensureIdle();
      });

      // -----------------------------------------------------------------------
      // BC-C-5 — take-over validates JSON; invalid blocks, valid commits with a
      // role="status" confirmation (highest-stakes commit must not be silent).
      // -----------------------------------------------------------------------
      await ctx.check('BC-C-5', async (t) => {
        await driveIntent('make it a touch richer');
        await openDisclosure();
        await clickVerb(page, 'take_over');
        await page.waitForSelector('[data-testid="takeover-form"] textarea', { timeout: 4000 });
        // Invalid JSON → role=alert, no dispatch.
        const markBad = net.mark();
        await setValue(page, '[data-testid="takeover-form"] textarea', '{oops');
        await clickButton(page, /^Save draft/i);
        await sleep(250);
        const bad = await page.evaluate(() => {
          // The error must actually carry role="alert" (the AT-announcement
          // clause) — not merely exist by id.
          const el = [...document.querySelectorAll('[data-testid="takeover-form"] [role="alert"]')]
            .find((e) => e.offsetParent !== null && (e.textContent || '').trim());
          return { role: el ? el.getAttribute('role') : null, text: el ? el.textContent.trim().slice(0, 80) : null, formOpen: !!document.querySelector('[data-testid="takeover-form"]') };
        });
        t.expectEq(bad.role, 'alert', 'invalid JSON → the visible error carries role="alert"');
        t.expect(!!bad.text, 'the role=alert error has visible text', { observed: bad });
        t.expect(bad.formOpen, 'take-over form stays open (Save blocked)');
        t.expectEq(net.count({ method: 'POST', pathRe: GATE_RE, since: markBad }), 0, 'invalid JSON dispatched no gate POST');
        // Valid JSON (edit the title) → new trial + role=status confirmation.
        // Rebuild from the server draft — the textarea still holds "{oops".
        const obj = (await api('GET', `/api/dishes/${dishId}`)).draft;
        obj.title = 'Takeover applied — sea-salt finish';
        await setValue(page, '[data-testid="takeover-form"] textarea', JSON.stringify(obj, null, 2));
        const before = await timelineTrialCount(page);
        const markGood = net.mark();
        await clickButton(page, /^Save draft/i);
        await waitForTimelineTrial(page, before + 1, ctx.genTimeout);
        const after = await timelineTrialCount(page);
        t.expectEq(after, before + 1, 'valid take-over commits exactly one new trial');
        t.expectEq(net.count({ method: 'POST', pathRe: GATE_RE, since: markGood }), 1, 'valid take-over dispatched one gate POST');
        const toast = await readToast(page);
        t.expect(!!toast && toast.role === 'status' && /saved to the timeline/.test(toast.text),
          'a role="status" confirmation fires on the human-edit commit', { observed: toast });
        const draft = await api('GET', `/api/dishes/${dishId}`);
        t.expectEq(draft.draft.title, obj.title, 'the committed draft carries the human edit');
        await ensureIdle();
      });

      // -----------------------------------------------------------------------
      // BC-C-13 — Tweak it: pre-seeded, edited value commits one trial with a
      // role=status confirmation; a content-free edit is guarded.
      // [empty-guard clause FAILS TODAY — submitTweak dispatches unconditionally.]
      // -----------------------------------------------------------------------
      await ctx.check('BC-C-13', async (t) => {
        await driveIntent('brighten the whole thing');
        const before = await timelineTrialCount(page);
        // One input per EDITABLE (non-remove) op — count from the pending
        // proposal, not just "≥1".
        const detailBefore = await api('GET', `/api/dishes/${dishId}`);
        const propOps = (((detailBefore.pendingProposals || [detailBefore.pendingProposal])[0] || {}).change) || [];
        const editableOps = propOps.filter((o) => o.op !== 'remove').length;
        await clickVerb(page, 'edit');
        await page.waitForSelector('[data-testid="tweak-form"]', { timeout: 4000 });
        const seed = await page.evaluate(() => {
          const inputs = [...document.querySelectorAll('[data-testid="tweak-form"] input')];
          return { count: inputs.length, first: inputs[0] ? inputs[0].value : null };
        });
        t.expectEq(seed.count, editableOps, 'tweak form shows exactly one input per editable (non-remove) op', { observed: { inputs: seed.count, editableOps } });
        t.expect(!!seed.first, 'the first tweak field is pre-seeded with the proposal value', { observed: seed.first });
        const edited = 'sweet char against a cold, sharp yogurt — tweaked';
        await setValue(page, '[data-testid="tweak-form"] input', edited);
        const mark = net.mark();
        await clickButton(page, /^Keep with edit/i);
        await waitForTimelineTrial(page, before + 1, ctx.genTimeout);
        const after = await timelineTrialCount(page);
        t.expectEq(after, before + 1, 'the edited tweak commits exactly one new trial');
        t.expectEq(net.count({ method: 'POST', pathRe: GATE_RE, since: mark }), 1, 'exactly one gate POST');
        const toast = await readToast(page);
        t.expect(!!toast && toast.role === 'status' && /saved to the timeline/.test(toast.text),
          'a role="status" confirmation fires (parity with the accept toast)', { observed: toast });
        const draft = await api('GET', `/api/dishes/${dishId}`);
        t.expectEq(draft.draft.concept, edited, 'the committed trial reflects the edited value');
        await ensureIdle();
      }, { name: 'edit-commits' });

      await ctx.check('BC-C-13', async (t) => {
        await driveIntent('shift the direction once more');
        await clickVerb(page, 'edit');
        await page.waitForSelector('[data-testid="tweak-form"]', { timeout: 4000 });
        // Clear every field.
        await page.evaluate(() => {
          const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          document.querySelectorAll('[data-testid="tweak-form"] input').forEach((el) => {
            set.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true }));
          });
        });
        // Was Save visibly blocked BEFORE the click?
        const saveBefore = await page.evaluate(() => {
          const save = [...document.querySelectorAll('[data-testid="tweak-form"] button')].find((b) => /Keep with edit/.test(b.textContent));
          return save ? (save.disabled || save.getAttribute('aria-disabled') === 'true') : null;
        });
        const before = await timelineTrialCount(page);
        const mark = net.mark();
        await clickButton(page, /^Keep with edit/i);
        await sleep(600);
        const posts = net.count({ method: 'POST', pathRe: GATE_RE, since: mark });
        const after = await timelineTrialCount(page);
        const fb = await page.evaluate(() => {
          const form = document.querySelector('[data-testid="tweak-form"]');
          const save = form && [...form.querySelectorAll('button')].find((b) => /Keep with edit/.test(b.textContent));
          const saveDisabled = save ? (save.disabled || save.getAttribute('aria-disabled') === 'true') : false;
          const msg = form ? [...form.querySelectorAll('[role="alert"]')].some((e) => e.offsetParent !== null && (e.textContent || '').trim()) : false;
          return { formOpen: !!form, saveDisabled, msg };
        });
        t.expectEq(posts, 0, 'a content-free tweak fires no gate POST (empty-guard)');
        // The block must be VISIBLE (disabled Save or a validation message) — a
        // silent non-dispatch is itself the silent-no-op defect class (BC-A-4/9).
        t.expect(saveBefore === true || fb.saveDisabled || fb.msg,
          'the empty tweak is visibly blocked — disabled Save or a validation message, not silently', { observed: { saveBefore, ...fb } });
        t.expect(fb.formOpen || after === before, 'submit is blocked — form stays open or no trial commits', { observed: { posts, before, after, formOpen: fb.formOpen } });
        await ensureIdle();
      }, { name: 'empty-guard' });

      // -----------------------------------------------------------------------
      // BC-C-4 (gate half) — keyboard map safe: letters typed in a field never
      // fire a verb; Escape is never destructive. (Escape-while-proposing lives
      // in b/focus-traps.)
      // -----------------------------------------------------------------------
      await ctx.check('BC-C-4', async (t) => {
        await driveIntent('rethink the sauce entirely');
        await openDisclosure();
        await clickVerb(page, 'redirect');
        await page.waitForSelector('#gate-redirect-input', { timeout: 4000 });
        await page.focus('#gate-redirect-input');
        const mark = net.mark();
        // Type a string covering ALL SIX verb letters a/e/g/l/r/t.
        const TYPED = 'aeglrt';
        await page.type('#gate-redirect-input', TYPED);
        await sleep(150);
        const typed = await page.evaluate(() => document.querySelector('#gate-redirect-input').value);
        t.expectEq(typed, TYPED, 'all six verb letters land as text — none intercepted as a shortcut');
        t.expectEq(net.count({ method: 'POST', pathRe: GATE_RE, since: mark }), 0, 'no verb fired while typing in a text field');
        t.expect(await page.evaluate(() => !!document.querySelector('[data-testid="redirect-form"]')),
          'the redirect form is still open — no destructive verb fired');
        // Escape twice: blur the field, then fall the mode back to decide.
        await page.keyboard.press('Escape'); await sleep(120);
        await page.keyboard.press('Escape'); await sleep(180);
        const decideBack = await atGate(page);
        const ae = await page.evaluate(() => {
          const el = document.activeElement;
          const gate = document.querySelector('#cc-gate');
          return {
            isBody: el === document.body, isConnected: el ? el.isConnected : false,
            inGate: !!(el && gate && gate.contains(el)),
            verb: el && el.getAttribute ? el.getAttribute('data-verb') : null,
            text: (el && el.textContent || '').trim().slice(0, 40),
          };
        });
        t.expect(decideBack, 'Escape returns to decide mode (proposal still pending)');
        t.expect(!ae.isBody && ae.isConnected && ae.inGate,
          'activeElement is a defined gate control inside #cc-gate — not document.body', { observed: ae });
        t.expectEq(net.count({ method: 'POST', pathRe: GATE_RE, since: mark }), 0, 'Escape never fired a destructive verb (no accept, no cancel)');
        await ensureIdle();
      });

      // -----------------------------------------------------------------------
      // BC-C-3 — accept commits exactly one trial under a double-click, and
      // announces "Use it — saved to the timeline" via role=status.
      // -----------------------------------------------------------------------
      await ctx.check('BC-C-3', async (t) => {
        await driveIntent('add a savory depth to the base');
        const before = await timelineTrialCount(page);
        // Synchronous double-click. The gate's async `pending` lock cannot stop
        // a truly synchronous second click, but the orchestrator is idempotent
        // by proposalId (resolved-cache) so it still commits exactly one trial
        // with no error surfaced — which is what the contract asserts (it does
        // not count POSTs).
        await page.evaluate(() => {
          const b = document.querySelector('button[data-verb="accept"]');
          b.click(); b.click();
        });
        await waitForTimelineTrial(page, before + 1, ctx.genTimeout);
        await sleep(300);
        const after = await timelineTrialCount(page);
        t.expectEq(after, before + 1, 'double-click accept commits exactly one trial (server idempotent)');
        const toast = await readToast(page);
        // The Check requires only text containing "saved to the timeline" + a
        // role=status/aria-live (not a specific verb label).
        t.expect(!!toast && toast.role === 'status' && /saved to the timeline/.test(toast.text),
          'accept confirmation toast visible, containing "saved to the timeline", carrying role=status', { observed: toast });
        const banners = await page.evaluate(() => ({
          moveFailed: !!document.querySelector('[data-testid="move-failed-banner"]'),
          errorAlerts: [...document.querySelectorAll('[role="alert"]')]
            .filter((el) => el.offsetParent !== null && /Dismiss/.test(el.textContent))
            .map((el) => el.textContent.trim().slice(0, 60)),
        }));
        t.expect(!banners.moveFailed && banners.errorAlerts.length === 0, 'no error banner surfaces from the double-click', { observed: banners });
      });

      // -----------------------------------------------------------------------
      // BC-C-17 — post-verb focus lands on the stage heading (after accept,
      // after a tweak edit, and after "Back to current").
      // -----------------------------------------------------------------------
      await ctx.check('BC-C-17', async (t) => {
        // after accept
        await driveIntent('one more considered pass');
        await clickVerb(page, 'accept');
        await page.waitForSelector('#cc-intent', { timeout: ctx.genTimeout });
        await sleep(150);
        const afterAccept = await describeActiveElement(page);
        t.expectEq(afterAccept.id, 'stage-heading', 'focus on #stage-heading after Use it', { observed: afterAccept });

        // after a completed tweak edit
        await driveIntent('another considered pass');
        await clickVerb(page, 'edit');
        await page.waitForSelector('[data-testid="tweak-form"]', { timeout: 4000 });
        await setValue(page, '[data-testid="tweak-form"] input', 'tweak then focus check');
        await clickButton(page, /^Keep with edit/i);
        await page.waitForSelector('#cc-intent', { timeout: ctx.genTimeout });
        await sleep(150);
        const afterTweak = await describeActiveElement(page);
        t.expectEq(afterTweak.id, 'stage-heading', 'focus on #stage-heading after a Tweak it edit', { observed: afterTweak });

        // after "Back to current" restores the live view (BC-D-2 seam)
        await ensureIdle();
        await clickTimelineTrial(page, 1);
        await page.waitForFunction(() => /Viewing a past trial/.test(document.body.textContent), { timeout: 4000 })
          .catch(() => {});
        await clickButton(page, /^Back to current$/);
        await page.waitForSelector('#cc-intent', { timeout: ctx.genTimeout }).catch(() => {});
        await sleep(180);
        const afterBack = await describeActiveElement(page);
        t.expectEq(afterBack.id, 'stage-heading', 'focus on #stage-heading after Back to current', { observed: afterBack });
      });

      // -----------------------------------------------------------------------
      // BC-C-1 (dial OFF) — creative still parks; /versions unchanged.
      // -----------------------------------------------------------------------
      await ctx.check('BC-C-1', async (t) => {
        await ensureIdle();
        if (await dialState(page) === 'true') {
          await page.evaluate(() => document.querySelector('[role="switch"]').click());
          await sleep(300);
        }
        t.expectEq(await dialState(page), 'false', 'dial toggled OFF');
        const before = (await api('GET', `/api/dishes/${dishId}/versions`)).versions.length;
        await fireIntent('a bold new direction for the plate');
        t.expect(await atGate(page), 'creative proposal parks at the gate (dial OFF)', { observed: 'accept verb present' });
        const after = (await api('GET', `/api/dishes/${dishId}/versions`)).versions.length;
        t.expectEq(after, before, 'dial OFF: /versions unchanged while parked (no creative auto-apply)');
        await clickVerb(page, 'accept');
        await page.waitForSelector('#cc-intent', { timeout: ctx.genTimeout });
      }, { name: 'dial-off' });

      // -----------------------------------------------------------------------
      // BC-C-23 — unpreviewable ops disclosed; accept still applies (dial OFF,
      // "Scale it" carries a constraints.servings op → the disclosure).
      // -----------------------------------------------------------------------
      await ctx.check('BC-C-23', async (t) => {
        await ensureIdle();
        if (await dialState(page) === 'true') {
          await page.evaluate(() => document.querySelector('[role="switch"]').click());
          await sleep(300);
        }
        t.expectEq(await dialState(page), 'false', 'dial OFF so the deterministic scale parks at the gate');
        const beforeServings = (await api('GET', `/api/dishes/${dishId}`)).draft.constraints.servings;
        await clickButton(page, /^Scale servings/i);
        await page.waitForSelector('#cc-scale-servings', { timeout: 4000 });
        await setValue(page, '#cc-scale-servings', String((beforeServings || 4) * 2));
        await clickButton(page, /^Scale it/i);
        await waitForVerb(page, 'accept', ctx.genTimeout);
        const unprev = await page.evaluate(() => {
          const el = document.querySelector('[data-testid="dish-card-unpreviewable"]');
          return el ? { text: el.textContent.trim().slice(0, 80), visible: el.offsetParent !== null } : null;
        });
        t.expect(!!unprev && unprev.visible, 'the "Some changes could not be previewed" disclosure renders', { observed: unprev });
        await clickVerb(page, 'accept');
        await page.waitForSelector('#cc-intent', { timeout: ctx.genTimeout });
        const afterServings = (await api('GET', `/api/dishes/${dishId}`)).draft.constraints.servings;
        t.expect(afterServings > beforeServings, 'accepting applied the unpreviewable change (servings updated on the server)',
          { observed: { beforeServings, afterServings } });
      });

      // -----------------------------------------------------------------------
      // BC-C-11 (judge) — verbs read as culinary decisions. Stills of the gate
      // + open disclosure in light AND dark.
      // -----------------------------------------------------------------------
      try {
        await ensureIdle();
        // back to a known theme baseline is unnecessary (light is the pinned
        // default); capture light, cycle to dark, capture, cycle back.
        await driveIntent('a plate worth photographing');
        await ctx.judgeStill('BC-C-11', 'gate-decide-light');
        await openDisclosure();
        await ctx.judgeStill('BC-C-11', 'gate-disclosure-light');
        await page.keyboard.press('Escape');
        await waitForVerb(page, 'accept', 6000);
        const cycleTheme = async () => {
          await page.evaluate(() => {
            const b = [...document.querySelectorAll('button')].find((x) => /^Theme:/.test(x.textContent.trim()));
            if (b) b.click();
          });
          await sleep(300);
        };
        await cycleTheme(); // light → dark
        await ctx.judgeStill('BC-C-11', 'gate-decide-dark');
        await openDisclosure();
        await ctx.judgeStill('BC-C-11', 'gate-disclosure-dark');
        await page.keyboard.press('Escape');
        await waitForVerb(page, 'accept', 6000);
        await cycleTheme(); // dark → system
        await cycleTheme(); // system → light
        await ensureIdle();
      } catch (e) {
        // judge stills are best-effort evidence; never fail the scenario body.
      }
    },
  },

  // ---------------------------------------------------------------------------
  // c/shortcuts (fast): BC-C-19 — single-key shortcuts disableable + remappable.
  // ---------------------------------------------------------------------------
  {
    id: 'c/shortcuts',
    profile: 'fast',
    // Seeded by hand (not via the scenario's gateShortcuts field): the page
    // factory's evaluateOnNewDocument re-applies that seed on EVERY navigation,
    // which would clobber the remap on reload. With the field null, our own
    // localStorage writes survive the reload the remap needs.
    gateShortcuts: null,
    criteria: ['BC-C-19'],
    setup: seedTrials(1),
    run: async (ctx, dishId) => {
      const { page, base, net } = ctx;
      await gotoDish(page, base, dishId);
      // Seed shortcuts DISABLED, then reload so GateBar reads it at mount.
      await page.evaluate(() => localStorage.setItem('capycook-gate-shortcuts', JSON.stringify({ enabled: false })));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('#cc-intent', { timeout: 8000 });

      const driveGate = async (intent) => {
        await page.type('#cc-intent', intent);
        await clickButton(page, /^Try it/i);
        await waitForVerb(page, 'accept', ctx.genTimeout);
      };

      // Disabled: none of the six letters dispatches; no aria-keyshortcuts/hints.
      await ctx.check('BC-C-19', async (t) => {
        await driveGate('give me a shortcut probe');
        const before = await timelineTrialCount(page);
        const mark = net.mark();
        await page.evaluate(() => document.getElementById('stage-heading')?.focus());
        for (const k of ['a', 'e', 'g', 'l', 'r', 't']) { await page.keyboard.press(k); await sleep(60); }
        await sleep(300);
        t.expectEq(net.count({ method: 'POST', pathRe: GATE_RE, since: mark }), 0, 'disabled shortcuts: no verb dispatched by A/E/G/L/R/T');
        t.expectEq(await timelineTrialCount(page), before, 'no trial committed by the letter keys');
        t.expect(await atGate(page), 'still at the gate — accept never fired');
        const ks = await page.evaluate(() => document.querySelectorAll('#cc-gate [aria-keyshortcuts]').length);
        t.expectEq(ks, 0, 'no aria-keyshortcuts / hint glyphs render while shortcuts are disabled');
      }, { name: 'disabled' });

      // Remapped: accept → "x". "x" fires accept; "a" does not; the hint shows X.
      await ctx.check('BC-C-19', async (t) => {
        await page.evaluate(() => localStorage.setItem('capycook-gate-shortcuts',
          JSON.stringify({ enabled: true, map: { accept: 'x' } })));
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForVerb(page, 'accept', ctx.genTimeout); // pending proposal restored at the gate
        const before = await timelineTrialCount(page);

        await page.evaluate(() => document.getElementById('stage-heading')?.focus());
        const markA = net.mark();
        await page.keyboard.press('a');
        await sleep(300);
        t.expectEq(net.count({ method: 'POST', pathRe: GATE_RE, since: markA }), 0, "'a' does not fire accept after the remap");

        const hint = await page.evaluate(() => {
          const b = document.querySelector('button[data-verb="accept"]');
          return b ? { text: b.textContent.trim(), ks: b.getAttribute('aria-keyshortcuts') } : null;
        });
        t.expect(!!hint && /X/.test(hint.text), 'the accept button hint shows X', { observed: hint });
        t.expectEq(hint && hint.ks, 'x', 'aria-keyshortcuts on accept reflects the remapped key');

        await page.evaluate(() => document.getElementById('stage-heading')?.focus());
        const markX = net.mark();
        await page.keyboard.press('x');
        await waitForTimelineTrial(page, before + 1, ctx.genTimeout);
        t.expectEq(net.count({ method: 'POST', pathRe: GATE_RE, since: markX }), 1, "'x' fires accept after the remap");
        t.expectEq(await timelineTrialCount(page), before + 1, "the remapped 'x' committed exactly one trial");
      }, { name: 'remapped' });
    },
  },

  // ---------------------------------------------------------------------------
  // c/gate-busy (live-sim): BC-C-9 — busy verb shows aria-disabled + spinner,
  // no double-fire. Live-sim so the respawned move stays in flight long enough
  // to observe, but the busy-verb window is captured by a pre-armed observer.
  // ---------------------------------------------------------------------------
  {
    id: 'c/gate-busy',
    profile: 'live-sim',
    criteria: ['BC-C-9'],
    setup: seedTrials(1),
    run: async (ctx, dishId) => {
      const { page, base, net } = ctx;
      await gotoDish(page, base, dishId);
      await page.waitForSelector('#cc-intent', { timeout: 8000 });

      // Drive a creative proposal to the gate (waits out the 25s live-sim window).
      await page.type('#cc-intent', 'a slow-simmered depth worth the wait');
      await clickButton(page, /^Try it/i);
      await waitForVerb(page, 'accept', ctx.genTimeout);

      await ctx.check('BC-C-9', async (t) => {
        await clickButton(page, /^Try another way/i);
        await waitForVerb(page, 'regenerate', 6000);

        // Arm an observer BEFORE the click: it records the pending verb's busy
        // state the instant the gate spinner mounts — before the gate unmounts
        // into the proposing card a few ms later.
        await page.evaluate(() => {
          window.__busyCap = null;
          const scan = () => {
            if (window.__busyCap) return;
            const sp = document.querySelector('[data-testid="gate-spinner"]');
            if (!sp) return;
            const btn = sp.closest('button[data-verb]');
            if (!btn) return;
            window.__busyCap = {
              verb: btn.getAttribute('data-verb'),
              ariaDisabled: btn.getAttribute('aria-disabled'),
              nativeDisabled: btn.disabled,
              hasSpinner: !!btn.querySelector('[data-testid="gate-spinner"]'),
            };
          };
          window.__busyMo = new MutationObserver(scan);
          window.__busyMo.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
          scan();
        });

        const mark = net.mark();
        // "Twice fast", the way a user actually double-clicks: two DISTINCT
        // click events with a real gap between them (separate evaluates, a CDP
        // round-trip apart). That is the race the gate's async `pending` lock is
        // built for — the first click commits `pending`, so the second is
        // blocked (or the gate has already unmounted into proposing). A single
        // synchronous `click();click()` in one tick would defeat the async lock,
        // but no real double-click can land two events inside one React commit.
        await page.evaluate(() => { const b = document.querySelector('button[data-verb="regenerate"]'); if (b) b.click(); });
        await sleep(40);
        await page.evaluate(() => { const b = document.querySelector('button[data-verb="regenerate"]'); if (b) b.click(); });
        // Let the respawned move take over the surface (or the gate vanish).
        await page.waitForFunction(
          () => !!document.querySelector('[data-testid="proposing-card"]') || !document.querySelector('button[data-verb="regenerate"]'),
          { timeout: 10000 },
        ).catch(() => {});
        const busy = await page.evaluate(() => window.__busyCap);

        t.expectEq(net.count({ method: 'POST', pathRe: GATE_RE, since: mark }), 1, 'double-click regenerate → exactly one POST …/gate (no double-fire)');
        t.expect(!!busy, 'busy state captured at spinner render', { observed: busy });
        if (busy) {
          t.expectEq(busy.verb, 'regenerate', 'the spinner sits on the pending verb');
          t.expectEq(busy.ariaDisabled, 'true', 'the pending verb is aria-disabled while busy');
          t.expectEq(busy.nativeDisabled, false, 'never native disabled — the control stays announced to AT');
          t.expect(busy.hasSpinner, 'a spinner is shown on the verb');
        }
      });
    },
  },

  // ---------------------------------------------------------------------------
  // c/gate-fail (fast + fault injection): BC-C-21 — a failed gate submission
  // preserves the typed steer / JSON / tweak value.
  // [FAILS TODAY — GateBar.dispatch flips back to decide mode + re-seeds forms
  //  fresh regardless of outcome, so the typed input is discarded.]
  // ---------------------------------------------------------------------------
  {
    id: 'c/gate-fail',
    profile: 'fast',
    criteria: ['BC-C-21'],
    setup: seedTrials(1),
    run: async (ctx, dishId) => {
      const { page, base } = ctx;
      await gotoDish(page, base, dishId);
      await page.waitForSelector('#cc-intent', { timeout: 8000 });

      const openDisclosure = async () => {
        await clickButton(page, /^Try another way/i);
        await waitForVerb(page, 'regenerate', 6000);
      };

      // Reset the gate to decide mode between sub-checks. Today the failed
      // submit auto-returns to decide, but the B4 fix will leave the form OPEN
      // (that is the whole point) — so each sub-check must resolve back to
      // decide itself rather than assume the previous one did (mirrors BC-C-18's
      // explicit Cancel/Escape between sub-forms). Escape blurs a focused field
      // first, then falls a form mode back to decide; the pending proposal
      // survives (no verb fires).
      const toDecide = async () => {
        for (let i = 0; i < 4; i++) {
          if (await page.$('button[data-verb="accept"]')) return;
          await page.keyboard.press('Escape');
          await sleep(150);
        }
      };

      // One creative proposal parks at the gate; each fault-aborted submit
      // leaves it pending (the server never processed it), so all three forms
      // exercise the same proposal.
      await page.type('#cc-intent', 'a distinctive starting point');
      await clickButton(page, /^Try it/i);
      await waitForVerb(page, 'accept', ctx.genTimeout);

      // Redirect failure.
      await ctx.check('BC-C-21', async (t) => {
        await openDisclosure();
        await clickVerb(page, 'redirect');
        await page.waitForSelector('#gate-redirect-input', { timeout: 4000 });
        const STEER = 'keep the salt but add brightness instead';
        await setValue(page, '#gate-redirect-input', STEER);
        const removeFaults = await installFaultInjector(page, [{ method: 'POST', pathRe: GATE_RE, action: 'abort' }]);
        try {
          await clickButton(page, /^Send$/);
          await sleep(1200);
          const st = await page.evaluate(() => {
            const el = document.querySelector('#gate-redirect-input');
            return { open: !!el, value: el ? el.value : '(redirect form closed)' };
          });
          t.expect(st.open, 'the redirect form stays open after the failure', { observed: st });
          t.expectEq(st.value, STEER, 'the typed steer text is preserved after the failure');
        } finally { await removeFaults(); }
      }, { name: 'redirect' });

      // Take-over failure.
      await ctx.check('BC-C-21', async (t) => {
        await toDecide();
        await openDisclosure();
        await clickVerb(page, 'take_over');
        await page.waitForSelector('[data-testid="takeover-form"] textarea', { timeout: 4000 });
        const raw = await page.evaluate(() => document.querySelector('[data-testid="takeover-form"] textarea').value);
        const obj = JSON.parse(raw);
        obj.title = 'Distinctive takeover title that must survive a failure';
        const JSONTEXT = JSON.stringify(obj, null, 2);
        await setValue(page, '[data-testid="takeover-form"] textarea', JSONTEXT);
        const removeFaults = await installFaultInjector(page, [{ method: 'POST', pathRe: GATE_RE, action: 'abort' }]);
        try {
          await clickButton(page, /^Save draft/i);
          await sleep(1200);
          const st = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="takeover-form"] textarea');
            return { open: !!el, value: el ? el.value : '(takeover form closed)' };
          });
          t.expect(st.open, 'the take-over form stays open after the failure', { observed: { open: st.open } });
          t.expectEq(st.value, JSONTEXT, 'the typed take-over JSON is preserved after the failure');
        } finally { await removeFaults(); }
      }, { name: 'takeover' });

      // Tweak failure.
      await ctx.check('BC-C-21', async (t) => {
        await toDecide();
        await clickVerb(page, 'edit');
        await page.waitForSelector('[data-testid="tweak-form"] input', { timeout: 4000 });
        const TWEAK = 'a tweak value that must survive a failed submit';
        await setValue(page, '[data-testid="tweak-form"] input', TWEAK);
        const removeFaults = await installFaultInjector(page, [{ method: 'POST', pathRe: GATE_RE, action: 'abort' }]);
        try {
          await clickButton(page, /^Keep with edit/i);
          await sleep(1200);
          const st = await page.evaluate((expected) => {
            const el = document.querySelector('[data-testid="tweak-form"] input');
            return { open: !!el, value: el ? el.value : '(tweak form closed)', matches: el ? el.value === expected : false };
          }, TWEAK);
          t.expect(st.open, 'the tweak form stays open after the failure', { observed: { open: st.open } });
          t.expect(st.matches, 'the typed tweak value is preserved after the failure', { observed: st.value });
        } finally { await removeFaults(); }
      }, { name: 'tweak' });
    },
  },
];
