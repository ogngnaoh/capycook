// Area C (alternatives + trust slice). Owner criteria: BC-C-10, BC-C-20,
// BC-C-24 (the "Compare two options" surface) and BC-C-12, BC-C-14, BC-C-25
// (proposal honesty + confidence). Follows the a-intake.mjs pattern-setter:
// bounded waits, renderer-side timing via armMoment/readInstrument, NetLog
// counts, sub-check names, no ctx.check for judge ids. The contract
// (docs/02b-behavior-contract/contract.md) is the only normative text; each
// ctx.check() transcribes one criterion's recipe.
//
// Alternatives timing (verified against internal/orchestrator/orchestrator.go
// + internal/transport/hub.go): an `alternatives` verb spawns ONE move that
// runs k.n=2 GenerateMove calls SEQUENTIALLY on a goroutine (live-sim: 25s +
// 25s ≈ 50s of proposing), then commits BOTH proposals together. The SSE hub
// then replays them one at a time (rationale tokens @30ms, then
// proposal-ready), so the CLIENT sees the two proposal-ready events ~1s apart.
// The client-side "partial window" (proposal A present, B still to arrive) is
// that replay gap — and today the single-proposal GateBar renders for A alone
// during it (Workbench.tsx `showSingleProposal = … pending.length === 1`),
// which is exactly the BC-C-20 defect.
import {
  sleep, clickButton, clickVerb, waitForVerb, describeActiveElement,
  timelineTrialCount,
} from '../lib/page.mjs';
import { seedTrials } from '../lib/api.mjs';

const GATE_RE = /^\/api\/dishes\/[^/]+\/gate$/;

const FULL_VERBS = ['accept', 'edit', 'regenerate', 'alternatives', 'redirect', 'take_over'].sort();

