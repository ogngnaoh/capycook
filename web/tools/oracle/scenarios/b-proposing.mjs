// Area B — the proposing state (runs NATIVELY in live-sim). Copies the shapes
// a-intake.mjs set: bounded waits, renderer-side timing via armMoment/
// readInstrument, NetLog counts, sub-check names, judgeStill/sampleScreencast.
// The contract (docs/02b-behavior-contract/contract.md) is the only normative
// text; each ctx.check() transcribes one criterion's recipe.
//
// Every fixed threshold here is decided by RENDERER-side stamps — the in-page
// instrument's liveLog (gate-live-region text), rationale (proposing-card text
// growth), and armed moments (performance.now()), plus a local state-pill
// observer. Node clocks are used only to frame judge evidence windows, never
// for a pass/fail threshold. "Exactly one POST" counts come from ctx.net.
//
// Server timing recap (internal/llm/stub.go + internal/transport/hub.go):
//  - A creative move blocks CAPYCOOK_STUB_LATENCY_MS (25s) in the stub, cancel
//    respected mid-wait; then the hub replays the rationale word-by-word as
//    token events (~post-completion), then proposal-ready. So during the 25s
//    the client sees only heartbeats — BC-B-3/BC-B-10's [FAILS TODAY] root.
//  - alternatives (n=2) runs the two generations SEQUENTIALLY, so the first
//    proposal-ready lands at ~2×latency; the second follows ~one replay later.
//  - focusDecision (Workbench.tsx) parks focus on the Stop control whenever it
//    fires while state===proposing — BC-B-4's [FAILS TODAY] trap.
import {
  sleep, clickButton, clickVerb, waitForVerb, setValue, describeActiveElement,
  timelineTrialCount,
} from '../lib/page.mjs';
import { seedTrials } from '../lib/api.mjs';

const MOVE_RE = /^\/api\/dishes\/[^/]+\/move$/;

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

// Local in-page state-pill observer — captures EVERY distinct pill value with
// a renderer stamp, so a brief "Ready" flicker between polls can't hide
// (BC-B-7). Kept local per the builder brief: lib/ is frozen for me.
const installPillObserver = (page) => page.evaluate(() => {
  const read = () => {
    const el = document.querySelector('[data-testid="state-pill"]');
    return el ? el.textContent.trim() : null;
  };
  const O = { t0: performance.now(), log: [] };
  let last = null;
  const rec = () => {
    const text = read();
    if (text !== null && text !== last) { last = text; O.log.push({ t: performance.now() - O.t0, text }); }
  };
  rec();
  const mo = new MutationObserver(rec);
  mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  window.__pill = O;
});
const readPillLog = (page) => page.evaluate(() => (window.__pill ? window.__pill.log : []));

// The proposing card's static chrome (spinner has no text, spacer none):
// textContent === "Working on your idea" + "Stop" + <streamed rationale>. So
// the streamed portion is what remains after stripping those two labels.
const streamedPortion = (sample) =>
  (sample || '').replace('Working on your idea', '').replace('Stop', '').trim();

