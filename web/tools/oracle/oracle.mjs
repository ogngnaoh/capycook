#!/usr/bin/env node
// CapyCook behavior-contract oracle (milestone 02b, slice B2).
// Third sibling of tools/demo.mjs and tools/shots.mjs: same server lifecycle,
// same selector vocabulary, same port hygiene. Usage:
//
//   node tools/oracle/oracle.mjs run   [--area A,C] [--only BC-A-3,...]
//        [--profile fast|live-sim|budget|live-nokey] [--port 8098]
//        [--report-dir <dir>] [--guardrails fast|all|off] [--parity]
//        [--attempts-file f] [--parked-file f] [--headful] [--keep-tmp]
//   node tools/oracle/oracle.mjs list  [--parity]
//   node tools/oracle/oracle.mjs merge-judgments <verdicts.json> --report <oracle-report.json>
//   node tools/oracle/oracle.mjs self-test [--port 8098]
//
// Exit codes: 0 all evaluated pass · 1 ≥1 fail · 2 harness error ·
// 3 guardrail abort (freeze diff / contract pin / preregistration) ·
// 4 self-test failure.
import { readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { REGISTRY, byId, deriveParitySet, PARITY_SNAPSHOT, EXPECTED_COUNTS, CONTRACT_PIN } from './registry.mjs';
import { ServerHandle, REPO, PROFILES, LIVE_SIM_MS, assertPortAllowed } from './lib/server.mjs';
import { launchBrowser, newScenarioPage, disposeScenarioPage, VIEWPORTS } from './lib/browser.mjs';
import { makeApi } from './lib/api.mjs';
import { NetLog } from './lib/net.mjs';
import { Recorder } from './lib/record.mjs';
import { installInstrument, armMoment, readInstrument, resetInstrument } from './lib/instrument.mjs';
import { ScenarioChecks, JourneyAbort } from './lib/check.mjs';
import { nextRunDir, EvidenceSink } from './lib/evidence.mjs';
import { buildReport, validateReport, mergeJudgments } from './lib/report.mjs';
import { runFastGuardrails, checkSuites } from './lib/guardrails.mjs';
import { contractText, contractIds } from './lib/contract.mjs';
import { copyFileSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPORT_ROOT = join(REPO, 'docs', '02b-behavior-contract', 'evidence');

const log = (...a) => console.error('[oracle]', ...a);

// ------------------------------------------------------------- arg parsing ---
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const flagOnly = ['headful', 'keep-tmp', 'parity'].includes(key);
      args[key] = flagOnly ? true : argv[++i];
    } else args._.push(a);
  }
  return args;
}

// -------------------------------------------------------- scenario loading ---
async function loadScenarios() {
  const dir = join(HERE, 'scenarios');
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

function scenarioIdsFor({ areas, only }) {
  const wanted = new Set();
  for (const e of REGISTRY) {
    const inArea = areas ? areas.includes(e.area) : false;
    const inOnly = only ? only.includes(e.id) : false;
    if (inArea || inOnly) e.scenarios.forEach((s) => { if (!s.startsWith('(')) wanted.add(s); });
  }
  return wanted;
}

// ------------------------------------------------------------ one scenario ---
function resolveViewport(v) {
  if (!v) return VIEWPORTS.desktop;
  if (typeof v === 'string') {
    if (!VIEWPORTS[v]) throw new Error(`oracle: unknown viewport ${v}`);
    return VIEWPORTS[v];
  }
  return v;
}

async function runScenario(browser, def, { port, evidence, profileOverride = null, parityMode = false }) {
  const profile = profileOverride ?? def.profile ?? 'fast';
  const scenarioKey = parityMode ? `${def.id}@live-sim` : def.id;
  const server = new ServerHandle({ port, scenarioId: scenarioKey.replace(/[/@]/g, '-'), profile });
  const judgeStills = new Map(); // id -> [{path, caption}]
  let pageBundle = null;
  let recorder = null;
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
    // Server + optional API pre-seed (the setupFast trick: seed at zero
    // latency, then flip to the scenario profile on the same temp DB).
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
      // Generation-seam waits must survive the 25s live-sim window.
      genTimeout: profile === 'live-sim' ? LIVE_SIM_MS + 15000 : 20000,
      liveSimMs: profile === 'live-sim' ? LIVE_SIM_MS : 0,
      check: (id, fn, opts) => checks.check(id, fn, opts),
      armMoment: (opts) => armMoment(pageBundle.page, opts),
      readInstrument: () => readInstrument(pageBundle.page),
      resetInstrument: () => resetInstrument(pageBundle.page),
      // Judge evidence: ordered stills (skipped in parity re-runs).
      judgeStill: async (id, label) => {
        if (parityMode) return null;
        if (!byId.has(id) || byId.get(id).tag !== 'judge') throw new Error(`oracle: judgeStill for non-judge ${id}`);
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
      log(`  ! ${scenarioKey}: ${String(e && e.message || e).slice(0, 200)}`);
      // finalize() marks unevaluated criteria harness-error; enrich with the error
      checks.aborted = checks.aborted || null;
    }
  } finally {
    if (recorder) await recorder.stop().catch(() => {});
    if (pageBundle) await disposeScenarioPage(pageBundle);
    await server.dispose().catch(() => {});
  }

  const rows = checks.finalize();
  if (checks.scenarioError) {
    for (const r of rows) {
      if (r.failureKind === 'harness-error' && !r.error?.includes('declared but never')) continue;
      if (r.failureKind === 'harness-error') r.error = `scenario crashed: ${checks.scenarioError.slice(0, 500)}`;
    }
  }
  return { rows, judgeStills };
}

