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
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { REGISTRY, byId, deriveParitySet, PARITY_SNAPSHOT, EXPECTED_COUNTS, CONTRACT_PIN } from './registry.mjs';
import { REPO, LIVE_SIM_MS, assertPortAllowed } from './lib/server.mjs';
import { launchBrowser } from './lib/browser.mjs';
import { loadScenarios, runScenario } from './lib/run.mjs';
import { nextRunDir, EvidenceSink } from './lib/evidence.mjs';
import { buildReport, validateReport, mergeJudgments } from './lib/report.mjs';
import { runFastGuardrails, checkSuites } from './lib/guardrails.mjs';
import { contractText, contractIds } from './lib/contract.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPORT_ROOT = join(REPO, 'docs', 'archive', '02b-behavior-contract', 'evidence');

const log = (...a) => console.error('[oracle]', ...a);

// ------------------------------------------------------------- arg parsing ---
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const flagOnly = ['headful', 'keep-tmp', 'parity', 'skip-mutations'].includes(key);
      args[key] = flagOnly ? true : argv[++i];
    } else args._.push(a);
  }
  return args;
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
      const { rows: r, judgeStills, scenarioError } = await runScenario(def, { browser, port, evidence });
      if (scenarioError) log(`  ! ${def.id}: ${scenarioError.split('\n')[0].slice(0, 200)}`);
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
        const { rows: r, scenarioError } = await runScenario(def, { browser, port, evidence, profileOverride: 'live-sim', parityMode: true });
        if (scenarioError) log(`  ! ${def.id}@live-sim: ${scenarioError.split('\n')[0].slice(0, 200)}`);
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
  import('./selftest/selftest.mjs').then(async ({ runSelfTest }) => {
    const out = args.out || join(args['report-dir'] || DEFAULT_REPORT_ROOT, 'selftest-report.json');
    const artifact = await runSelfTest({
      reportPath: args.report || null,
      port: assertPortAllowed(Number(args.port || 8125)),
      skipMutations: !!args['skip-mutations'],
      outPath: out,
    });
    log(`artifact: ${out}`);
    process.exit(artifact.ok ? 0 : 4);
  }).catch((e) => { console.error('[oracle] self-test crashed:', e); process.exit(4); });
} else {
  console.error('usage: oracle.mjs <run|list|merge-judgments|self-test> [flags]');
  process.exit(2);
}