export const scenarios = [

  // ---------------------------------------------------------------------------
  // b/one-window (live-sim): ONE 25s generation window serves the asserts
  // BC-B-1/B-3/B-7/B-9/B-10 plus the judge captures BC-B-2 (full wait) and
  // BC-B-8 (±3s around the ready transition). Arm the instrument BEFORE
  // submitting; every threshold reads from the in-page logs.
  // ---------------------------------------------------------------------------
  {
    id: 'b/one-window',
    profile: 'live-sim',
    criteria: ['BC-B-1', 'BC-B-2', 'BC-B-3', 'BC-B-7', 'BC-B-8', 'BC-B-9', 'BC-B-10'],
    setup: seedTrials(1),
    run: async (ctx, dishId) => {
      const { page, base, net } = ctx;
      await gotoDish(page, base, dishId);
      await page.waitForSelector('#cc-intent', { timeout: 8000 });
      await installPillObserver(page);

      const INTENT = 'brighten the whole dish with citrus and fresh herbs';
      await page.type('#cc-intent', INTENT);
      // Fresh renderer clock right before dispatch; arm the proposing moment.
      await ctx.resetInstrument();
      await ctx.armMoment({ name: 'proposing', selector: '[data-testid="proposing-card"]' });
      const submitNode = Date.now();
      const mark = net.mark();
      await page.keyboard.press('Enter'); // focus is on #cc-intent from page.type

      // Capture BC-B-1's surface content while the card is live. The read
      // waits out the cc-rise entrance animation (~300ms, opacity 0→1) —
      // waitForSelector resolves at DOM insert, mid-animation; the ≤1s
      // timing clause is measured by the armed renderer moment, not this
      // settled read.
      const cardSeen = await page.waitForSelector('[data-testid="proposing-card"]', { timeout: 8000 })
        .then(() => true).catch(() => false);
      if (cardSeen) await sleep(900);
      const cardContent = cardSeen ? await page.evaluate(() => {
        const c = document.querySelector('[data-testid="proposing-card"]');
        if (!c) return null;
        // The contract's *Visible* definition — DOM presence alone must not
        // pass (a display:none card fails; enforced by the falsifiability
        // self-test's 'hide-proposing-card' mutation).
        const cs = getComputedStyle(c);
        const r = c.getBoundingClientRect();
        return {
          text: c.textContent.trim().slice(0, 120),
          hasStop: [...c.querySelectorAll('button')].some((b) => /^Stop$/.test(b.textContent.trim())),
          hasSpinner: !!c.querySelector('[data-testid="proposing-spinner"]'),
          visible: cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05
            && r.width > 10 && r.height > 10 && r.bottom > 0 && r.top < window.innerHeight,
          visParts: { display: cs.display, visibility: cs.visibility, opacity: cs.opacity, rect: { top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }, innerHeight: window.innerHeight },
        };
      }) : null;

      // Ride the full window to the gate.
      const sawGate = await waitForVerb(page, 'accept', ctx.genTimeout).then(() => true).catch(() => false);
      const readyNode = Date.now();
      const inst = (await ctx.readInstrument()) || { liveLog: [], rationale: [], moments: [] };
      const pillLog = await readPillLog(page);
      const postCount = net.count({ method: 'POST', pathRe: MOVE_RE, since: mark });

      // Judge evidence (skipped automatically in parity re-runs).
      const recStart = ctx.recorder && ctx.recorder.startedAt ? ctx.recorder.startedAt : submitNode;
      ctx.sampleScreencast('BC-B-2', {
        fromMs: Math.max(0, submitNode - recStart), toMs: readyNode - recStart, maxFrames: 13,
      });
      await sleep(3200); // let the +3s tail of the ready transition record
      ctx.sampleScreencast('BC-B-8', {
        fromMs: Math.max(0, (readyNode - recStart) - 3000), toMs: (readyNode - recStart) + 3200, maxFrames: 12,
      });

      // Derived, renderer-side.
      const mProposing = inst.moments.find((m) => m.name === 'proposing');
      const liveProposing = inst.liveLog.find((l) => /Proposing a move/.test(l.text));
      const liveReady = inst.liveLog.find((l) => /Proposal ready/.test(l.text));
      const rationaleStreamed = inst.rationale
        .map((r) => ({ t: r.t, streamed: streamedPortion(r.sample) }))
        .filter((r) => r.streamed.length > 0);
      const firstStreamed = rationaleStreamed[0] || null;

      // -- BC-B-1: proposing surface visible ≤1s, with working label + Stop. --
      await ctx.check('BC-B-1', async (t) => {
        t.observe('postCount', postCount);
        t.observe('proposingMoment', mProposing || 'never');
        t.observe('liveProposingT', liveProposing ? Math.round(liveProposing.t) : null);
        t.expect(sawGate, 'window completed (a proposal reached the gate)', { observed: sawGate });
        t.expect(!!mProposing, 'a visible proposing state appeared', { observed: mProposing ? 'appeared' : 'never' });
        if (mProposing) {
          t.expect(mProposing.t <= 1000, 'proposing card visible ≤1s after the POST',
            { observed: Math.round(mProposing.t) + 'ms' });
        }
        t.expect(!!cardContent, 'proposing card contents captured while live', { observed: cardContent });
        if (cardContent) {
          t.expect(cardContent.visible, 'proposing card is VISIBLE (rendered in viewport, not CSS-hidden)', { observed: cardContent });
          t.expect(/Working on your idea/.test(cardContent.text), 'proposing card shows the working label',
            { observed: cardContent.text });
          t.expect(cardContent.hasStop, 'proposing card carries an explicit Stop control', { observed: cardContent.hasStop });
        }
      });

      // -- BC-B-3: rationale text streams DURING generation (t ≤ 20s). [FAILS TODAY] --
      await ctx.check('BC-B-3', async (t) => {
        t.observe('rationaleStreamed', rationaleStreamed.slice(0, 8));
        t.expect(rationaleStreamed.length >= 1, 'rationale text rendered in the proposing card at some point',
          { observed: rationaleStreamed.length });
        t.expect(!!firstStreamed && firstStreamed.t <= 20000,
          'first visible rationale text at t ≤ 20s (during generation, before the stub completes)',
          { observed: firstStreamed ? Math.round(firstStreamed.t) + 'ms' : 'never' });
        if (rationaleStreamed.length >= 2) {
          const grew = rationaleStreamed[rationaleStreamed.length - 1].streamed.length > rationaleStreamed[0].streamed.length;
          t.expect(grew, 'rationale continued to accumulate before proposal-ready', { observed: grew });
        }
      });

      // -- BC-B-7: state pill monotone Thinking… → Needs your call. --
      await ctx.check('BC-B-7', async (t) => {
        const seq = pillLog.map((p) => p.text);
        t.observe('pillSequence', seq);
        const firstThinking = pillLog.findIndex((p) => /Thinking/.test(p.text));
        const firstNeeds = pillLog.findIndex((p) => /Needs your call/.test(p.text));
        t.expect(firstThinking >= 0, 'pill showed "Thinking…" during generation', { observed: seq });
        t.expect(firstNeeds > firstThinking && firstThinking >= 0,
          'pill reached "Needs your call" after "Thinking…"', { observed: seq });
        if (firstThinking >= 0 && firstNeeds > firstThinking) {
          const between = pillLog.slice(firstThinking, firstNeeds).map((p) => p.text);
          const flicker = between.some((txt) => txt === 'Ready');
          t.expect(!flicker, 'no "Ready" flicker between "Thinking…" and "Needs your call"', { observed: between });
        }
      });

      // -- BC-B-9: live region announces start and ready. --
      await ctx.check('BC-B-9', async (t) => {
        t.observe('liveLog', inst.liveLog.map((l) => l.text));
        t.expect(!!liveProposing, 'live region announced start ("Proposing a move…")',
          { observed: inst.liveLog.map((l) => l.text) });
        t.expect(!!liveReady && /\d+\s+changes?\s+to\s+review/.test(liveReady.text),
          'live region announced ready ("Proposal ready — N changes to review")',
          { observed: liveReady ? liveReady.text : null });
      });

      // -- BC-B-10: intermediate live-region updates, 2–12s cadence. [FAILS TODAY] --
      await ctx.check('BC-B-10', async (t) => {
        const texts = inst.liveLog.map((l) => ({ t: l.t, text: l.text.trim() }));
        const isStart = (s) => /Proposing a move/.test(s);
        const isReady = (s) => /Proposal ready/.test(s);
        const intermediates = texts.filter((x) => !isStart(x.text) && !isReady(x.text));
        t.observe('liveLog', texts.map((x) => `${Math.round(x.t)}ms: ${x.text}`));
        t.expect(intermediates.length >= 1,
          'at least one distinct intermediate live-region value between start and ready',
          { observed: texts.map((x) => x.text) });
        const stamps = texts.map((x) => x.t);
        const gaps = stamps.slice(1).map((tt, i) => Math.round(tt - stamps[i]));
        t.observe('updateGapsMs', gaps);
        const cadenceOk = gaps.length > 0 && gaps.every((g) => g >= 2000 && g <= 12000);
        t.expect(cadenceOk,
          'successive distinct updates land 2000–12000ms apart (never a single 25s silence, never per-token)',
          { observed: gaps });
      });
    },
  },

  // ---------------------------------------------------------------------------
  // b/cancel (live-sim): BC-B-5 (Stop → announced cancelled state, pill Ready,
  // trial count unchanged, safe focus) and BC-B-6 (cancel discards, deep-equal).
  // ---------------------------------------------------------------------------
  {
    id: 'b/cancel',
    profile: 'live-sim',
    criteria: ['BC-B-5', 'BC-B-6'],
    setup: seedTrials(1),
    run: async (ctx, dishId) => {
      const { page, base, api } = ctx;
      await gotoDish(page, base, dishId);
      await page.waitForSelector('#cc-intent', { timeout: 8000 });

      // BC-B-6 before-snapshot: the draft + version chain the cancel must not
      // touch. Both are GETs (no session mutation) — legitimately invariant, so
      // a raw byte compare is the whole recipe.
      const before = {
        draft: (await api('GET', `/api/dishes/${dishId}`)).draft,
        versions: await api('GET', `/api/dishes/${dishId}/versions`),
      };
      const trialsBefore = await timelineTrialCount(page);

      const INTENT = 'push it toward something smoky and unexpected';
      await page.type('#cc-intent', INTENT);
      await page.keyboard.press('Enter');
      const proposing = await page.waitForSelector('[data-testid="proposing-card"]', { timeout: 10000 })
        .then(() => true).catch(() => false);
      await sleep(900); // squarely mid-generation (window is 25s)

      await ctx.check('BC-B-5', async (t) => {
        t.expect(proposing, 'move reached the proposing state before cancel', { observed: proposing });
        const liveBefore = ((await ctx.readInstrument()) || { liveLog: [] }).liveLog.length;
        // Activate Stop the way a keyboard user does: focus it, then activate.
        const clicked = await page.evaluate(() => {
          const b = [...document.querySelectorAll('button')].find((x) => /^Stop$/.test(x.textContent.trim()));
          if (!b) return false;
          b.focus();
          b.click();
          return true;
        });
        t.expect(clicked, 'Stop control present mid-generation and activated', { observed: clicked });
        await waitForPill(page, 'Ready', 15000).catch(() => {});
        await sleep(400);
        const inst = (await ctx.readInstrument()) || { liveLog: [] };
        const announced = inst.liveLog.slice(liveBefore).some((l) => /Move cancelled/.test(l.text));
        const pill = await statePill(page);
        const trialsAfter = await timelineTrialCount(page);
        const active = await describeActiveElement(page);
        t.observe('activeAfterCancel', active);
        t.expect(announced, '"Move cancelled" announced via the live region',
          { observed: inst.liveLog.map((l) => l.text) });
        t.expect(pill === 'Ready', 'state pill returns to "Ready"', { observed: pill });
        t.expectEq(trialsAfter, trialsBefore, 'timeline trial count unchanged by the cancel');
        t.expect(!active.isBody, 'focus not dropped to document.body when Stop unmounts', { observed: active });
        t.expect(active.isConnected, 'focus lands on an attached target', { observed: active });
      });

      await ctx.check('BC-B-6', async (t) => {
        const after = {
          draft: (await api('GET', `/api/dishes/${dishId}`)).draft,
          versions: await api('GET', `/api/dishes/${dishId}/versions`),
        };
        t.expectEq(JSON.stringify(after.draft), JSON.stringify(before.draft),
          'draft byte-identical after cancel (discard, not rollback)');
        t.expectEq(JSON.stringify(after.versions), JSON.stringify(before.versions),
          'version chain byte-identical after cancel');
      });
    },
  },

  // ---------------------------------------------------------------------------
  // b/focus-traps (live-sim): BC-B-4's FOUR event-conditioned trap moments plus
  // BC-C-4's escape-while-proposing sub-check ('escape-proposing'). Each trap
  // drives a fresh creative move to a gate/hold, triggers a move-respawning
  // path, then — the instant the app RE-ENTERS proposing — presses Enter with
  // no intervening focus action and records whether focus parked on Stop / the
  // move got cancelled. BC-B-4 is [FAILS TODAY]; the report ANDs the sub-checks.
  // ---------------------------------------------------------------------------
  {
    id: 'b/focus-traps',
    profile: 'live-sim',
    criteria: ['BC-B-4', 'BC-C-4'],
    setup: seedTrials(1),
    run: async (ctx, dishId) => {
      const { page } = ctx;
      const altTimeout = 2 * ctx.liveSimMs + 15000; // two sequential 25s generations

      await gotoDish(page, ctx.base, dishId);

      // Collapse whatever surface is showing back to an idle intent bar.
      const ensureIdle = async () => {
        for (let i = 0; i < 4; i++) {
          const state = await page.evaluate(() => {
            if (document.querySelector('#cc-intent')) return 'idle';
            if (document.querySelector('[data-testid="proposing-card"]')) return 'proposing';
            if (document.querySelector('button[data-verb="accept"]')) return 'gate';
            if (document.querySelector('[data-testid="safety-hold"]')) return 'blocked';
            return 'other';
          });
          if (state === 'idle') return;
          if (state === 'proposing') {
            await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Stop$/.test(x.textContent.trim())); if (b) b.click(); }).catch(() => {});
          } else if (state === 'gate') {
            await clickVerb(page, 'accept').catch(() => {});
          } else if (state === 'blocked') {
            // Steer to a safe change, then Stop the respawn — never regenerate
            // (that re-runs the garlic-oil steer and re-blocks).
            await page.evaluate(() => { const b = document.querySelector('button[data-verb="redirect"]'); if (b) b.click(); }).catch(() => {});
            await page.waitForSelector('#safety-hold-steer', { timeout: 3000 }).catch(() => {});
            await setValue(page, '#safety-hold-steer', 'keep it simple and fresh').catch(() => {});
            await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Send$/.test(x.textContent.trim())); if (b) b.click(); }).catch(() => {});
            await page.waitForSelector('[data-testid="proposing-card"]', { timeout: 8000 }).catch(() => {});
            await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Stop$/.test(x.textContent.trim())); if (b) b.click(); }).catch(() => {});
          }
          await page.waitForSelector('#cc-intent', { timeout: 18000 }).catch(() => {});
        }
      };

      const reachGate = async (intent) => {
        await page.waitForSelector('#cc-intent', { timeout: 8000 });
        await page.type('#cc-intent', intent);
        await page.keyboard.press('Enter');
        await waitForVerb(page, 'accept', ctx.genTimeout);
      };

      // The shared trap probe: wait for the respawn to re-enter proposing, let
      // focusDecision's setTimeout(0) park focus, then press Enter once.
      const probeTrap = async (t, label) => {
        const proposing = await page.waitForSelector('[data-testid="proposing-card"]', { timeout: 14000 })
          .then(() => true).catch(() => false);
        await sleep(450); // focusDecision parks focus after resync
        const focus = await describeActiveElement(page);
        const liveBefore = ((await ctx.readInstrument()) || { liveLog: [] }).liveLog.length;
        await page.keyboard.press('Enter'); // no intervening focus action
        await sleep(750);
        const inst = (await ctx.readInstrument()) || { liveLog: [] };
        const cancelled = inst.liveLog.slice(liveBefore).some((l) => /Move cancelled/.test(l.text));
        t.observe(`${label}.focusAtProposing`, focus);
        t.observe(`${label}.tripped`, focus.isStop || cancelled);
        t.expect(proposing, `${label}: the respawn re-entered the proposing state`, { observed: proposing });
        t.expect(!focus.isStop, `${label}: focus is not parked on Stop when proposing re-enters`, { observed: focus });
        t.expect(!cancelled, `${label}: a bare Enter did not cancel the in-flight move`, { observed: cancelled });
      };

      // Trap (1): regenerate from a gate.
      await ctx.check('BC-B-4', async (t) => {
        await ensureIdle();
        await reachGate('lean the whole dish toward bright, herbal flavors');
        await clickButton(page, /^Try another way/i);
        await waitForVerb(page, 'regenerate', 5000);
        await clickVerb(page, 'regenerate');
        await probeTrap(t, 'regenerate');
        await ensureIdle();
      }, { name: 'trap-regenerate', deadlineMs: 80000 });

      // Trap (2): the first of two alternatives lands while the second still
      // generates. Since BC-C-20's fix (06e4c00) the app WITHHOLDS the
      // single-proposal gate during the partial window and renders the
      // alternatives-waiting status (or the first alt-card) instead — the
      // trap moment is that partial surface's appearance, and focus must
      // still not be on Stop there.
      await ctx.check('BC-B-4', async (t) => {
        await ensureIdle();
        await reachGate('give it a completely different flavor personality');
        await clickButton(page, /^Try another way/i);
        await waitForVerb(page, 'alternatives', 5000);
        await clickVerb(page, 'alternatives');
        const sawFirst = await page.waitForFunction(
          () => !!document.querySelector('[data-testid="alternatives-waiting"]')
            || !!document.querySelector('[data-testid="alt-card"]'),
          { timeout: altTimeout },
        ).then(() => true).catch(() => false);
        await sleep(200); // focusDecision settles wherever it lands
        const focus = await describeActiveElement(page);
        const liveBefore = ((await ctx.readInstrument()) || { liveLog: [] }).liveLog.length;
        await page.keyboard.press('Enter');
        await sleep(750);
        const inst = (await ctx.readInstrument()) || { liveLog: [] };
        const cancelled = inst.liveLog.slice(liveBefore).some((l) => /Move cancelled/.test(l.text));
        t.observe('alternatives.focusAtFirstReady', focus);
        t.observe('alternatives.tripped', focus.isStop || cancelled);
        t.expect(sawFirst, 'alternatives: the first proposal-ready surfaced (partial-alternatives surface, BC-C-20)', { observed: sawFirst });
        t.expect(!focus.isStop, 'alternatives: focus is not on Stop at the first proposal-ready', { observed: focus });
        t.expect(!cancelled, 'alternatives: a bare Enter did not cancel the second move', { observed: cancelled });
        await ensureIdle();
      }, { name: 'trap-alternatives', deadlineMs: 140000 });

      // Trap (3): "Ask for changes" (redirect) steer respawn from a gate.
      await ctx.check('BC-B-4', async (t) => {
        await ensureIdle();
        await reachGate('add a warm, toasty depth to the dish');
        await clickButton(page, /^Try another way/i);
        await waitForVerb(page, 'redirect', 5000);
        await clickVerb(page, 'redirect');
        await page.waitForSelector('#gate-redirect-input', { timeout: 5000 });
        await setValue(page, '#gate-redirect-input', 'more umami and less salt, please');
        await clickButton(page, /^Send$/i);
        await probeTrap(t, 'redirect-gate');
        await ensureIdle();
      }, { name: 'trap-redirect-gate', deadlineMs: 80000 });

      // Trap (4): the same redirect respawn from the safety hold's "Ask for a
      // safer change" — reach the hold with a 'garlic oil' steer.
      await ctx.check('BC-B-4', async (t) => {
        await ensureIdle();
        await page.waitForSelector('#cc-intent', { timeout: 8000 });
        await page.type('#cc-intent', 'add a garlic oil infusion for a mellow depth');
        await page.keyboard.press('Enter');
        const held = await page.waitForSelector('[data-testid="safety-hold"]', { timeout: ctx.genTimeout })
          .then(() => true).catch(() => false);
        t.expect(held, 'the garlic-oil steer reached the safety hold', { observed: held });
        if (held) {
          await clickVerb(page, 'redirect'); // "Ask for a safer change" opens the hold's steer form
          await page.waitForSelector('#safety-hold-steer', { timeout: 5000 });
          await setValue(page, '#safety-hold-steer', 'skip that step; keep it fresh and bright');
          await clickButton(page, /^Send$/i);
          await probeTrap(t, 'redirect-hold');
        }
        await ensureIdle();
      }, { name: 'trap-redirect-hold', deadlineMs: 80000 });

      // BC-C-4 sub-check: Escape while proposing is never destructive — the
      // move stays in flight (no move-cancel).
      await ctx.check('BC-C-4', async (t) => {
        await ensureIdle();
        await page.waitForSelector('#cc-intent', { timeout: 8000 });
        await page.type('#cc-intent', 'a fresh creative direction to explore');
        await page.keyboard.press('Enter');
        const proposing = await page.waitForSelector('[data-testid="proposing-card"]', { timeout: 14000 })
          .then(() => true).catch(() => false);
        t.expect(proposing, 'move reached proposing before Escape', { observed: proposing });
        await sleep(450);
        const liveBefore = ((await ctx.readInstrument()) || { liveLog: [] }).liveLog.length;
        await page.keyboard.press('Escape');
        await sleep(750);
        const stillProposing = await page.evaluate(() => !!document.querySelector('[data-testid="proposing-card"]'));
        const inst = (await ctx.readInstrument()) || { liveLog: [] };
        const cancelled = inst.liveLog.slice(liveBefore).some((l) => /Move cancelled/.test(l.text));
        t.expect(stillProposing, 'Escape while proposing left the move in flight', { observed: stillProposing });
        t.expect(!cancelled, 'Escape did not emit move-cancelled', { observed: cancelled });
        await ensureIdle();
      }, { name: 'escape-proposing', deadlineMs: 60000 });
    },
  },

  // ---------------------------------------------------------------------------
  // b/reload-midgen (live-sim): BC-B-11 — a MANUAL move (not the auto first
  // pass) reloaded mid-window resumes proposing, never idle, and fires no
  // duplicate move on the page NetLog.
  // ---------------------------------------------------------------------------
  {
    id: 'b/reload-midgen',
    profile: 'live-sim',
    criteria: ['BC-B-11'],
    setup: seedTrials(1),
    run: async (ctx, dishId) => {
      const { page, base, net } = ctx;
      await gotoDish(page, base, dishId);
      await page.waitForSelector('#cc-intent', { timeout: 8000 });

      await ctx.check('BC-B-11', async (t) => {
        const mark = net.mark();
        await page.type('#cc-intent', 'a manual intent while a trial already exists');
        await page.keyboard.press('Enter');
        const proposing = await page.waitForSelector('[data-testid="proposing-card"]', { timeout: 12000 })
          .then(() => true).catch(() => false);
        t.expect(proposing, 'manual move entered proposing before reload', { observed: proposing });
        await sleep(1500); // still mid-window (< 25s)

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#stage-heading', { timeout: 8000 });
        const proposingBack = await page.waitForSelector('[data-testid="proposing-card"]', { timeout: 8000 })
          .then(() => true).catch(() => false);
        const idleAfter = await page.evaluate(() => !!document.querySelector('#cc-intent'));
        t.expect(proposingBack, 'proposing state (not idle) re-renders after the reload', { observed: proposingBack });
        t.expect(!idleAfter, 'the workbench did not fall back to idle after the reload',
          { observed: idleAfter ? 'idle' : 'proposing' });
        await sleep(300);
        t.expectEq(net.count({ method: 'POST', pathRe: MOVE_RE, since: mark }), 1,
          'exactly one POST …/move fired for that move (no duplicate on reload)');
      }, { deadlineMs: 60000 });
    },
  },
];
