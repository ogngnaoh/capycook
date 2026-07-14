// BC-J-1..J-5 — repo-level guardrails. The fast set (pin hash, freeze diff,
// PREREGISTRATION, operator-DB count) runs on EVERY oracle invocation,
// sub-second, and a violation aborts before any scenario (instrument touch =
// abort, per the milestone design). The full set adds the pre-existing
// suites (BC-J-2) — default on full runs, skippable in the B4 inner loop.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { REPO } from './server.mjs';
import { CONTRACT_PIN } from '../registry.mjs';

export const FROZEN_BASELINE = '32afe54';
export const PREREGISTRATION_02B_OPENING = '4c3a6f7c043d8fbcdd50852302e2a8f3e5bae79b';
export const PREREGISTRATION_02B_EXIT = '9aee534af935aeb327321d12ea8cfa23e99246d2';
export const FROZEN_PATHS = [
  'internal/llm/prompts', 'eval/fixtures/seeds.json', 'internal/eval/runner.go',
  'data/safety', 'eval/fixtures/move_script.json', 'internal/llm/evidence.go',
  'internal/eval/mapping.go',
];
export const OPERATOR_BASELINE = 6;

function sh(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { cwd: opts.cwd ?? REPO, encoding: 'utf8', timeout: opts.timeout ?? 600000 });
  return { status: res.status, out: ((res.stdout || '') + (res.stderr || '')).trim() };
}

export function checkFreezeDiff() {
  const r = sh('git', ['diff', `${FROZEN_BASELINE}..HEAD`, '--', ...FROZEN_PATHS]);
  // Also catch UNCOMMITTED edits to the frozen paths — the loop edits the
  // working tree, so HEAD alone is not enough.
  const w = sh('git', ['diff', 'HEAD', '--', ...FROZEN_PATHS]);
  const pass = r.status === 0 && r.out === '' && w.status === 0 && w.out === '';
  return { id: 'BC-J-1', pass, detail: pass ? 'freeze diff empty (committed + working tree)' : `FROZEN PATHS TOUCHED:\n${(r.out + '\n' + w.out).trim().slice(0, 2000)}` };
}

export function checkContractPin() {
  // Byte-identical means byte-identical: raw stdout, no trimming.
  const pinned = spawnSync('git', ['show', `${CONTRACT_PIN}:docs/02b-behavior-contract/contract.md`],
    { cwd: REPO, encoding: 'buffer', timeout: 30000 });
  let head;
  try {
    head = readFileSync(join(REPO, 'docs/archive/02b-behavior-contract/contract.md'));
  } catch (e) {
    return { id: 'BC-J-3', pass: false, detail: `contract.md unreadable: ${e}` };
  }
  const strict = pinned.status === 0 && Buffer.compare(pinned.stdout, head) === 0;
  return { id: 'BC-J-3', pass: strict, detail: strict ? `byte-identical to pin ${CONTRACT_PIN.slice(0, 7)}` : 'contract.md at HEAD differs from the ratified pin' };
}

export function checkPreregistration({
  repo = REPO,
  openingRef = PREREGISTRATION_02B_OPENING,
  exitRef = PREREGISTRATION_02B_EXIT,
} = {}) {
  // Inspect every commit in the finite 02b interval so a mutate-then-revert
  // cannot hide behind byte-identical endpoints. Post-exit amendments are
  // outside BC-J-4; current uncommitted edits remain independently forbidden.
  const interval = `${openingRef.slice(0, 7)}..${exitRef.slice(0, 7)}`;
  const committed = sh('git', [
    'log', '--full-history', '--format=%H', `${openingRef}^..${exitRef}`, '--',
    'docs/PREREGISTRATION.md',
  ], { cwd: repo });
  const working = sh('git', ['diff', 'HEAD', '--', 'docs/PREREGISTRATION.md'], { cwd: repo });

  const commandFailures = [];
  if (committed.status !== 0) commandFailures.push(`git log exited ${committed.status}: ${committed.out}`);
  if (working.status !== 0) commandFailures.push(`git diff exited ${working.status}: ${working.out}`);
  if (commandFailures.length > 0) {
    return { id: 'BC-J-4', pass: false, detail: `unable to verify protected 02b interval ${interval}: ${commandFailures.join('; ')}` };
  }
  if (committed.out !== '') {
    return { id: 'BC-J-4', pass: false, detail: `PREREGISTRATION.md touched during protected 02b interval ${interval}: ${committed.out}` };
  }
  if (working.out !== '') {
    return { id: 'BC-J-4', pass: false, detail: 'PREREGISTRATION.md has uncommitted working-tree changes' };
  }
  return {
    id: 'BC-J-4',
    pass: true,
    detail: `PREREGISTRATION.md untouched throughout 02b interval ${interval} (working tree clean)`,
  };
}

export function checkOperatorDb() {
  const r = sh('sqlite3', [join(REPO, 'data', 'capycook.db'),
    "SELECT COUNT(*) FROM events WHERE run_kind='operator';"]);
  if (r.status !== 0) return { id: 'BC-J-5', pass: false, detail: `sqlite3 failed: ${r.out.slice(0, 300)}` };
  const count = Number(r.out.trim());
  const pass = count === OPERATOR_BASELINE;
  return { id: 'BC-J-5', pass, detail: `operator events: ${count} (baseline ${OPERATOR_BASELINE})${pass ? '' : ' — MISMATCH; if the user ran H2 sessions themselves this needs their confirmation'}` };
}

export function runFastGuardrails() {
  return [checkFreezeDiff(), checkContractPin(), checkPreregistration(), checkOperatorDb()];
}

export function checkSuites() {
  const steps = [
    ['make', ['test']],
    ['make', ['vet']],
    ['npx', ['tsc', '-b'], join(REPO, 'web')],
    ['npx', ['vitest', 'run'], join(REPO, 'web')],
  ];
  const failures = [];
  for (const [cmd, args, cwd] of steps) {
    const res = spawnSync(cmd, args, { cwd: cwd || REPO, encoding: 'utf8', timeout: 600000 });
    if (res.status !== 0) {
      failures.push(`${cmd} ${args.join(' ')} → exit ${res.status}\n${((res.stdout || '') + (res.stderr || '')).slice(-1500)}`);
    }
  }
  return { id: 'BC-J-2', pass: failures.length === 0, detail: failures.length === 0 ? 'make test · make vet · tsc -b · vitest run all green' : failures.join('\n---\n') };
}
