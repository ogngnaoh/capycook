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

export const FROZEN_BASELINE = '32afe54fef040fe8fb964fd3c2f04fc9e673b910';
export const PREREGISTRATION_BASELINE = '64654556fed6a3b9e2141790213f78bbafb2d8c4';
export const PREREGISTRATION_02B_OPENING = '4c3a6f7c043d8fbcdd50852302e2a8f3e5bae79b';
export const PREREGISTRATION_02B_EXIT = '9aee534af935aeb327321d12ea8cfa23e99246d2';
export const AUTHORIZED_PREREGISTRATION_STATES = [
  { rank: 0, commit: '64654556fed6a3b9e2141790213f78bbafb2d8c4', blob: '4b5b914e8b3d54f4dbad846ddc1693cec51e50c6' },
  { rank: 1, commit: '43c50ce051301bb8b004b3d297bb192a8f929e6e', blob: '0dffce5ae7d85de759bae077b3d9e1aceb51c559' },
  { rank: 2, commit: '18dc1606535b61374c3260aad4541521e2036bb4', blob: 'b54b08d32510e690fe887b9ff05e72b45c7d0d1f' },
  { rank: 3, commit: '7dd5c512c7ad2d6255fa7ba4f0f53cf7737d070a', blob: 'aef4743448e5bece8ef5f32338a244593060d035' },
  { rank: 4, commit: '09c66c67b472c912f594aa459198e8cb78bf5860', blob: 'cc17b3446f47b9403781eb9b73132b200666d8de' },
  { rank: 5, commit: 'f160a74e412bc8d54ee21c6f46df391ad3cb5a47', blob: '0571364fe6f028fd84009370b197b94d31126443' },
  { rank: 6, commit: '54f6bc743b22fa32cc74f71aa40ee21899a06e31', blob: 'be5748ebf5c7cd6681fae255e286561b5a4b5745' },
];
export const APPROVED_PREREGISTRATION_BLOBS = AUTHORIZED_PREREGISTRATION_STATES.map(({ blob }) => blob);
export const FROZEN_PATHS = [
  'internal/llm/prompts', 'eval/fixtures/seeds.json', 'internal/eval/runner.go',
  'data/safety', 'eval/fixtures/move_script.json', 'internal/llm/evidence.go',
  'internal/eval/mapping.go',
];
export const OPERATOR_BASELINE = 6;
export const ZERO_OID = '0000000000000000000000000000000000000000';

const PREREGISTRATION_PATH = 'docs/PREREGISTRATION.md';
const AMENDMENT_MARKER = Buffer.from('## 9. Amendment log');
const OID_PATTERN = /^[0-9a-f]{40}$/;

function outputText(value) {
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return value || '';
}

function commandLabel(args) {
  return `git ${args.join(' ')}`;
}

function gitCommand(args, {
  repo = REPO,
  spawn = spawnSync,
  encoding = 'utf8',
  timeout = 600000,
} = {}) {
  let result;
  try {
    result = spawn('git', args, { cwd: repo, encoding, timeout });
  } catch (error) {
    result = { status: null, stdout: '', stderr: '', error };
  }
  const stdout = result?.stdout ?? (encoding === 'buffer' ? Buffer.alloc(0) : '');
  const stderr = result?.stderr ?? (encoding === 'buffer' ? Buffer.alloc(0) : '');
  const error = result?.error;
  const status = result?.status;
  const diagnostics = [
    `${commandLabel(args)} exited ${status === null || status === undefined ? 'without status' : status}`,
    outputText(stderr).trim(),
    error ? `spawnSync().error: ${error.message || error}` : '',
  ].filter(Boolean).join(': ');
  return { ok: status === 0 && !error, status, stdout, stderr, error, diagnostics };
}

function sh(cmd, args, opts = {}) {
  let res;
  try {
    res = spawnSync(cmd, args, { cwd: opts.cwd ?? REPO, encoding: 'utf8', timeout: opts.timeout ?? 600000 });
  } catch (error) {
    res = { status: null, stdout: '', stderr: '', error };
  }
  const error = res.error ? `spawnSync().error: ${res.error.message || res.error}` : '';
  return {
    status: res.status,
    out: [res.stdout || '', res.stderr || '', error].filter(Boolean).join('\n').trim(),
    error: res.error,
  };
}

