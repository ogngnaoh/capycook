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
export const APPROVED_PREREGISTRATION_BLOBS = [
  '4b5b914e8b3d54f4dbad846ddc1693cec51e50c6',
  '0dffce5ae7d85de759bae077b3d9e1aceb51c559',
  'b54b08d32510e690fe887b9ff05e72b45c7d0d1f',
  'aef4743448e5bece8ef5f32338a244593060d035',
  'cc17b3446f47b9403781eb9b73132b200666d8de',
  '0571364fe6f028fd84009370b197b94d31126443',
  'be5748ebf5c7cd6681fae255e286561b5a4b5745',
];
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
  approvedPreregistrationBlobs = APPROVED_PREREGISTRATION_BLOBS,
  spawn = spawnSync,
} = {}) {
  const options = { repo, spawn };
  const baseline = resolveCommit(preregistrationBaseline, 'PREREGISTRATION T0 pin', options);
  if (!baseline.pass) return baseline;
  const resolvedTarget = resolveCommit(target, 'integrity target', options);
  if (!resolvedTarget.pass) return resolvedTarget;
  const ancestry = requireAncestor(baseline.oid, resolvedTarget.oid, 'PREREGISTRATION T0 pin', options);
  if (!ancestry.pass) return ancestry;

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
    'log', '--full-history', '--reverse', '--format=%H', range, '--', PREREGISTRATION_PATH,
  ], options);
  if (!history.ok) return failed(`unable to scan PREREGISTRATION history: ${history.diagnostics}`);

  const approved = new Set(approvedPreregistrationBlobs);
  const commits = outputText(history.stdout).trim().split(/\s+/).filter(Boolean);
  for (const commit of commits) {
    const blobResult = gitCommand(['rev-parse', '--verify', `${commit}:${PREREGISTRATION_PATH}`], options);
    if (!blobResult.ok) {
      return failed(`PREREGISTRATION state missing or unreadable at commit ${commit}: ${blobResult.diagnostics}`);
    }
    const blob = outputText(blobResult.stdout).trim();
    if (!approved.has(blob)) {
      return failed(`unapproved PREREGISTRATION state at commit ${commit}: blob ${blob}`);
    }
  }

  return {
    pass: true,
    target: resolvedTarget.oid,
    approvedPreregistrationBlobs: [...approvedPreregistrationBlobs],
    detail: `${approvedPreregistrationBlobs.length} approved PREREGISTRATION states cover ${commits.length} target-ancestry entries; sections 1-8 equal T0 bytes`,
  };
}

