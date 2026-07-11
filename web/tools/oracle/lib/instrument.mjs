// In-page observers. Every fixed timing threshold in the contract (≤1s, ≤2s,
// t ≤ 20s, the 2000–12000ms live-region band) is measured with RENDERER-side
// performance.now() stamps recorded by these observers — never node-side
// Date.now() across the CDP boundary, and never a mix of the two clocks in
// one comparison. Moment-precise focus clauses ("at dispatch", "when the
// hold first renders") are recorded by pre-armed observers at the triggering
// mutation, so node never races the moment.
export async function installInstrument(page) {
  await page.evaluateOnNewDocument(() => {
    const descr = (el) => {
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
    };
    const O = {
      t0: performance.now(),
      liveLog: [],        // {t, text} — every distinct gate-live-region value
      rationale: [],      // {t, len, sample} — proposing-card text growth
      moments: [],        // {name, t, active} — armed focus/appearance moments
      arms: [],           // pending {name, kind, selector}
      descr,
    };
    window.__oracle = O;

    let lastLive = null;
    let lastRationaleLen = 0;
    const scan = () => {
      const t = performance.now() - O.t0;
      const live = document.querySelector('[data-testid="gate-live-region"]');
      if (live) {
        const text = (live.textContent || '').trim();
        if (text && text !== lastLive) { lastLive = text; O.liveLog.push({ t, text }); }
      }
      const card = document.querySelector('[data-testid="proposing-card"]');
      if (card) {
        const len = (card.textContent || '').length;
        if (len > lastRationaleLen) {
          lastRationaleLen = len;
          O.rationale.push({ t, len, sample: (card.textContent || '').trim().slice(0, 80) });
        }
      } else {
        lastRationaleLen = 0;
      }
      for (const arm of O.arms) {
        if (arm.fired) continue;
        const present = !!document.querySelector(arm.selector);
        if (arm.kind === 'appear') {
          if (!present) continue;
        } else { // 'disappear': must be observed present first, then absent
          if (present) { arm.seen = true; continue; }
          if (!arm.seen) continue;
        }
        arm.fired = true;
        O.moments.push({
          name: arm.name, t,
          active: descr(document.activeElement),
          snapshot: arm.snapshotSel ? [...document.querySelectorAll(arm.snapshotSel)].map(descr) : undefined,
        });
      }
    };
    const mo = new MutationObserver(scan);
    const startObserving = () => {
      mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
      scan();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserving);
    else startObserving();
  });
}

// Arm a moment BEFORE triggering the action that causes it. kind 'appear'
// records activeElement the instant selector first matches; 'disappear'
// records it the instant a previously-seen selector stops matching (e.g. the
// intent bar unmounting at dispatch). snapshotSel additionally snapshots all
// matching elements' descriptors at that instant (BC-C-20's partial window).
export const armMoment = (page, { name, kind = 'appear', selector, snapshotSel = null }) =>
  page.evaluate((a) => { window.__oracle.arms.push(a); }, { name, kind, selector, snapshotSel });

export const readInstrument = (page) => page.evaluate(() => {
  const O = window.__oracle;
  if (!O) return null;
  return { liveLog: O.liveLog, rationale: O.rationale, moments: O.moments };
});

// Reset the in-page logs between phases of one journey (same document).
export const resetInstrument = (page) => page.evaluate(() => {
  const O = window.__oracle;
  if (!O) return;
  O.t0 = performance.now();
  O.liveLog.length = 0; O.rationale.length = 0; O.moments.length = 0; O.arms.length = 0;
});