// ---------------------------------------------------------------- commands ---
function cmdList(args) {
  const cIds = contractIds();
  const rIds = REGISTRY.map((e) => e.id);
  const missingInRegistry = cIds.filter((id) => !byId.has(id));
  const missingInContract = rIds.filter((id) => !cIds.includes(id));
  const asserts = REGISTRY.filter((e) => e.tag === 'assert').length;
  const judges = REGISTRY.filter((e) => e.tag === 'judge').length;

  console.log(`contract pin: ${CONTRACT_PIN}`);
  console.log(`criteria: ${REGISTRY.length} total · ${asserts} assert · ${judges} judge (expected ${EXPECTED_COUNTS.total}/${EXPECTED_COUNTS.assert}/${EXPECTED_COUNTS.judge})`);
  console.log(`contract.md ids parsed: ${cIds.length}`);
  if (missingInRegistry.length) console.log(`!! in contract but NOT in registry: ${missingInRegistry.join(', ')}`);
  if (missingInContract.length) console.log(`!! in registry but NOT in contract: ${missingInContract.join(', ')}`);
  console.log('');
  for (const e of REGISTRY) {
    const marks = [e.tag === 'judge' ? 'judge ' : 'assert', e.failsToday ? ' [FAILS-TODAY]' : ''].join('');
    console.log(`${e.id.padEnd(9)} ${marks.padEnd(20)} ${e.scenarios.join(', ').padEnd(42)} ${e.title}`);
  }
  const derived = deriveParitySet();
  console.log(`\nBC-I-1 parity set (derived from rule metadata, ${derived.length} ids):`);
  console.log(`  ${derived.join(', ')}`);
  const drift = [
    ...derived.filter((id) => !PARITY_SNAPSHOT.includes(id)).map((id) => `+${id}`),
    ...PARITY_SNAPSHOT.filter((id) => !derived.includes(id)).map((id) => `-${id}`),
  ];
  console.log(drift.length
    ? `  !! DRIFT vs contract snapshot: ${drift.join(', ')} — needs human review (rule wins)`
    : '  matches the contract snapshot exactly.');
  const ok = !missingInRegistry.length && !missingInContract.length
    && REGISTRY.length === EXPECTED_COUNTS.total && asserts === EXPECTED_COUNTS.assert
    && judges === EXPECTED_COUNTS.judge && !drift.length;
  process.exit(ok ? 0 : 1);
}