export function checkRepositoryIntegrity({
  repo = REPO,
  target = 'HEAD',
  frozenBaseline = FROZEN_BASELINE,
  frozenPaths = FROZEN_PATHS,
  preregistrationBaseline = PREREGISTRATION_BASELINE,
  approvedPreregistrationBlobs = APPROVED_PREREGISTRATION_BLOBS,
  spawn = spawnSync,
} = {}) {
  const shallow = gitCommand(['rev-parse', '--is-shallow-repository'], { repo, spawn });
  if (!shallow.ok) return failed(`unable to determine whether repository history is shallow: ${shallow.diagnostics}`);
  if (outputText(shallow.stdout).trim() !== 'false') return failed('repository history is shallow; full history is required');

  const instruments = checkPermanentInstruments({ repo, target, frozenBaseline, frozenPaths, spawn });
  if (!instruments.pass) return failed(instruments.detail, { target: instruments.target, approvedPreregistrationBlobs: [...approvedPreregistrationBlobs] });
  const preregistration = checkPermanentPreregistration({
    repo,
    target: instruments.target,
    preregistrationBaseline,
    approvedPreregistrationBlobs,
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

function exactEventOid(value, label) {
  if (!value) return failed(`${label} is missing`);
  if (value === ZERO_OID) return failed(`${label} is the zero object id`);
  if (!OID_PATTERN.test(value)) return failed(`${label} must be an exact 40-character Git object id, got ${value}`);
  return { pass: true, oid: value };
}

export function resolveIntegrityEvent({
  repo = REPO,
  eventName,
  event,
  checkedOutSha,
  spawn = spawnSync,
} = {}) {
  if (!event || typeof event !== 'object') return failed('event payload is missing or invalid');
  const checked = exactEventOid(checkedOutSha, 'checked-out SHA');
  if (!checked.pass) return checked;
  const checkedCommit = resolveCommit(checked.oid, 'checked-out SHA', { repo, spawn });
  if (!checkedCommit.pass) return checkedCommit;

  if (eventName === 'pull_request') {
    const base = exactEventOid(event.pull_request?.base?.sha, 'pull request base SHA');
    if (!base.pass) return base;
    const head = exactEventOid(event.pull_request?.head?.sha, 'pull request head SHA');
    if (!head.pass) return head;
    for (const [label, oid] of [['pull request base SHA', base.oid], ['pull request head SHA', head.oid]]) {
      const commit = resolveCommit(oid, label, { repo, spawn });
      if (!commit.pass) return commit;
      const ancestry = requireAncestor(oid, checkedCommit.oid, label, { repo, spawn });
      if (!ancestry.pass) return ancestry;
    }
    return {
      pass: true,
      kind: 'pull-request',
      target: checkedCommit.oid,
      base: base.oid,
      head: head.oid,
      detail: `pull request target ${checkedCommit.oid}; immutable base ${base.oid}; immutable head ${head.oid}`,
    };
  }

  if (eventName !== 'push') return failed(`unsupported event ${eventName || '<missing>'}`);
  const ref = event.ref;
  if (!ref || typeof ref !== 'string') return failed('push ref is missing');
  if (typeof event.created !== 'boolean' || typeof event.deleted !== 'boolean') {
    return failed(`push ref ${ref} must provide boolean created and deleted fields`);
  }
  if (event.deleted || event.after === ZERO_OID) return failed(`push ref ${ref} is a deletion and has no integrity target`);
  const after = exactEventOid(event.after, 'push after SHA');
  if (!after.pass) return after;

  if (ref.startsWith('refs/heads/')) {
    if (after.oid !== checkedCommit.oid) {
      return failed(`checked-out SHA ${checkedCommit.oid} does not equal immutable push after target ${after.oid}`);
    }
    const afterCommit = resolveCommit(after.oid, 'push after SHA', { repo, spawn });
    if (!afterCommit.pass) return afterCommit;
    const created = event.created;
    if (created) {
      if (event.before !== ZERO_OID) return failed(`new branch ${ref} must have zero before SHA`);
      return {
        pass: true,
        kind: 'branch-create',
        ref,
        target: after.oid,
        before: null,
        detail: `new branch ${ref}; immutable target ${after.oid}; whole-history checks use fixed pins`,
      };
    }
    if (event.before === ZERO_OID) return failed(`existing branch ${ref} has zero before SHA but created is false`);
    const before = exactEventOid(event.before, 'push before SHA');
    if (!before.pass) return before;
    const beforeCommit = resolveCommit(before.oid, 'push before SHA', { repo, spawn });
    if (!beforeCommit.pass) return beforeCommit;
    return {
      pass: true,
      kind: 'branch-push',
      ref,
      target: after.oid,
      before: before.oid,
      detail: `branch ${ref}; immutable before ${before.oid}; immutable target ${after.oid}; before..after is diagnostic only`,
    };
  }

  if (ref.startsWith('refs/tags/')) {
    const refObject = gitCommand(['rev-parse', '--verify', ref], { repo, spawn });
    if (!refObject.ok) return failed(`exact tag ref ${ref} is missing: ${refObject.diagnostics}`);
    const tagObject = outputText(refObject.stdout).trim();
    const type = gitCommand(['cat-file', '-t', tagObject], { repo, spawn });
    if (!type.ok) return failed(`unable to inspect exact tag ref ${ref}: ${type.diagnostics}`);
    if (outputText(type.stdout).trim() !== 'tag') return failed(`exact tag ref ${ref} must be an annotated tag`);
    const peel = gitCommand(['rev-parse', '--verify', `${ref}^{commit}`], { repo, spawn });
    if (!peel.ok) return failed(`annotated tag ${ref} cannot peel to a commit: ${peel.diagnostics}`);
    const peeledTarget = outputText(peel.stdout).trim();
    if (peeledTarget !== checkedCommit.oid) {
      return failed(`annotated tag ${ref} peels to ${peeledTarget}, not checked-out target ${checkedCommit.oid}`);
    }
    if (after.oid !== tagObject && after.oid !== peeledTarget) {
      return failed(`tag event after ${after.oid} matches neither exact tag object ${tagObject} nor peeled target ${peeledTarget}`);
    }
    const created = event.created;
    if (created && event.before !== ZERO_OID) return failed(`new annotated tag ${ref} must have zero before SHA`);
    if (!created) {
      if (event.before === ZERO_OID) return failed(`replacement tag ${ref} has zero before object but created is false`);
      const before = exactEventOid(event.before, 'tag replacement before SHA');
      if (!before.pass) return before;
      const beforeType = gitCommand(['cat-file', '-t', before.oid], { repo, spawn });
      if (!beforeType.ok) return failed(`unable to inspect prior tag object ${before.oid}: ${beforeType.diagnostics}`);
      if (outputText(beforeType.stdout).trim() !== 'tag') {
        return failed(`tag replacement before ${before.oid} must identify the prior annotated tag object`);
      }
      return {
        pass: true,
        kind: 'annotated-tag-replace',
        ref,
        target: peeledTarget,
        beforeTagObject: before.oid,
        tagObject,
        detail: `annotated tag replacement ${ref}; old tag object ${before.oid}; new tag object ${tagObject}; peeled target ${peeledTarget}`,
      };
    }
    return {
      pass: true,
      kind: 'annotated-tag-create',
      ref,
      target: peeledTarget,
      before: null,
      tagObject,
      detail: `annotated tag creation ${ref}; tag object ${tagObject}; peeled immutable target ${peeledTarget}`,
    };
  }

  return failed(`push ref ${ref} is neither refs/heads/* nor refs/tags/*`);
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