function failed(detail, extra = {}) {
  return { pass: false, detail, ...extra };
}

function resolveCommit(ref, label, options) {
  if (!ref || ref === ZERO_OID) return failed(`${label} is ${ref ? 'the zero object id' : 'missing'}`);
  const result = gitCommand(['rev-parse', '--verify', `${ref}^{commit}`], options);
  if (!result.ok) return failed(`${label} ${ref} is unavailable or not a commit: ${result.diagnostics}`);
  const oid = outputText(result.stdout).trim();
  if (!OID_PATTERN.test(oid)) return failed(`${label} ${ref} resolved to invalid object id ${oid || '<empty>'}`);
  return { pass: true, oid };
}

function requireAncestor(ancestor, target, label, options) {
  const result = gitCommand(['merge-base', '--is-ancestor', ancestor, target], options);
  if (!result.ok) return failed(`${label} ${ancestor} is not an ancestor of target ${target}: ${result.diagnostics}`);
  return { pass: true };
}

function markerOffset(bytes, label) {
  const first = bytes.indexOf(AMENDMENT_MARKER);
  const second = first === -1 ? -1 : bytes.indexOf(AMENDMENT_MARKER, first + AMENDMENT_MARKER.length);
  if (first === -1 || second !== -1) {
    return failed(`${label} must contain the section 9 marker exactly once`);
  }
  return { pass: true, offset: first };
}

function showFile(ref, path, options) {
  const result = gitCommand(['show', `${ref}:${path}`], { ...options, encoding: 'buffer' });
  if (!result.ok) return failed(`unable to read ${path} at ${ref}: ${result.diagnostics}`);
  const bytes = Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout || '');
  return { pass: true, bytes };
}

function preregistrationBlob(ref, options) {
  const result = gitCommand(['rev-parse', '--verify', `${ref}:${PREREGISTRATION_PATH}`], options);
  if (!result.ok) {
    return failed(`PREREGISTRATION state missing or unreadable at commit ${ref}: ${result.diagnostics}`);
  }
  const blob = outputText(result.stdout).trim();
  if (!OID_PATTERN.test(blob)) return failed(`PREREGISTRATION state at commit ${ref} resolved to invalid blob ${blob || '<empty>'}`);
  return { pass: true, blob };
}

function validatePreregistrationAuthorizations(states, baseline, options) {
  if (!Array.isArray(states) || states.length === 0) {
    return failed('ordered PREREGISTRATION authorization history is missing or empty');
  }
  const commits = new Set();
  const blobs = new Set();
  for (let rank = 0; rank < states.length; rank += 1) {
    const state = states[rank];
    if (!state || state.rank !== rank || !OID_PATTERN.test(state.commit || '') || !OID_PATTERN.test(state.blob || '')) {
      return failed(`invalid PREREGISTRATION authorization at rank ${rank}: exact rank, commit, and blob are required`);
    }
    if (commits.has(state.commit) || blobs.has(state.blob)) {
      return failed(`duplicate PREREGISTRATION authorization mapping at rank ${rank}: commit ${state.commit}; blob ${state.blob}`);
    }
    commits.add(state.commit);
    blobs.add(state.blob);
    const resolved = resolveCommit(state.commit, `authorized PREREGISTRATION rank ${rank} commit`, options);
    if (!resolved.pass) return resolved;
    if (resolved.oid !== state.commit) {
      return failed(`authorized PREREGISTRATION rank ${rank} must use exact commit ${state.commit}, resolved ${resolved.oid}`);
    }
    const file = preregistrationBlob(state.commit, options);
    if (!file.pass) return file;
    if (file.blob !== state.blob) {
      return failed(`authorized PREREGISTRATION rank ${rank} commit ${state.commit} has blob ${file.blob}, expected ${state.blob}`);
    }
    if (rank > 0) {
      const parents = gitCommand(['rev-list', '--parents', '-n', '1', state.commit], options);
      if (!parents.ok) return failed(`unable to inspect authorized PREREGISTRATION rank ${rank} parent: ${parents.diagnostics}`);
      const fields = outputText(parents.stdout).trim().split(/\s+/).filter(Boolean);
      if (fields.length !== 2 || fields[0] !== state.commit) {
        return failed(`authorized PREREGISTRATION rank ${rank} commit ${state.commit} must be a non-merge commit with one parent`);
      }
      const parentBlob = preregistrationBlob(fields[1], options);
      if (!parentBlob.pass) return parentBlob;
      if (parentBlob.blob !== states[rank - 1].blob) {
        return failed(`authorized PREREGISTRATION rank ${rank} commit ${state.commit} parent ${fields[1]} has blob ${parentBlob.blob}, expected rank ${rank - 1} blob ${states[rank - 1].blob}`);
      }
    }
  }
  if (states[0].commit !== baseline) {
    return failed(`PREREGISTRATION T0 ${baseline} does not equal authorized rank 0 commit ${states[0].commit}`);
  }
  return { pass: true, byBlob: new Map(states.map((state) => [state.blob, state])) };
}

