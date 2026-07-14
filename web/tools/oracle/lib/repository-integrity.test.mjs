// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import * as guardrails from './guardrails.mjs';

const repos = [];
const MARKER = '## 9. Amendment log';
const FROZEN_FILES = {
  'internal/llm/prompts/system.txt': 'prompt\n',
  'eval/fixtures/seeds.json': '{}\n',
  'internal/eval/runner.go': 'package eval\n',
  'data/safety/rules.json': '{}\n',
  'eval/fixtures/move_script.json': '{}\n',
  'internal/llm/evidence.go': 'package llm\n',
  'internal/eval/mapping.go': 'package eval\n',
};

afterEach(() => {
  for (const repo of repos.splice(0)) rmSync(repo, { force: true, recursive: true });
});

function git(repo, ...args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
}

function write(repo, path, contents) {
  const absolute = join(repo, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, contents);
}

function commit(repo, message, files) {
  for (const [path, contents] of Object.entries(files)) write(repo, path, contents);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', message);
  return git(repo, 'rev-parse', 'HEAD');
}

function prereg(body = '# Frozen methodology\n', rows = '| Date | Amendment |\n') {
  return `${body}\n${MARKER}\n\n${rows}`;
}

function preregAtRank(rank) {
  const rows = Array.from({ length: rank }, (_unused, index) => `| 209${index} | authorized rank ${index + 1} |`).join('\n');
  return prereg('# Frozen methodology\n', `| Date | Amendment |\n${rows}${rows ? '\n' : ''}`);
}

function makeRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'capycook-integrity-'));
  repos.push(repo);
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.name', 'Repository Integrity Test');
  git(repo, 'config', 'user.email', 'integrity@example.invalid');
  const baseline = commit(repo, 'T0 baseline', {
    ...FROZEN_FILES,
    'docs/PREREGISTRATION.md': prereg(),
  });
  const baselineBlob = git(repo, 'rev-parse', `${baseline}:docs/PREREGISTRATION.md`);
  return { repo, baseline, baselineBlob };
}

function check(options) {
  expect(guardrails.checkRepositoryIntegrity).toBeTypeOf('function');
  return guardrails.checkRepositoryIntegrity(options);
}

function options(repo, baseline, baselineBlob, extra = {}) {
  return {
    repo,
    target: 'HEAD',
    frozenBaseline: baseline,
    preregistrationBaseline: baseline,
    authorizedPreregistrationStates: [{ rank: 0, commit: baseline, blob: baselineBlob }],
    ...extra,
  };
}

function makeAuthorizedRepo() {
  const setup = makeRepo();
  const states = [{ rank: 0, commit: setup.baseline, blob: setup.baselineBlob }];
  for (let rank = 1; rank <= 6; rank += 1) {
    const authorizedCommit = commit(setup.repo, `authorized rank ${rank}`, {
      'docs/PREREGISTRATION.md': preregAtRank(rank),
    });
    states.push({
      rank,
      commit: authorizedCommit,
      blob: git(setup.repo, 'rev-parse', `${authorizedCommit}:docs/PREREGISTRATION.md`),
    });
  }
  return { ...setup, states };
}

function orderedOptions(setup, target = 'HEAD') {
  return options(setup.repo, setup.baseline, setup.baselineBlob, {
    target,
    authorizedPreregistrationStates: setup.states,
  });
}