async function cmdRun(args) {
  const port = assertPortAllowed(Number(args.port || 8098));
  const areas = args.area ? args.area.split(',').map((s) => s.trim().toUpperCase()) : null;
  const only = args.only ? args.only.split(',').map((s) => s.trim()) : null;
  const profileFilter = args.profile || null;
  const full = !areas && !only && !profileFilter;
  const guardrailsMode = args.guardrails || (full ? 'all' : 'fast');
  const startedAt = new Date().toISOString();
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim();

  // Guardrails FIRST — instrument touch = abort, before any scenario.
  let guardrailResults = [];
  let contractMatchesPin = true;
  if (guardrailsMode !== 'off') {
    guardrailResults = runFastGuardrails();
    contractMatchesPin = guardrailResults.find((g) => g.id === 'BC-J-3')?.pass ?? false;
    const aborters = guardrailResults.filter((g) => ['BC-J-1', 'BC-J-3', 'BC-J-4'].includes(g.id) && !g.pass);
    for (const g of guardrailResults) log(`guardrail ${g.id}: ${g.pass ? 'ok' : 'FAIL'} — ${g.detail.split('\n')[0]}`);
    if (aborters.length) {
      console.error(`\n[oracle] GUARDRAIL ABORT — ${aborters.map((g) => g.id).join(', ')} failed. No scenarios were run.`);
      process.exit(3);
    }
  }

  const allScenarios = await loadScenarios();
  let defs = allScenarios;
  if (areas || only) {
    const wanted = scenarioIdsFor({ areas, only });
    defs = allScenarios.filter((s) => wanted.has(s.id));
    const known = new Set(allScenarios.map((s) => s.id));
    for (const w of wanted) if (!known.has(w)) log(`warning: registry names scenario ${w} but no scenario file provides it yet`);
  }
  if (profileFilter) defs = defs.filter((s) => (s.profile ?? 'fast') === profileFilter);
  if (!defs.length) { console.error('[oracle] no scenarios matched'); process.exit(2); }

  const reportRoot = args['report-dir'] || DEFAULT_REPORT_ROOT;
  const { dir: runDir, number } = nextRunDir(reportRoot);
  const evidence = new EvidenceSink(runDir);
  evidence.runDir = runDir;
  log(`run ${number} → ${runDir}`);
  log(`${defs.length} scenarios, port ${port}, guardrails=${guardrailsMode}, full=${full}`);

  const browser = await launchBrowser({ headful: !!args.headful });
  const rows = [];
  const parityRows = [];
  const judgeStillsAll = new Map();
  try {
    for (const def of defs) {
      log(`▶ ${def.id} (${def.profile ?? 'fast'})`);
      const t0 = Date.now();
      const { rows: r, judgeStills } = await runScenario(browser, def, { port, evidence });
      rows.push(...r);
      for (const [id, stills] of judgeStills) {
        judgeStillsAll.set(id, [...(judgeStillsAll.get(id) || []), ...stills]);
      }
      const failed = r.filter((x) => !x.pass).map((x) => x.id);
      log(`  ${Date.now() - t0}ms · ${r.length} checks · ${failed.length ? 'FAIL: ' + [...new Set(failed)].join(', ') : 'all pass'}`);
    }

    // BC-I-1 parity re-run (full runs, or when asked explicitly).
    if (full || args.parity) {
      const paritySet = deriveParitySet();
      const parityScenarioIds = new Set();
      for (const pid of paritySet) {
        for (const s of byId.get(pid).scenarios) if (!s.startsWith('(')) parityScenarioIds.add(s);
      }
      const parityDefs = allScenarios.filter((s) => parityScenarioIds.has(s.id) && (s.profile ?? 'fast') !== 'live-sim');
      log(`parity re-run: ${parityDefs.length} scenarios under live-sim`);
      for (const def of parityDefs) {
        log(`▶ ${def.id}@live-sim`);
        const t0 = Date.now();
        const { rows: r } = await runScenario(browser, def, { port, evidence, profileOverride: 'live-sim', parityMode: true });
        // Only parity-set criteria form twins; other rows are extra signal
        // recorded as sub-checks of the twin ids they belong to.
        parityRows.push(...r.filter((x) => paritySet.includes(x.id)));
        log(`  ${Date.now() - t0}ms`);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }

  if (guardrailsMode === 'all') {
    log('running suites (BC-J-2)…');
    guardrailResults.push(checkSuites());
  }

  const judgeManifest = [...judgeStillsAll.entries()].map(([id, stills]) => ({
    id,
    criterionText: contractText(id),
    evidence: stills,
    expectedOutput: 'PASS|FAIL + one-line reason',
  }));
  evidence.writeRoot('judge-manifest.json', judgeManifest);

  const attempts = args['attempts-file'] ? JSON.parse(readFileSync(args['attempts-file'], 'utf8')) : {};
  const parked = args['parked-file'] ? JSON.parse(readFileSync(args['parked-file'], 'utf8')) : {};

  const report = buildReport({
    rows, parityRows, guardrailResults, judgeManifest, parked, attempts,
    run: { number, reportDir: runDir, filters: { area: areas, only, profile: profileFilter }, full, startedAt, commit },
    contractMatchesPin,
    profiles: {
      'fast': { latencyMs: 0 }, 'live-sim': { latencyMs: LIVE_SIM_MS },
      'budget': { latencyMs: 0, LLM_BUDGET_USD: '0' }, 'live-nokey': { stub: false, dummyKey: true },
    },
  });
  const v = validateReport(report);
  const reportPath = evidence.writeRoot('oracle-report.json', report);
  log(`report: ${reportPath}`);
  log(`summary: ${JSON.stringify(report.summary)}`);
  if (!v.ok) {
    console.error(`[oracle] BC-J-7 REFUSED the report — missing: ${v.missing.join(', ')}`);
    process.exit(1);
  }
  process.exit(report.summary.fail > 0 ? 1 : 0);
}

function cmdMergeJudgments(args) {
  const verdictsPath = args._[1];
  const reportPath = args.report;
  if (!verdictsPath || !reportPath) {
    console.error('usage: oracle.mjs merge-judgments <verdicts.json> --report <oracle-report.json>');
    process.exit(2);
  }
  const { flipped, summary } = mergeJudgments(reportPath, verdictsPath);
  log(`merged ${flipped} judgments · summary: ${JSON.stringify(summary)}`);
  process.exit(summary.fail > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------- main -
const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
if (cmd === 'list') cmdList(args);
else if (cmd === 'run') cmdRun(args).catch((e) => { console.error('[oracle] harness error:', e); process.exit(2); });
else if (cmd === 'merge-judgments') cmdMergeJudgments(args);
else if (cmd === 'self-test') {
  console.error('[oracle] self-test is built in B2 Stage 5 — not available yet (refusing to pretend).');
  process.exit(4);
} else {
  console.error('usage: oracle.mjs <run|list|merge-judgments|self-test> [flags]');
  process.exit(2);
}