export function checkPermanentInstruments({
  repo = REPO,
  target = 'HEAD',
  frozenBaseline = FROZEN_BASELINE,
  frozenPaths = FROZEN_PATHS,
  spawn = spawnSync,
} = {}) {
  const options = { repo, spawn };
  const pin = resolveCommit(frozenBaseline, 'frozen instrument pin', options);
  if (!pin.pass) return pin;
  const resolvedTarget = resolveCommit(target, 'integrity target', options);
  if (!resolvedTarget.pass) return resolvedTarget;
  const ancestry = requireAncestor(pin.oid, resolvedTarget.oid, 'frozen instrument pin', options);
  if (!ancestry.pass) return ancestry;

  const endpoint = gitCommand([
    'diff', '--exit-code', pin.oid, resolvedTarget.oid, '--', ...frozenPaths,
  ], options);
  if (!endpoint.ok) {
    return failed(`permanently frozen paths differ from pin ${pin.oid}: ${endpoint.diagnostics}\n${outputText(endpoint.stdout).trim()}`.trim());
  }

  const history = gitCommand([
    'log', '--full-history', '--format=%H', `${pin.oid}..${resolvedTarget.oid}`, '--', ...frozenPaths,
  ], options);
  if (!history.ok) return failed(`unable to scan permanently frozen path history: ${history.diagnostics}`);
  const touches = outputText(history.stdout).trim();
  if (touches) return failed(`permanently frozen paths have post-pin history touches after ${pin.oid}:\n${touches}`);

  return {
    pass: true,
    target: resolvedTarget.oid,
    detail: `7 permanently frozen instrument paths are byte-identical to ${pin.oid.slice(0, 7)} with no post-pin history touches`,
  };
}

