// oracle-report.json builder + the BC-J-7 completeness validator + the
// judge-manifest emitter and merge-judgments. The report is the loop's
// source of truth; exit codes are conveniences.
import { readFileSync, writeFileSync } from 'node:fs';
import { REGISTRY, byId, deriveParitySet, CONTRACT_PIN } from '../registry.mjs';

const HARNESS_VERSION = '0.1.0';

function aggregate(rows) {
  // rows: subCheck rows for ONE criterion id (one profile universe).
  const pass = rows.length > 0 && rows.every((r) => r.pass);
  const kinds = rows.filter((r) => !r.pass).map((r) => r.failureKind);
  const failureKind = kinds.includes('harness-error') ? 'harness-error'
    : kinds.includes('timeout') ? 'timeout'
    : kinds.includes('blocked') ? 'blocked'
    : kinds.includes('error') ? 'error'
    : kinds.includes('assert') ? 'assert' : null;
  const firstFail = rows.find((r) => !r.pass);
  return {
    status: pass ? 'pass' : 'fail',
    failureKind: pass ? null : failureKind,
    scenarios: [...new Set(rows.map((r) => r.scenario))],
    profiles: [...new Set(rows.map((r) => r.profile))],
    subChecks: rows.map((r) => ({
      name: r.subCheck, scenario: r.scenario, profile: r.profile, pass: r.pass,
      failureKind: r.failureKind, error: r.error || undefined,
      expectations: r.expectations, observations: r.observations,
    })),
    evidence: rows.flatMap((r) => r.evidence),
    timing: { ms: rows.reduce((s, r) => s + r.ms, 0), startedAt: rows[0]?.startedAt },
    reason: pass ? undefined
      : (firstFail?.error
        || firstFail?.expectations?.find((e) => !e.pass)?.label
        || 'sub-check failed'),
  };
}