const gotoDish = async (page, base, dishId) => {
  await page.goto(`${base}/dishes/${dishId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#stage-heading', { timeout: 8000 });
};

// Count alt-cards; wait for exactly n to have mounted.
const altCardCount = (page) => page.evaluate(() =>
  document.querySelectorAll('[data-testid="alt-card"]').length);

const waitForAltCards = (page, n, timeout) => page.waitForFunction((num) =>
  document.querySelectorAll('[data-testid="alt-card"]').length >= num, { timeout }, n);

const countUnverified = (draft) => (draft && Array.isArray(draft.flavor_rationale)
  ? draft.flavor_rationale.filter((c) => c.provenance === null).length : 0);

const trustFlavorText = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-testid="trust-flavor"]');
  return el ? el.textContent.trim() : null;
});

// Reach a creative proposal at the gate from the idle intent bar. Returns
// after the gate's accept verb is on screen (proposal parked, BC-C-1).
async function intentToGate(ctx, text) {
  const { page } = ctx;
  await page.waitForSelector('#cc-intent', { timeout: 8000 });
  await page.type('#cc-intent', text);
  await clickButton(page, /^Try it/i);
  await waitForVerb(page, 'accept', ctx.genTimeout);
}

// Open the "Try another way" disclosure, read every gate verb (decide-mode
// pair + the four disclosed), then return the bar to decide mode. Reports each
// verb's disabled state so BC-C-25 can prove none is hidden/disabled.
async function fullVerbSet(page) {
  const read = () => page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="gate-bar"] button[data-verb]')].map((b) => ({
      verb: b.getAttribute('data-verb'),
      disabled: b.getAttribute('aria-disabled') === 'true' || b.disabled === true,
    })));
  const decide = await read();               // accept, edit
  await clickButton(page, /^Try another way/);
  await sleep(200);
  const another = await read();              // regenerate, alternatives, redirect, take_over
  // Back to decide so the caller can accept.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-testid="gate-bar"] button')]
      .find((x) => /Back/.test(x.textContent.trim()));
    if (b) b.click();
  });
  await sleep(150);
  const map = {};
  for (const v of [...decide, ...another]) map[v.verb] = v;
  return Object.values(map);
}

// In-page accessible-name computation for BC-C-10 (there is no lib helper):
// aria-label wins, else aria-labelledby resolved, else the subtree's text
// EXCLUDING aria-hidden branches — the AT-visible name, not the raw glyph.
function altCardAccNames(page) {
  return page.evaluate(() => {
    function accName(el) {
      const label = el.getAttribute('aria-label');
      if (label && label.trim()) return label.trim();
      const lb = el.getAttribute('aria-labelledby');
      if (lb) {
        const txt = lb.split(/\s+/).map((id) => {
          const n = document.getElementById(id);
          return n ? n.textContent.trim() : '';
        }).join(' ').trim();
        if (txt) return txt;
      }
      const walk = (node) => {
        let out = '';
        for (const child of node.childNodes) {
          if (child.nodeType === Node.TEXT_NODE) { out += child.textContent; continue; }
          if (child.nodeType !== Node.ELEMENT_NODE) continue;
          if (child.getAttribute('aria-hidden') === 'true') continue;
          const al = child.getAttribute('aria-label');
          if (al && al.trim()) { out += ` ${al.trim()} `; continue; }
          out += walk(child);
        }
        return out;
      };
      return walk(el).replace(/\s+/g, ' ').trim();
    }
    return [...document.querySelectorAll('[data-testid="alt-card"]')].map(accName);
  });
}

// BC-C-24 fires when the SECOND alt-card mounts — a moment the stock
// armMoment (single selector-appearance) cannot express (alt-card #1 also
// matches). This local observer records the live-region text + activeElement
// the instant the alt-card count first reaches 2.
async function installSecondAltObserver(page) {
  await page.evaluate(() => {
    const descr = (el) => (el ? {
      tag: el.tagName ? el.tagName.toLowerCase() : null,
      id: el.id || null,
      testid: el.getAttribute ? el.getAttribute('data-testid') : null,
      text: (el.textContent || '').trim().slice(0, 40),
      isBody: el === document.body,
      isConnected: el.isConnected,
      isStop: !!(el.tagName === 'BUTTON' && /^Stop/.test((el.textContent || '').trim())),
    } : { none: true });
    const state = { fired: false };
    window.__secondAlt = state;
    const check = () => {
      if (state.fired) return;
      if (document.querySelectorAll('[data-testid="alt-card"]').length >= 2) {
        state.fired = true;
        const live = document.querySelector('[data-testid="gate-live-region"]');
        state.liveText = live ? (live.textContent || '').trim() : null;
        state.active = descr(document.activeElement);
      }
    };
    const mo = new MutationObserver(check);
    mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
    check();
  });
}
const readSecondAltObserver = (page) => page.evaluate(() =>
  (window.__secondAlt ? {
    fired: window.__secondAlt.fired,
    liveText: window.__secondAlt.liveText ?? null,
    active: window.__secondAlt.active ?? null,
  } : null));

export const scenarios = [

  // ---------------------------------------------------------------------------
  // c/alternatives-fast (fast): BC-C-10 — two labeled alternatives; picking
  // one stages it for a normal gate decision.
  // ---------------------------------------------------------------------------
  {
    id: 'c/alternatives-fast',
    profile: 'fast',
    criteria: ['BC-C-10'],
    setup: seedTrials(1),
    run: async (ctx, dishId) => {
      const { page, base, net } = ctx;
      await gotoDish(page, base, dishId);
      await intentToGate(ctx, 'brighten the finish with something citrusy');

      await ctx.check('BC-C-10', async (t) => {
        const trialsBefore = await timelineTrialCount(page);

        // Fire alternatives from the gate's "Try another way" disclosure.
        await clickButton(page, /^Try another way/);
        await sleep(150);
        const mark = net.mark();
        await clickVerb(page, 'alternatives');

        const gotBoth = await waitForAltCards(page, 2, 15000).then(() => true).catch(() => false);
        const cards = await altCardCount(page);
        t.expect(gotBoth && cards === 2, 'exactly two alternative cards render', { observed: cards });
        if (!gotBoth) return;

        // Accessible names must each carry the Option A / Option B identifier —
        // the AT-visible name, not the aria-hidden badge glyph.
        const names = await altCardAccNames(page);
        t.observe('accessibleNames', names);
        t.expect(/option a/i.test(names[0] || ''), 'card A accessible name includes "Option A"', { observed: names[0] });
        t.expect(/option b/i.test(names[1] || ''), 'card B accessible name includes "Option B"', { observed: names[1] });

        // Picking A stages that proposal for a normal gate decision: the picker
        // yields to the single-proposal diff view + gate bar.
        await page.evaluate(() => document.querySelectorAll('[data-testid="alt-card"]')[0].click());
        const staged = await waitForVerb(page, 'accept', 8000).then(() => true).catch(() => false);
        const pickerGone = await page.evaluate(() => !document.querySelector('[data-testid="alternatives-picker"]'));
        t.expect(staged, 'picking A shows a gate bar for its diff', { observed: staged });
        t.expect(pickerGone, 'the alternatives picker yields to the staged proposal', { observed: !pickerGone });

        // Accepting the staged alternative commits exactly one trial.
        const acceptMark = net.mark();
        await clickVerb(page, 'accept');
        const grew = await page.waitForFunction((n) => {
          const aside = document.querySelector('aside[aria-label="Development timeline"]');
          if (!aside) return false;
          return [...aside.querySelectorAll('button')].filter((b) => /^Trial \d+/.test(b.textContent.trim())).length === n;
        }, { timeout: 8000 }, trialsBefore + 1).then(() => true).catch(() => false);
        const trialsAfter = await timelineTrialCount(page);
        t.expect(grew, 'accepting the alternative appends a trial', { observed: trialsAfter, expected: trialsBefore + 1 });
        t.expectEq(trialsAfter, trialsBefore + 1, 'exactly one trial committed');
        t.expectEq(net.count({ method: 'POST', pathRe: GATE_RE, since: acceptMark }), 1, 'accept fired exactly one POST …/gate');
        t.observe('alternativesGatePosts', net.count({ method: 'POST', pathRe: GATE_RE, since: mark }));
      });
    },
  },

  // ---------------------------------------------------------------------------
  // c/alternatives-live (live-sim): BC-C-20 (no gate decision on a partial
  // result) + BC-C-24 (arrival announced, focus placed). Both observe ONE
  // alternatives fire: the C-20 partial window is captured by a renderer-side
  // armMoment at the first proposal-ready; the C-24 second-mount moment by a
  // local observer.
  // ---------------------------------------------------------------------------
  {
    id: 'c/alternatives-live',
    profile: 'live-sim',
    criteria: ['BC-C-20', 'BC-C-24'],
    setup: seedTrials(1),
    run: async (ctx, dishId) => {
      const { page, base, net } = ctx;
      await gotoDish(page, base, dishId);
      await intentToGate(ctx, 'push it somewhere new with a bright, fresh edge');

      // Arm the two moments BEFORE firing alternatives. Reset the instrument so
      // its liveLog captures only the alternatives sequence.
      await ctx.resetInstrument();
      // BC-C-20: the first-proposal-ready moment is the instant the proposing
      // card unmounts. NEVER arm on alt-card — an alt-card only exists once
      // BOTH proposals have arrived (Workbench `showAlternatives` needs
      // pending.length >= 2), so it fires at the RESOLVED state and masks the
      // partial-window defect. proposing-card 'disappear' fires precisely at
      // the first ready, when today's single-proposal gate bar renders for A
      // alone (and the fix's picker would render instead).
      await ctx.armMoment({
        name: 'first-ready', kind: 'disappear',
        selector: '[data-testid="proposing-card"]',
        snapshotSel: 'button[data-verb="accept"], [data-testid="alternatives-picker"], [data-testid="gate-bar"], [data-testid="alt-card"]',
      });
      await installSecondAltObserver(page);

      const mark = net.mark();
      await clickButton(page, /^Try another way/);
      await sleep(150);
      await clickVerb(page, 'alternatives');

      // Two sequential 25s generations, then the ~1s hub replay.
      const gotBoth = await waitForAltCards(page, 2, ctx.liveSimMs * 2 + 25000)
        .then(() => true).catch(() => false);
      await sleep(300); // let focusDecision's setTimeout(0) settle
      const inst = await ctx.readInstrument();
      const obs = await readSecondAltObserver(page);
      const settledActive = await describeActiveElement(page);
      const firstReady = (inst.moments || []).find((m) => m.name === 'first-ready');
      const altGatePosts = net.count({ method: 'POST', pathRe: GATE_RE, since: mark });

      await ctx.check('BC-C-20', async (t) => {
        t.expect(!!firstReady, 'the first-proposal-ready moment was captured', { observed: firstReady ? 'captured' : 'never' });
        if (!firstReady) return;
        const snap = firstReady.snapshot || [];
        const hasAccept = snap.some((d) => d.verb === 'accept');
        const hasPicker = snap.some((d) => d.testid === 'alternatives-picker');
        const hasGateBar = snap.some((d) => d.testid === 'gate-bar');
        t.observe('firstReadySnapshot', snap);
        t.observe('activeAtFirstReady', firstReady.active);
        // Safe iff no committing accept is present, OR only the picker shows
        // (never a single-proposal gate bar) on the partial result.
        const safe = !hasAccept || (hasPicker && !hasGateBar);
        t.expect(safe,
          'no committing gate verb on a partial alternatives result (accept absent, or only the picker shown)',
          { observed: { hasAccept, hasPicker, hasGateBar } });
        t.expect(gotBoth, 'both alternatives eventually arrive (picker resolves)', { observed: gotBoth });
      }, { name: 'partial-window' });

      await ctx.check('BC-C-24', async (t) => {
        t.expect(!!obs && obs.fired, 'the second-alt-card mount moment was captured', { observed: obs });
        // Arrival announced: prefer the instrument liveLog (full history),
        // corroborate with the observer's captured text.
        const liveTexts = (inst.liveLog || []).map((l) => l.text);
        const announced = liveTexts.some((x) => /alternatives ready/i.test(x) && /\b2\b/.test(x));
        t.expect(announced, 'live region announced "alternatives ready" with count 2', { observed: liveTexts });
        if (obs && obs.liveText != null) {
          t.expectMatch(obs.liveText, /alternatives ready/i, 'live region text at second mount is the alternatives announcement');
        }
        // Focus placed on a defined, attached, non-body, non-Stop target.
        t.observe('activeAtSecondMount', obs && obs.active);
        t.observe('settledActive', settledActive);
        t.expect(!!settledActive && settledActive.isConnected && !settledActive.isBody && !settledActive.isStop,
          'focus lands on an attached target — never document.body, never Stop', { observed: settledActive });
        // The alternatives verb dispatches one POST …/gate (the move is spawned
        // server-side, not a client POST …/move — hence the /gate count, not
        // /move), and both proposals ride that single move.
        t.expectEq(altGatePosts, 1, 'the alternatives verb dispatched exactly one gate request');
      });
    },
  },

  // ---------------------------------------------------------------------------
  // c/trust (fast): BC-C-12 (proposal honesty outside technical view),
  // BC-C-14 (flavor-trust tally reflects the committed draft), BC-C-25 (low
  // confidence never hides/disables options). Technical view OFF (default).
  // ---------------------------------------------------------------------------
  {
    id: 'c/trust',
    profile: 'fast',
    criteria: ['BC-C-12', 'BC-C-14', 'BC-C-25'],
    setup: seedTrials(0),
    run: async (ctx, dishId) => {
      const { page, base, api } = ctx;
      await gotoDish(page, base, dishId);
      await page.waitForSelector('#cc-intent', { timeout: 8000 });

      // BC-C-14 (before any accept): a fresh dish's draft carries no unverified
      // flavor claims, so the trust-flavor tally is absent.
      const before = await api('GET', `/api/dishes/${dishId}`);
      await ctx.check('BC-C-14', async (t) => {
        t.expectEq(countUnverified(before.draft), 0, 'fresh draft carries no unverified flavor claims');
        const tf = await trustFlavorText(page);
        t.expect(tf === null, 'trust-flavor absent before any accept', { observed: tf });
      }, { name: 'before-accept' });

      // Drive a creative first pass (empty moveType on a version-less dish →
      // seed_expand): the stub always attaches a citation + a non-empty
      // unverified list, and seed_expand appends an ungrounded (unverified)
      // flavor claim.
      await intentToGate(ctx, 'give it a fresh herbal lift');

      // BC-C-12: the pending proposal's honesty renders with technical OFF.
      await ctx.check('BC-C-12', async (t) => {
        const hdr = await page.evaluate(() => {
          const h = document.querySelector('[data-testid="proposal-header"]');
          if (!h) return null;
          const spans = [...h.querySelectorAll('span')];
          const chips = spans.filter((s) => /·\s*template:/.test(s.textContent) || /^\s*stub\s*·/.test(s.textContent.trim()));
          const unv = [...h.querySelectorAll('p')].find((p) => /^unverified:/i.test(p.textContent.trim()));
          return {
            text: h.textContent.trim().slice(0, 300),
            citationChips: chips.map((s) => s.textContent.trim()),
            hasUnverified: !!unv,
            unverifiedText: unv ? unv.textContent.trim() : null,
            confShown: /\bconf\s+\d+%/.test(h.textContent),
          };
        });
        t.expect(!!hdr, 'proposal-header rendered at the gate', { observed: hdr });
        if (!hdr) return;
        t.expect(hdr.citationChips.length >= 1, 'citation chip(s) shown with technical view OFF', { observed: hdr.citationChips });
        t.expect(hdr.hasUnverified, 'unverified claims disclosed inline', { observed: hdr.unverifiedText });
        t.expect(!hdr.confShown, 'confidence stays hidden with technical view OFF', { observed: hdr.confShown });

        const tn = await page.evaluate(() => document.querySelector('[data-testid="trust-nutrition"]')?.textContent.trim() ?? null);
        const tc = await page.evaluate(() => document.querySelector('[data-testid="trust-cost"]')?.textContent.trim() ?? null);
        t.expect(!!tn && /USDA/.test(tn), 'trust-nutrition states USDA-verified', { observed: tn });
        t.expect(!!tc && /approximate/i.test(tc), 'trust-cost states approximate', { observed: tc });
      });

      // Accept → BC-C-14 (after accept): the committed draft now carries the
      // unverified flavor claim, and trust-flavor shows that exact count.
      await clickVerb(page, 'accept');
      await page.waitForSelector('#cc-intent', { timeout: ctx.genTimeout });
      await sleep(300);
      await ctx.check('BC-C-14', async (t) => {
        const after = await api('GET', `/api/dishes/${dishId}`);
        const expected = countUnverified(after.draft);
        t.expect(expected > 0, 'the accepted draft carries ≥1 unverified flavor claim', { observed: expected });
        const tf = await trustFlavorText(page);
        t.expect(tf !== null, 'trust-flavor present after the accept', { observed: tf });
        t.expect(!!tf && new RegExp(`\\b${expected}\\b`).test(tf),
          'trust-flavor count matches the draft\'s unverified entries', { observed: tf, expected });
      }, { name: 'after-accept' });

      // BC-C-25: a moonshot steer (confidence 0.15) reaches the gate with the
      // full verb set; compare against a normal-confidence proposal.
      await intentToGate(ctx, 'moonshot — take it somewhere unexpected');
      const moonProp = (await api('GET', `/api/dishes/${dishId}`)).pendingProposal;
      const moonVerbs = await fullVerbSet(page);
      await clickVerb(page, 'accept');
      await page.waitForSelector('#cc-intent', { timeout: ctx.genTimeout });
      await sleep(200);

      await intentToGate(ctx, 'a small, safe refinement');
      const normProp = (await api('GET', `/api/dishes/${dishId}`)).pendingProposal;
      const normVerbs = await fullVerbSet(page);

      await ctx.check('BC-C-25', async (t) => {
        t.expect(!!moonProp && moonProp.confidence <= 0.2, 'moonshot proposal is low-confidence (≤0.2)', { observed: moonProp && moonProp.confidence });
        t.expect(!!normProp && normProp.confidence > 0.2, 'comparison proposal is normal-confidence (>0.2)', { observed: normProp && normProp.confidence });
        const mset = moonVerbs.map((v) => v.verb).sort();
        const nset = normVerbs.map((v) => v.verb).sort();
        t.observe('lowConfidenceVerbs', moonVerbs);
        t.observe('normalVerbs', normVerbs);
        t.expectEq(mset, FULL_VERBS, 'low-confidence gate offers the full six verbs, none hidden');
        t.expect(moonVerbs.every((v) => !v.disabled), 'no verb disabled at the low-confidence gate', { observed: moonVerbs });
        t.expectEq(nset, FULL_VERBS, 'normal-confidence gate offers the full six verbs');
        t.expect(normVerbs.every((v) => !v.disabled), 'no verb disabled at the normal gate', { observed: normVerbs });
        t.expectEq(mset, nset, 'low-confidence verb set is identical to the normal-confidence gate');
      });
    },
  },
];