export function checkPermanentPreregistration({
  repo = REPO,
  target = 'HEAD',
  preregistrationBaseline = PREREGISTRATION_BASELINE,
  authorizedPreregistrationStates = AUTHORIZED_PREREGISTRATION_STATES,
  spawn = spawnSync,
} = {}) {
  const options = { repo, spawn };
  const baseline = resolveCommit(preregistrationBaseline, 'PREREGISTRATION T0 pin', options);
  if (!baseline.pass) return baseline;
  const resolvedTarget = resolveCommit(target, 'integrity target', options);
  if (!resolvedTarget.pass) return resolvedTarget;
  const ancestry = requireAncestor(baseline.oid, resolvedTarget.oid, 'PREREGISTRATION T0 pin', options);
  if (!ancestry.pass) return ancestry;

  const authorizations = validatePreregistrationAuthorizations(authorizedPreregistrationStates, baseline.oid, options);
  if (!authorizations.pass) return authorizations;

  const baselineFile = showFile(baseline.oid, PREREGISTRATION_PATH, options);
  if (!baselineFile.pass) return baselineFile;
  const targetFile = showFile(resolvedTarget.oid, PREREGISTRATION_PATH, options);
  if (!targetFile.pass) return targetFile;
  const baselineMarker = markerOffset(baselineFile.bytes, `T0 ${PREREGISTRATION_PATH}`);
  if (!baselineMarker.pass) return baselineMarker;
  const targetMarker = markerOffset(targetFile.bytes, `target ${PREREGISTRATION_PATH}`);
  if (!targetMarker.pass) return targetMarker;
  const baselinePrefix = baselineFile.bytes.subarray(0, baselineMarker.offset);
  const targetPrefix = targetFile.bytes.subarray(0, targetMarker.offset);
  if (!baselinePrefix.equals(targetPrefix)) {
    return failed(`${PREREGISTRATION_PATH} raw bytes before the unique section 9 marker differ from T0 ${baseline.oid}`);
  }

  const parents = gitCommand(['rev-list', '--parents', '-n', '1', baseline.oid], options);
  if (!parents.ok) return failed(`unable to find PREREGISTRATION T0 parent: ${parents.diagnostics}`);
  const parent = outputText(parents.stdout).trim().split(/\s+/)[1];
  const range = parent ? `${parent}..${resolvedTarget.oid}` : resolvedTarget.oid;
  const history = gitCommand([
    'rev-list', '--parents', '--topo-order', '--reverse', range,
  ], options);
  if (!history.ok) return failed(`unable to scan PREREGISTRATION history: ${history.diagnostics}`);

  const lines = outputText(history.stdout).trim().split('\n').filter(Boolean);
  if (lines.length === 0) return failed(`PREREGISTRATION history from T0 ${baseline.oid} to target ${resolvedTarget.oid} is empty`);
  let sawBaseline = false;
  for (const line of lines) {
    const [commit, ...commitParents] = line.trim().split(/\s+/);
    if (!OID_PATTERN.test(commit) || commitParents.some((commitParent) => !OID_PATTERN.test(commitParent))) {
      return failed(`invalid PREREGISTRATION history entry: ${line}`);
    }
    const currentBlob = preregistrationBlob(commit, options);
    if (!currentBlob.pass) return currentBlob;
    const state = authorizations.byBlob.get(currentBlob.blob);
    if (!state) {
      return failed(`unapproved PREREGISTRATION state at commit ${commit}: blob ${currentBlob.blob}`);
    }
    if (commit === baseline.oid) {
      sawBaseline = true;
      if (state.rank !== 0 || currentBlob.blob !== authorizedPreregistrationStates[0].blob) {
        return failed(`PREREGISTRATION T0 commit ${commit} has rank ${state.rank} blob ${currentBlob.blob}, expected rank 0 blob ${authorizedPreregistrationStates[0].blob}`);
      }
      continue;
    }
    if (commitParents.length === 0) return failed(`PREREGISTRATION history commit ${commit} has no parent after T0 ${baseline.oid}`);
    const parentStates = [];
    for (const commitParent of commitParents) {
      const parentBlob = preregistrationBlob(commitParent, options);
      if (!parentBlob.pass) return parentBlob;
      const parentState = authorizations.byBlob.get(parentBlob.blob);
      if (!parentState) {
        return failed(`unapproved PREREGISTRATION parent state at commit ${commit}: parent ${commitParent} blob ${parentBlob.blob}`);
      }
      parentStates.push({ commit: commitParent, blob: parentBlob.blob, rank: parentState.rank });
    }
    if (commitParents.length === 1) {
      const parentState = parentStates[0];
      if (currentBlob.blob === parentState.blob) continue;
      const expected = authorizedPreregistrationStates[parentState.rank + 1];
      const expectedDetail = expected
        ? `rank ${parentState.rank} -> ${expected.rank} at commit ${expected.commit} to blob ${expected.blob}`
        : `none after latest authorized rank ${parentState.rank}; state must remain at blob ${parentState.blob}`;
      if (!expected || commit !== expected.commit || state.rank !== expected.rank || currentBlob.blob !== expected.blob) {
        return failed(`unauthorized PREREGISTRATION transition at commit ${commit}: parent ${parentState.commit}; parent rank ${parentState.rank} blob ${parentState.blob}; result rank ${state.rank} blob ${currentBlob.blob}; expected authorized transition ${expectedDetail}`);
      }
      continue;
    }
    const maximumParentRank = Math.max(...parentStates.map(({ rank }) => rank));
    const inherited = parentStates.some(({ blob }) => blob === currentBlob.blob);
    if (!inherited || state.rank !== maximumParentRank) {
      const parentDetail = parentStates.map((parentState) => `${parentState.commit} rank ${parentState.rank} blob ${parentState.blob}`).join(', ');
      return failed(`invalid PREREGISTRATION merge at commit ${commit}: parent ranks [${parentDetail}]; result rank ${state.rank} blob ${currentBlob.blob}; result must inherit an actual parent blob at maximum parent rank ${maximumParentRank}`);
    }
  }
  if (!sawBaseline) return failed(`PREREGISTRATION history does not contain T0 commit ${baseline.oid}`);

  const targetBlob = preregistrationBlob(resolvedTarget.oid, options);
  if (!targetBlob.pass) return targetBlob;
  const targetState = authorizations.byBlob.get(targetBlob.blob);
  if (!targetState) {
    return failed(`unapproved PREREGISTRATION state at target commit ${resolvedTarget.oid}: blob ${targetBlob.blob}`);
  }
  const latest = authorizedPreregistrationStates.at(-1);
  if (targetState.rank !== latest.rank || targetBlob.blob !== latest.blob) {
    return failed(`PREREGISTRATION target commit ${resolvedTarget.oid} has target rank ${targetState.rank} blob ${targetBlob.blob}; expected latest authorized rank ${latest.rank} at commit ${latest.commit} with blob ${latest.blob}`);
  }

  const approvedPreregistrationBlobs = authorizedPreregistrationStates.map(({ blob }) => blob);
  return {
    pass: true,
    target: resolvedTarget.oid,
    approvedPreregistrationBlobs,
    detail: `${authorizedPreregistrationStates.length} approved PREREGISTRATION states cover ${lines.length} target-ancestry entries in ordered parent history; sections 1-8 equal T0 bytes`,
  };
}

