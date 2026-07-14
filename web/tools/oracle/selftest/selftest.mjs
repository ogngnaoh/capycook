// Falsifiability self-test — the gate between "the harness runs" and "the
// harness can be trusted". Three layers (design: b2-oracle-plan.md):
//   1. Known-broken leverage — every [FAILS TODAY] criterion must actually
//      FAIL in the supplied full-run report; an unexpected PASS demands a
//      mutation probe covering that evaluator class, else the self-test
//      fails.
//   2. Mutation probes (selftest/mutations.mjs) — sabotage installed in the
//      page must flip the target criterion to FAIL.
//   3. Plumbing probes — contrast math vs hand-computed pairs, deadline
//      timeouts record instead of hanging, the BC-J-7 validator refuses a
//      report with a dropped id, parity derivation matches the snapshot,
//      evidence files exist on disk for sampled failures.
// Exit contract: ok:true only when every layer holds. B4 refuses to trust
// any oracle run without an ok:true artifact for the current harness commit.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

import { REGISTRY, byId, deriveParitySet, PARITY_SNAPSHOT } from '../registry.mjs';
import { parseCssColor, relLuminance, contrastRatio, compositeOver, isLargeText } from '../lib/contrast.mjs';
import { ScenarioChecks } from '../lib/check.mjs';
import { buildReport, validateReport } from '../lib/report.mjs';
import { MUTATIONS } from './mutations.mjs';
import { REPO } from '../lib/server.mjs';

const log = (...a) => console.error('[self-test]', ...a);

function probe(name, cond, detail) {
  return { name, ok: !!cond, detail: detail === undefined ? undefined : detail };
}

// ---------------------------------------------------------------- layer 3 ---
export function plumbingProbes() {
  const probes = [];

  // Contrast math vs hand-computed WCAG reference pairs.
  probes.push(probe('contrast: black/white = 21', Math.abs(contrastRatio([0, 0, 0], [255, 255, 255]) - 21) < 0.01));
  // #767676 on white is the classic AA boundary pass (≈4.54); #777 fails (≈4.48).
  probes.push(probe('contrast: #767676/white ≈ 4.54', Math.abs(contrastRatio([118, 118, 118], [255, 255, 255]) - 4.54) < 0.02));
  probes.push(probe('contrast: #777/white < 4.5', contrastRatio([119, 119, 119], [255, 255, 255]) < 4.5));
  probes.push(probe('luminance: white = 1', Math.abs(relLuminance([255, 255, 255]) - 1) < 1e-9));
  probes.push(probe('parse: rgb()', JSON.stringify(parseCssColor('rgb(12, 34, 56)')) === '[12,34,56,1]'));
  probes.push(probe('parse: rgba()', JSON.stringify(parseCssColor('rgba(12, 34, 56, 0.5)')) === '[12,34,56,0.5]'));
  probes.push(probe('parse: transparent', JSON.stringify(parseCssColor('transparent')) === '[0,0,0,0]'));
  probes.push(probe('parse: refuses hex (loud null, not a guess)', parseCssColor('#ffffff') === null));
  probes.push(probe('composite: 50% black over white = mid-grey', JSON.stringify(compositeOver([0, 0, 0, 0.5], [255, 255, 255])) === '[128,128,128]'));
  probes.push(probe('large text: 24px regular', isLargeText(24, 400) === true));
  probes.push(probe('large text: 18.66px bold', isLargeText(18.66, 700) === true));
  probes.push(probe('large text: 18px bold is NOT large', isLargeText(18, 700) === false));

  // Parity derivation matches the contract snapshot (drift = human review).
  const derived = deriveParitySet();
  const drift = [
    ...derived.filter((id) => !PARITY_SNAPSHOT.includes(id)),
    ...PARITY_SNAPSHOT.filter((id) => !derived.includes(id)),
  ];
  probes.push(probe('parity derivation matches contract snapshot', drift.length === 0, drift.join(', ') || 'exact'));

  return probes;
}

// A check body that sleeps past its deadline must record fail/timeout — not
// hang the run.
export async function deadlineProbe() {
  const sink = { write: () => '(discarded)' };
  const checks = new ScenarioChecks({
    scenario: { id: 'selftest/deadline', criteria: ['BC-A-1'] },
    profile: 'fast',
    evidence: sink,
    capture: async () => null,
    contextInfo: async () => null,
  });
  const t0 = Date.now();
  await checks.check('BC-A-1', async () => { await new Promise((r) => setTimeout(r, 60000)); }, { deadlineMs: 500 });
  const row = checks.rows[0];
  return probe('deadline: over-limit check records fail/timeout within budget',
    row && row.pass === false && row.failureKind === 'timeout' && (Date.now() - t0) < 5000,
    row && row.failureKind);
}