export function buildReport({
  rows,                 // all subCheck rows (main pass)
  parityRows = [],      // subCheck rows from the BC-I-1 live-sim re-run
  guardrailResults = [],// [{id, pass, detail}] for BC-J-1..J-5
  judgeManifest = [],   // entries emitted for the 10 judge criteria
  parked = {},          // { 'BC-x-y': reason } from the loop's parked file
  attempts = {},        // { 'BC-x-y': n } from the loop's attempts file
  run,                  // { number, reportDir, filters, full }
  contractMatchesPin,
  profiles,
}) {
  const results = [];
  const rowsById = new Map();
  for (const r of rows) {
    if (!rowsById.has(r.id)) rowsById.set(r.id, []);
    rowsById.get(r.id).push(r);
  }
  const parityById = new Map();
  for (const r of parityRows) {
    if (!parityById.has(r.id)) parityById.set(r.id, []);
    parityById.get(r.id).push(r);
  }
  const guardrailById = new Map(guardrailResults.map((g) => [g.id, g]));
  const judgeById = new Map(judgeManifest.map((j) => [j.id, j]));

  const paritySet = deriveParitySet();
  const parityTwinRows = [];
  const missing = [];

  for (const entry of REGISTRY) {
    const { id, tag, area } = entry;
    const base = { id, tag, area, attempts: attempts[id] ?? 0, parity: false };

    if (parked[id]) {
      results.push({ ...base, status: 'parked', reason: parked[id], evidence: [] });
      continue;
    }
    if (id === 'BC-J-6') {
      results.push({ ...base, status: 'parked', reason: 'evaluated once at B5 by design (contract §J)', evidence: [] });
      continue;
    }
    if (guardrailById.has(id)) {
      const g = guardrailById.get(id);
      results.push({ ...base, status: g.pass ? 'pass' : 'fail', failureKind: g.pass ? null : 'assert', reason: g.pass ? undefined : g.detail, evidence: g.evidence || [], detail: g.detail });
      continue;
    }
    if (id === 'BC-J-7') {
      // Filled in below, after completeness is known.
      continue;
    }
    if (id === 'BC-I-1') {
      const twins = paritySet.map((pid) => parityById.get(pid) || []);
      const executed = twins.filter((t) => t.length > 0);
      if (run.full && executed.length !== paritySet.length) {
        missing.push('BC-I-1(parity twins incomplete)');
        results.push({ ...base, status: 'fail', failureKind: 'harness-error', reason: `parity re-run incomplete: ${executed.length}/${paritySet.length} ids executed`, evidence: [] });
      } else if (executed.length === 0) {
        missing.push(id);
      } else {
        const allPass = executed.every((t) => t.every((r) => r.pass));
        results.push({ ...base, status: allPass ? 'pass' : 'fail', failureKind: allPass ? null : 'assert', reason: allPass ? undefined : 'one or more parity twins failed under live-sim', evidence: [] });
      }
      continue;
    }
    if (tag === 'judge') {
      const j = judgeById.get(id);
      if (!j) { missing.push(id); continue; }
      results.push({ ...base, status: 'pending-judgment', evidence: j.evidence.map((e) => e.path) });
      continue;
    }
    const r = rowsById.get(id);
    if (!r || r.length === 0) { missing.push(id); continue; }
    results.push({ ...base, ...aggregate(r) });
  }

  // Parity twin rows (<id>@live-sim), reported per BC-I-1's check recipe.
  for (const pid of paritySet) {
    const r = parityById.get(pid);
    if (!r || r.length === 0) continue;
    parityTwinRows.push({ id: `${pid}@live-sim`, tag: 'assert', area: byId.get(pid).area, parity: true, attempts: attempts[pid] ?? 0, ...aggregate(r) });
  }
  results.push(...parityTwinRows);

  // BC-J-7: the completeness verdict itself.
  const j7pass = run.full ? missing.length === 0 : true;
  const j7 = {
    id: 'BC-J-7', tag: 'assert', area: 'J', parity: false, attempts: attempts['BC-J-7'] ?? 0,
    status: j7pass ? 'pass' : 'fail',
    failureKind: j7pass ? null : 'assert',
    reason: j7pass ? undefined : `missing report entries: ${missing.join(', ')}`,
    evidence: [],
  };
  // Insert BC-J-7 in area position (after BC-J-5's row) rather than appending
  // after parity twins.
  const j6Idx = results.findIndex((r) => r.id === 'BC-J-6');
  results.splice(j6Idx + 1, 0, j7);

  const summary = { pass: 0, fail: 0, parked: 0, pendingJudgment: 0, total: results.length };
  for (const r of results) {
    if (r.status === 'pass') summary.pass += 1;
    else if (r.status === 'fail') summary.fail += 1;
    else if (r.status === 'parked') summary.parked += 1;
    else if (r.status === 'pending-judgment') summary.pendingJudgment += 1;
  }

  return {
    harness: { version: HARNESS_VERSION, startedAt: run.startedAt, finishedAt: new Date().toISOString(), commit: run.commit },
    run,
    contractPin: { expected: CONTRACT_PIN, contractMatchesPin },
    profiles,
    results,
    summary,
    completeness: { allContractIdsPresent: missing.length === 0, missing, parityIdsDerived: paritySet },
  };
}

// Refuse to write a structurally-invalid full report — this is what the
// self-test's dropped-registry-id probe exercises.
export function validateReport(report) {
  if (!report.run.full) return { ok: true, missing: [] };
  const present = new Set(report.results.map((r) => r.id));
  const missing = REGISTRY.map((e) => e.id).filter((id) => !present.has(id));
  return { ok: missing.length === 0, missing };
}

export function mergeJudgments(reportPath, verdictsPath) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const verdicts = JSON.parse(readFileSync(verdictsPath, 'utf8'));
  const byIdV = new Map(verdicts.map((v) => [v.id, v]));
  let flipped = 0;
  for (const row of report.results) {
    if (row.status !== 'pending-judgment') continue;
    const v = byIdV.get(row.id);
    if (!v) continue;
    row.status = /^pass$/i.test(v.verdict) ? 'pass' : 'fail';
    if (row.status === 'fail') row.failureKind = 'judge';
    row.judgment = { verdict: v.verdict, reason: v.reason, judgedAt: v.judgedAt };
    flipped += 1;
  }
  const s = { pass: 0, fail: 0, parked: 0, pendingJudgment: 0, total: report.results.length };
  for (const r of report.results) {
    if (r.status === 'pass') s.pass += 1;
    else if (r.status === 'fail') s.fail += 1;
    else if (r.status === 'parked') s.parked += 1;
    else if (r.status === 'pending-judgment') s.pendingJudgment += 1;
  }
  report.summary = s;
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return { flipped, summary: s };
}