export function checkRepositoryIntegrity({
  repo = REPO,
  target = 'HEAD',
  frozenBaseline = FROZEN_BASELINE,
  frozenPaths = FROZEN_PATHS,
  preregistrationBaseline = PREREGISTRATION_BASELINE,
  authorizedPreregistrationStates = AUTHORIZED_PREREGISTRATION_STATES,
  spawn = spawnSync,
} = {}) {
  const approvedPreregistrationBlobs = Array.isArray(authorizedPreregistrationStates)
    ? authorizedPreregistrationStates.map(({ blob }) => blob)
    : [];
  const shallow = gitCommand(['rev-parse', '--is-shallow-repository'], { repo, spawn });
  if (!shallow.ok) return failed(`unable to determine whether repository history is shallow: ${shallow.diagnostics}`);
  if (outputText(shallow.stdout).trim() !== 'false') return failed('repository history is shallow; full history is required');

  const instruments = checkPermanentInstruments({ repo, target, frozenBaseline, frozenPaths, spawn });
  if (!instruments.pass) return failed(instruments.detail, { target: instruments.target, approvedPreregistrationBlobs: [...approvedPreregistrationBlobs] });
  const preregistration = checkPermanentPreregistration({
    repo,
    target: instruments.target,
    preregistrationBaseline,
    authorizedPreregistrationStates,
    spawn,
  });
  if (!preregistration.pass) return failed(preregistration.detail, { target: instruments.target, approvedPreregistrationBlobs: [...approvedPreregistrationBlobs] });

  return {
    pass: true,
    target: instruments.target,
    approvedPreregistrationBlobs: [...approvedPreregistrationBlobs],
    detail: `${instruments.detail}; ${preregistration.detail}`,
  };
}

export function checkFreezeDiff({ repo = REPO, target = 'HEAD', spawn = spawnSync } = {}) {
  const permanent = checkPermanentInstruments({ repo, target, spawn });
  // Also catch UNCOMMITTED edits to the frozen paths — the loop edits the
  // working tree, so HEAD alone is not enough.
  const working = sh('git', ['diff', 'HEAD', '--', ...FROZEN_PATHS], { cwd: repo });
  const pass = permanent.pass && working.status === 0 && working.out === '';
  const failure = [permanent.pass ? '' : permanent.detail, working.status === 0 ? working.out : `git diff failed: ${working.out}`]
    .filter(Boolean).join('\n');
  return { id: 'BC-J-1', pass, detail: pass ? `${permanent.detail} (working tree clean)` : `FROZEN PATHS TOUCHED OR UNVERIFIABLE:\n${failure.slice(0, 2000)}` };
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
  // The historical BC-J-4 interval remains finite. On the real repository,
  // also reuse the permanent release invariant rather than maintaining a
  // second history implementation.
  if (repo === REPO && openingRef === PREREGISTRATION_02B_OPENING && exitRef === PREREGISTRATION_02B_EXIT) {
    const permanent = checkPermanentPreregistration({ repo, target: 'HEAD' });
    if (!permanent.pass) {
      return { id: 'BC-J-4', pass: false, detail: `permanent PREREGISTRATION integrity failed: ${permanent.detail}` };
    }
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