// The BC-J-7 validator must refuse a full report missing a registry id.
export function reportRefusalProbe() {
  const rows = REGISTRY.filter((e) => e.tag === 'assert' && !e.scenarios[0].startsWith('('))
    .map((e) => ({
      id: e.id, subCheck: 'main', scenario: e.scenarios[0], profile: 'fast',
      pass: true, failureKind: null, expectations: [{ label: 'x', pass: true }],
      observations: {}, evidence: [], ms: 1, startedAt: new Date().toISOString(),
    }));
  const dropped = 'BC-D-9';
  const withDrop = rows.filter((r) => r.id !== dropped);
  const judges = REGISTRY.filter((e) => e.tag === 'judge' && e.id !== 'BC-J-6')
    .map((e) => ({ id: e.id, criterionText: 'x', evidence: [{ path: 'x.png' }] }));
  const parityRows = deriveParitySet().map((id) => ({
    id, subCheck: 'main', scenario: 'x', profile: 'live-sim', pass: true, failureKind: null,
    expectations: [{ label: 'x', pass: true }], observations: {}, evidence: [], ms: 1,
  }));
  const guardrails = ['BC-J-1', 'BC-J-2', 'BC-J-3', 'BC-J-4', 'BC-J-5'].map((id) => ({ id, pass: true, detail: 'x' }));
  const report = buildReport({
    rows: withDrop, parityRows, guardrailResults: guardrails, judgeManifest: judges,
    parked: {}, attempts: {},
    run: { number: 0, reportDir: '(synthetic)', filters: {}, full: true, startedAt: 'x', commit: 'selftest' },
    contractMatchesPin: true, profiles: {},
  });
  const v = validateReport(report);
  return probe('report refusal: dropped id makes BC-J-7 validation fail',
    v.ok === false && v.missing.includes(dropped) && report.results.find((r) => r.id === 'BC-J-7').status === 'fail',
    v.missing.join(','));
}

// ---------------------------------------------------------------- layer 1 ---
export function knownBrokenLayer(reportPath) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  if (!report.run.full) throw new Error('self-test layer 1 needs a FULL run report');
  const probes = [];
  const failsToday = REGISTRY.filter((e) => e.failsToday && e.tag === 'assert').map((e) => e.id);
  const unexpectedPass = [];
  for (const id of failsToday) {
    const row = report.results.find((r) => r.id === id && !r.parity);
    if (!row) { unexpectedPass.push(`${id} (missing)`); continue; }
    if (row.status !== 'fail') unexpectedPass.push(`${id} (${row.status})`);
  }
  const mutationCovered = new Set(MUTATIONS.map((m) => m.expectFail));
  const uncovered = unexpectedPass.filter((s) => !mutationCovered.has(s.split(' ')[0]));
  probes.push(probe(`known-broken: ${failsToday.length - unexpectedPass.length}/${failsToday.length} FAILS-TODAY criteria fail as marked`, true, undefined));
  if (unexpectedPass.length) {
    probes.push(probe('known-broken: unexpected passes are mutation-covered (markers are informative — an unexpected pass is tolerable ONLY with a mutation probe on that evaluator)',
      uncovered.length === 0, `unexpected: ${unexpectedPass.join(', ')}${uncovered.length ? ' — UNCOVERED: ' + uncovered.join(', ') : ''}`));
  }

  // Evidence sampling: failing rows must have on-disk evidence.
  const failing = report.results.filter((r) => r.status === 'fail' && (r.evidence || []).length > 0).slice(0, 10);
  const missingEvidence = [];
  for (const row of failing) {
    for (const p of row.evidence.slice(0, 2)) {
      if (!existsSync(join(report.run.reportDir, p))) missingEvidence.push(`${row.id}: ${p}`);
    }
  }
  probes.push(probe(`evidence exists on disk for ${failing.length} sampled failing rows`, missingEvidence.length === 0, missingEvidence.join('; ') || undefined));
  return { probes, failsTodayCount: failsToday.length, unexpectedPass };
}

// ---------------------------------------------------------------- layer 2 ---
export async function mutationLayer({ port }) {
  // Late import: run.mjs hosts the extracted scenario runner.
  const { runScenarioById } = await import('../lib/run.mjs');
  const probes = [];
  for (const m of MUTATIONS) {
    log(`mutation ${m.name} → ${m.scenario} (expect ${m.expectFail} to FAIL)`);
    try {
      const { rows } = await runScenarioById(m.scenario, { port, sabotage: m.install, evidenceMode: 'discard' });
      const target = rows.filter((r) => r.id === m.expectFail);
      const flipped = target.length > 0 && target.some((r) => !r.pass);
      probes.push(probe(`mutation ${m.name} [${m.class}] flips ${m.expectFail}`, flipped,
        flipped ? undefined : `target rows: ${JSON.stringify(target.map((r) => ({ sub: r.subCheck, pass: r.pass })))}`));
    } catch (e) {
      probes.push(probe(`mutation ${m.name} [${m.class}] flips ${m.expectFail}`, false, `probe crashed: ${String(e).slice(0, 300)}`));
    }
  }
  return probes;
}

// ------------------------------------------------------------------- main ---
export async function runSelfTest({ reportPath, port = 8125, skipMutations = false, outPath }) {
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim();
  const layers = {};

  layers.plumbing = [...plumbingProbes(), await deadlineProbe(), reportRefusalProbe()];
  layers.knownBroken = reportPath ? knownBrokenLayer(reportPath).probes
    : [probe('known-broken layer SKIPPED — no --report supplied', false, 'a full-run report is required for an ok:true artifact')];
  layers.mutations = skipMutations
    ? [probe('mutation layer SKIPPED', false, '--skip-mutations given; artifact cannot be ok:true')]
    : await mutationLayer({ port });

  const all = [...layers.plumbing, ...layers.knownBroken, ...layers.mutations];
  const failures = all.filter((p) => !p.ok);
  const artifact = {
    ok: failures.length === 0,
    harnessCommit: commit,
    generatedAt: new Date().toISOString(),
    reportValidated: reportPath || null,
    summary: { probes: all.length, failed: failures.length },
    layers,
  };
  if (outPath) {
    // A fresh worktree has no evidence/ dir (gitignored) — create it.
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  }
  for (const p of all) log(`${p.ok ? 'ok  ' : 'FAIL'} ${p.name}${p.detail ? ' — ' + String(p.detail).slice(0, 160) : ''}`);
  log(`self-test ${artifact.ok ? 'PASSED' : 'FAILED'} (${all.length - failures.length}/${all.length})`);
  return artifact;
}