describe('repository-integrity source of truth', () => {
  test('the real current repository accepts all seven authorized PREREGISTRATION states', () => {
    const result = check({ target: 'HEAD' });

    expect(result.pass).toBe(true);
    expect(result.approvedPreregistrationBlobs).toHaveLength(7);
    expect(result.approvedPreregistrationBlobs.at(-1)).toBe('be5748ebf5c7cd6681fae255e286561b5a4b5745');
    expect(result.detail).toContain('7 approved PREREGISTRATION states');
  });

  test('a valid merge inherits the maximum parent rank before the exact final transition', () => {
    const setup = makeAuthorizedRepo();
    const rank4 = setup.states[4].commit;
    const rank5 = setup.states[5].commit;
    git(setup.repo, 'branch', 'side', rank4);
    git(setup.repo, 'checkout', '-q', 'side');
    commit(setup.repo, 'ordinary side work at rank 4', { 'side.txt': 'side\n' });
    git(setup.repo, 'checkout', '-q', 'master');
    git(setup.repo, 'reset', '--hard', rank5);
    git(setup.repo, 'merge', '--no-ff', '-m', 'valid rank-5 merge', 'side');
    const merge = git(setup.repo, 'rev-parse', 'HEAD');
    const rank6 = commit(setup.repo, 'authorized rank 6 after merge', {
      'docs/PREREGISTRATION.md': preregAtRank(6),
    });
    setup.states[6] = {
      rank: 6,
      commit: rank6,
      blob: git(setup.repo, 'rev-parse', `${rank6}:docs/PREREGISTRATION.md`),
    };

    const result = check(orderedOptions(setup));

    expect(git(setup.repo, 'rev-parse', `${merge}:docs/PREREGISTRATION.md`)).toBe(setup.states[5].blob);
    expect(result.pass).toBe(true);
  });

  test('a later ordinary commit cannot roll rank 6 back to the older approved rank 5', () => {
    const setup = makeAuthorizedRepo();
    const rollback = commit(setup.repo, 'unauthorized rollback', {
      'docs/PREREGISTRATION.md': preregAtRank(5),
    });

    const result = check(orderedOptions(setup));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain(rollback);
    expect(result.detail).toContain('parent rank 6');
    expect(result.detail).toContain('result rank 5');
    expect(result.detail).toContain('expected authorized transition');
  });

  test('ordinary rollback then restore cannot hide behind a final rank-6 blob', () => {
    const setup = makeAuthorizedRepo();
    const rollback = commit(setup.repo, 'unauthorized rollback', {
      'docs/PREREGISTRATION.md': preregAtRank(5),
    });
    commit(setup.repo, 'ordinary restore', {
      'docs/PREREGISTRATION.md': preregAtRank(6),
    });

    const result = check(orderedOptions(setup));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain(rollback);
    expect(result.detail).toContain('parent rank 6');
    expect(result.detail).toContain('result rank 5');
  });

  test('an ordinary commit cannot jump directly from rank 2 to rank 6', () => {
    const setup = makeAuthorizedRepo();
    git(setup.repo, 'reset', '--hard', setup.states[2].commit);
    const jump = commit(setup.repo, 'unauthorized direct jump', {
      'docs/PREREGISTRATION.md': preregAtRank(6),
    });

    const result = check(orderedOptions(setup));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain(jump);
    expect(result.detail).toContain('parent rank 2');
    expect(result.detail).toContain('result rank 6');
    expect(result.detail).toContain(`rank 2 -> 3 at commit ${setup.states[3].commit}`);
  });

  test('an ordinary commit cannot reuse the exact next-rank blob without the authorized commit id', () => {
    const setup = makeAuthorizedRepo();
    git(setup.repo, 'reset', '--hard', setup.states[2].commit);
    const reuse = commit(setup.repo, 'unauthorized rank-3 blob reuse', {
      'docs/PREREGISTRATION.md': preregAtRank(3),
    });

    const result = check(orderedOptions(setup));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain(reuse);
    expect(result.detail).toContain(`rank 2 -> 3 at commit ${setup.states[3].commit}`);
    expect(result.detail).toContain(setup.states[3].blob);
  });

  test('a merge cannot downgrade below a higher-rank parent', () => {
    const setup = makeAuthorizedRepo();
    git(setup.repo, 'branch', 'rank-5-side', setup.states[5].commit);
    git(setup.repo, 'checkout', '-q', 'rank-5-side');
    commit(setup.repo, 'ordinary rank-5 side work', { 'side.txt': 'side\n' });
    git(setup.repo, 'checkout', '-q', 'master');
    git(setup.repo, 'merge', '--no-ff', '--no-commit', 'rank-5-side');
    write(setup.repo, 'docs/PREREGISTRATION.md', preregAtRank(5));
    git(setup.repo, 'add', 'docs/PREREGISTRATION.md');
    git(setup.repo, 'commit', '-m', 'unauthorized merge downgrade');
    const merge = git(setup.repo, 'rev-parse', 'HEAD');

    const result = check(orderedOptions(setup));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain(merge);
    expect(result.detail).toContain('parent ranks');
    expect(result.detail).toContain('maximum parent rank 6');
    expect(result.detail).toContain('result rank 5');
  });

  test('a merge cannot create an approved state not inherited from either parent', () => {
    const setup = makeAuthorizedRepo();
    git(setup.repo, 'branch', 'rank-4-side', setup.states[4].commit);
    git(setup.repo, 'checkout', '-q', 'rank-4-side');
    commit(setup.repo, 'ordinary rank-4 side work', { 'side.txt': 'side\n' });
    git(setup.repo, 'checkout', '-q', 'master');
    git(setup.repo, 'reset', '--hard', setup.states[5].commit);
    git(setup.repo, 'merge', '--no-ff', '--no-commit', 'rank-4-side');
    write(setup.repo, 'docs/PREREGISTRATION.md', preregAtRank(6));
    git(setup.repo, 'add', 'docs/PREREGISTRATION.md');
    git(setup.repo, 'commit', '-m', 'unauthorized merge-created state');
    const merge = git(setup.repo, 'rev-parse', 'HEAD');

    const result = check(orderedOptions(setup));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain(merge);
    expect(result.detail).toContain('parent ranks');
    expect(result.detail).toContain('maximum parent rank 5');
    expect(result.detail).toContain('result rank 6');
    expect(result.detail).toContain('must inherit');
  });

  test('a target ending below the latest authorized rank fails closed', () => {
    const setup = makeAuthorizedRepo();

    const result = check(orderedOptions(setup, setup.states[5].commit));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain(setup.states[5].commit);
    expect(result.detail).toContain('target rank 5');
    expect(result.detail).toContain(`latest authorized rank 6 at commit ${setup.states[6].commit}`);
  });

  test('a permanent instrument mutate then revert fails despite identical endpoint bytes', () => {
    const { repo, baseline, baselineBlob } = makeRepo();
    const mutation = commit(repo, 'mutate frozen instrument', {
      'internal/eval/runner.go': 'package eval // unauthorized\n',
    });
    const revert = commit(repo, 'restore frozen instrument bytes', {
      'internal/eval/runner.go': FROZEN_FILES['internal/eval/runner.go'],
    });
    expect(git(repo, 'diff', baseline, 'HEAD', '--', 'internal/eval/runner.go')).toBe('');

    const result = check(options(repo, baseline, baselineBlob));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain('permanently frozen paths have post-pin history touches');
    expect(result.detail).toContain(mutation);
    expect(result.detail).toContain(revert);
  });

  test('a section 1-8 mutate then revert fails although target prefix equals T0', () => {
    const { repo, baseline, baselineBlob } = makeRepo();
    const mutation = commit(repo, 'mutate frozen methodology', {
      'docs/PREREGISTRATION.md': prereg('# Mutated methodology\n'),
    });
    commit(repo, 'restore frozen methodology bytes', {
      'docs/PREREGISTRATION.md': prereg(),
    });

    const result = check(options(repo, baseline, baselineBlob));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain('unapproved PREREGISTRATION state');
    expect(result.detail).toContain(mutation);
  });

  test.each([
    ['add', prereg('# Frozen methodology\n', '| Date | Amendment |\n| 2099 | unauthorized |\n')],
    ['edit', prereg('# Frozen methodology\n', '| Date | Edited unauthorized row |\n')],
    ['delete', prereg('# Frozen methodology\n', '')],
  ])('an unapproved section 9 %s fails', (_kind, contents) => {
    const { repo, baseline, baselineBlob } = makeRepo();
    const bad = commit(repo, 'unapproved amendment-log state', {
      'docs/PREREGISTRATION.md': contents,
    });

    const result = check(options(repo, baseline, baselineBlob));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain('unapproved PREREGISTRATION state');
    expect(result.detail).toContain(bad);
  });

  test('an unapproved section 9 mutate then revert fails', () => {
    const { repo, baseline, baselineBlob } = makeRepo();
    const mutation = commit(repo, 'temporarily add unauthorized amendment', {
      'docs/PREREGISTRATION.md': prereg('# Frozen methodology\n', '| Date | Amendment |\n| 2099 | unauthorized |\n'),
    });
    commit(repo, 'restore approved amendment log', {
      'docs/PREREGISTRATION.md': prereg(),
    });

    const result = check(options(repo, baseline, baselineBlob));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain(mutation);
  });

  test.each([
    ['missing target', 'missing-target'],
    ['zero target', '0000000000000000000000000000000000000000'],
  ])('%s fails closed', (_label, target) => {
    const { repo, baseline, baselineBlob } = makeRepo();

    const result = check(options(repo, baseline, baselineBlob, { target }));

    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/target|zero/i);
  });

  test('a missing fixed pin fails closed', () => {
    const { repo, baselineBlob } = makeRepo();

    const result = check(options(repo, 'missing-pin', baselineBlob));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain('missing-pin');
  });

  test('a shallow checkout fails closed even when its target files are present', () => {
    const source = makeRepo();
    commit(source.repo, 'descendant', { 'ordinary.txt': 'ok\n' });
    const repo = mkdtempSync(join(tmpdir(), 'capycook-integrity-shallow-'));
    repos.push(repo);
    execFileSync('git', ['clone', '-q', '--depth', '1', `file://${source.repo}`, repo]);

    const result = check(options(repo, source.baseline, source.baselineBlob));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain('shallow');
  });

  test.each([
    ['missing marker', '# Frozen methodology\n'],
    ['duplicate marker', prereg() + `\n${MARKER}\n`],
  ])('%s fails closed', (_label, contents) => {
    const { repo, baseline, baselineBlob } = makeRepo();
    commit(repo, 'bad marker state', { 'docs/PREREGISTRATION.md': contents });
    const targetBlob = git(repo, 'rev-parse', 'HEAD:docs/PREREGISTRATION.md');

    const result = check(options(repo, baseline, baselineBlob, {
      authorizedPreregistrationStates: [
        { rank: 0, commit: baseline, blob: baselineBlob },
        { rank: 1, commit: git(repo, 'rev-parse', 'HEAD'), blob: targetBlob },
      ],
    }));

    expect(result.pass).toBe(false);
    expect(result.detail).toMatch(/marker.*exactly once/i);
  });

  test('Git spawn errors fail closed and include spawnSync().error', () => {
    const { repo, baseline, baselineBlob } = makeRepo();
    const spawn = () => ({
      status: null,
      stdout: '',
      stderr: '',
      error: new Error('synthetic spawn failure'),
    });

    const result = check(options(repo, baseline, baselineBlob, { spawn }));

    expect(result.pass).toBe(false);
    expect(result.detail).toContain('synthetic spawn failure');
  });
});
