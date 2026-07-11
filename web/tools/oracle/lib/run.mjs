// Standalone single-scenario runner — used by the falsifiability self-test
// to re-run one scenario with a SABOTAGE installed (mutation probes). Mirrors
// oracle.mjs's runScenario; oracle.mjs converges on this module at
// integration so there is exactly one runner. Evidence is discarded by
// default (probes only need the row verdicts).
import { readdirSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { byId } from '../registry.mjs';
import { ServerHandle, LIVE_SIM_MS } from './server.mjs';
import { launchBrowser, newScenarioPage, disposeScenarioPage, VIEWPORTS } from './browser.mjs';
import { makeApi } from './api.mjs';
import { NetLog } from './net.mjs';
import { Recorder } from './record.mjs';
import { installInstrument, armMoment, readInstrument, resetInstrument } from './instrument.mjs';
import { ScenarioChecks, JourneyAbort } from './check.mjs';
import { EvidenceSink } from './evidence.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

export async function loadScenarios() {
  const dir = join(HERE, '..', 'scenarios');
  let files = [];
  try { files = readdirSync(dir).filter((f) => f.endsWith('.mjs')); } catch { /* none yet */ }
  const all = [];
  for (const f of files.sort()) {
    const mod = await import(join(dir, f));
    if (!Array.isArray(mod.scenarios)) throw new Error(`oracle: ${f} exports no scenarios[]`);
    all.push(...mod.scenarios);
  }
  const seen = new Set();
  for (const s of all) {
    if (seen.has(s.id)) throw new Error(`oracle: duplicate scenario id ${s.id}`);
    seen.add(s.id);
  }
  return all;
}

function resolveViewport(v) {
  if (!v) return VIEWPORTS.desktop;
  if (typeof v === 'string') {
    if (!VIEWPORTS[v]) throw new Error(`oracle: unknown viewport ${v}`);
    return VIEWPORTS[v];
  }
  return v;
}

// Core: run ONE scenario definition against a fresh server + page.
// opts: { port, evidence (EvidenceSink), browser (reused if given),
//         profileOverride, parityMode, sabotage(page) }
export async function runScenario(def, opts) {
  const { port, evidence, profileOverride = null, parityMode = false, sabotage = null } = opts;
  const profile = profileOverride ?? def.profile ?? 'fast';
  const scenarioKey = parityMode ? `${def.id}@live-sim` : def.id;
  const server = new ServerHandle({ port, scenarioId: scenarioKey.replace(/[/@]/g, '-'), profile });
  const judgeStills = new Map();
  let pageBundle = null;
  let recorder = null;
  const ownBrowser = !opts.browser;
  const browser = opts.browser || await launchBrowser({});

  const checks = new ScenarioChecks({
    scenario: { id: scenarioKey, criteria: def.criteria },
    profile,
    evidence,
    capture: async () => {
      try {
        if (recorder && recorder.running) return recorder.latestFrame();
        return await pageBundle.page.screenshot();
      } catch { return null; }
    },
    contextInfo: async () => {
      const { page, consoleErrors, pageErrors, dialogs } = pageBundle;
      let url = null; let active = null;
      try { url = page.url(); } catch { /* gone */ }
      try {
        active = await page.evaluate(() => {
          const el = document.activeElement;
          return el ? { tag: el.tagName, id: el.id || null, testid: el.getAttribute && el.getAttribute('data-testid'), text: (el.textContent || '').trim().slice(0, 60), isBody: el === document.body } : null;
        });
      } catch { /* gone */ }
      return { url, activeElement: active, consoleErrors: consoleErrors.slice(-10), pageErrors: pageErrors.slice(-10), dialogs, netTail: ctx.net ? ctx.net.slice(Math.max(0, ctx.net.entries.length - 25)) : [] };
    },
  });

  let setupResult;
  const ctx = {};
  try {
    if (def.setup && profile !== 'fast') {
      await server.start({ profile: 'fast', freshDb: true });
      setupResult = await def.setup({ api: makeApi(server.base), base: server.base });
      await server.restart({ profile });
    } else {
      await server.start({ freshDb: true });
      if (def.setup) setupResult = await def.setup({ api: makeApi(server.base), base: server.base });
    }

    pageBundle = await newScenarioPage(browser, {
      viewport: resolveViewport(def.viewport),
      theme: def.theme === undefined ? 'light' : def.theme,
      technicalView: def.technicalView ?? null,
      gateShortcuts: def.gateShortcuts ?? null,
      reducedMotion: !!def.reducedMotion,
    });
    // Sabotage installs BEFORE the instrument so sabotage-registered
    // observers fire first on each mutation batch — a muting sabotage must
    // be able to blank text before the instrument's scan reads it.
    if (sabotage) await sabotage(pageBundle.page);
    await installInstrument(pageBundle.page);
    const net = new NetLog(pageBundle.page);

    const wantRecord = def.record ?? (profile === 'live-sim');
    if (wantRecord) {
      recorder = new Recorder(pageBundle.page, join(evidence.runDir, scenarioKey, 'screencast'));
      await recorder.start();
    }

    Object.assign(ctx, {
      page: pageBundle.page,
      dialogs: pageBundle.dialogs,
      consoleErrors: pageBundle.consoleErrors,
      pageErrors: pageBundle.pageErrors,
      server,
      base: server.base,
      api: makeApi(server.base),
      net,
      recorder,
      profile,
      parityMode,
      genTimeout: profile === 'live-sim' ? LIVE_SIM_MS + 15000 : 20000,
      liveSimMs: profile === 'live-sim' ? LIVE_SIM_MS : 0,
      check: (id, fn, o) => checks.check(id, fn, o),
      armMoment: (o) => armMoment(pageBundle.page, o),
      readInstrument: () => readInstrument(pageBundle.page),
      resetInstrument: () => resetInstrument(pageBundle.page),
      judgeStill: async (id, label) => {
        if (parityMode) return null;
        if (!byId.has(id) || byId.get(id).tag !== 'judge') throw new Error(`oracle: judgeStill for non-judge ${id}`);
        // A screencast frame pushed BEFORE first paint is a blank — wait for
        // a frame captured after this call (evidence-freshness; a stale
        // blank sent judge BC-A-8 a black seed screen in run-073).
        if (recorder && recorder.running) {
          const callT = Date.now() - recorder.startedAt;
          const t0 = Date.now();
          while (Date.now() - t0 < 1500) {
            const last = recorder.frames[recorder.frames.length - 1];
            if (last && last.t >= callT) break;
            await new Promise((r) => setTimeout(r, 60));
          }
        }
        const buf = recorder && recorder.running ? recorder.latestFrame() : await pageBundle.page.screenshot();
        if (!buf) return null;
        const list = judgeStills.get(id) || [];
        const name = `${String(list.length + 1).padStart(2, '0')}-${label}.png`;
        const path = evidence.writeJudgeStill(id, name, buf);
        list.push({ path, caption: label });
        judgeStills.set(id, list);
        return path;
      },
      sampleScreencast: (id, { fromMs = 0, toMs = Infinity, maxFrames = 20 } = {}) => {
        if (parityMode || !recorder) return [];
        const frames = recorder.sampleFrames({ fromMs, toMs, maxFrames });
        const list = judgeStills.get(id) || [];
        for (const f of frames) {
          const name = `t${(f.t / 1000).toFixed(1)}s.png`;
          copyFileSync(join(recorder.dir, f.file), join(evidence.judgeDir(id), name));
          list.push({ path: join('judge', id, name), caption: `t=${(f.t / 1000).toFixed(1)}s`, tSeconds: f.t / 1000 });
        }
        judgeStills.set(id, list);
        return frames;
      },
    });

    await def.run(ctx, setupResult);
  } catch (e) {
    if (!(e instanceof JourneyAbort)) {
      checks.scenarioError = String((e && e.stack) || e);
    }
  } finally {
    if (recorder) await recorder.stop().catch(() => {});
    if (pageBundle) await disposeScenarioPage(pageBundle);
    await server.dispose().catch(() => {});
    if (ownBrowser) await browser.close().catch(() => {});
  }

  const rows = checks.finalize();
  if (checks.scenarioError) {
    for (const r of rows) {
      if (r.failureKind === 'harness-error') r.error = `scenario crashed: ${checks.scenarioError.slice(0, 500)}`;
    }
  }
  return { rows, judgeStills };
}

// Convenience for the self-test: run one scenario by registry/scenario id
// with evidence discarded into a temp dir.
export async function runScenarioById(scenarioId, { port, sabotage = null, evidenceMode = 'discard' } = {}) {
  const all = await loadScenarios();
  const def = all.find((s) => s.id === scenarioId);
  if (!def) throw new Error(`oracle: no scenario ${scenarioId} on disk`);
  const tmp = mkdtempSync(join(tmpdir(), 'oracle-selftest-'));
  const evidence = new EvidenceSink(tmp);
  evidence.runDir = tmp;
  try {
    return await runScenario(def, { port, evidence, sabotage });
  } finally {
    if (evidenceMode === 'discard') rmSync(tmp, { recursive: true, force: true });
  }
}
